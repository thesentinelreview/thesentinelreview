"""
Translator — converts foreign-language raw posts to English before extraction.

Spec: apps/ingest/sentinel/pipeline/TRANSLATOR_SPEC.md

Pre-filters in code (empty, English-by-heuristic, link-only) avoid API calls
on posts that don't need translation. Everything else goes to claude-haiku-4-5
with a register-preserving system prompt. Failures are non-blocking: a NULL
translation means the Source Feed renders the original text with an
"unavailable" indicator and the extractor still runs on the original.
"""
from __future__ import annotations

import json
import re

import anthropic
import structlog

from sentinel.config import settings
from sentinel.models import TranslationResult

log = structlog.get_logger()

_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Hard cap on input length sent to the model.
MAX_INPUT_CHARS = 4000
TRUNCATION_SUFFIX = "[…truncated]"

# Pre-filter thresholds (see spec §Pre-translation pipeline)
ENGLISH_ASCII_RATIO = 0.95
LINK_ONLY_MIN_CHARS = 5

# Sanity-check bounds on translation length vs source length.
LENGTH_RATIO_MIN = 0.2
LENGTH_RATIO_MAX = 4.0

_URL_RE = re.compile(r"https?://\S+|t\.me/\S+|www\.\S+", re.IGNORECASE)

# Non-Latin Unicode ranges we expect to see in OSINT source feeds.
# Pairs are (start, end) inclusive.
_NON_LATIN_RANGES: tuple[tuple[int, int], ...] = (
    (0x0400, 0x04FF),   # Cyrillic
    (0x0500, 0x052F),   # Cyrillic Supplement
    (0x2DE0, 0x2DFF),   # Cyrillic Extended-A
    (0xA640, 0xA69F),   # Cyrillic Extended-B
    (0x0590, 0x05FF),   # Hebrew
    (0x0600, 0x06FF),   # Arabic
    (0x0750, 0x077F),   # Arabic Supplement
    (0x08A0, 0x08FF),   # Arabic Extended-A
    (0x0900, 0x097F),   # Devanagari
    (0x0E00, 0x0E7F),   # Thai
    (0x1000, 0x109F),   # Myanmar (Burmese)
    (0x3040, 0x309F),   # Hiragana
    (0x30A0, 0x30FF),   # Katakana
    (0x4E00, 0x9FFF),   # CJK Unified Ideographs
    (0xAC00, 0xD7AF),   # Hangul Syllables
)


_SYSTEM_PROMPT = """You are a translator for an open-source intelligence (OSINT) conflict-monitoring platform. You translate posts from Russian, Ukrainian, Arabic, Persian/Farsi, Hebrew, Burmese, French, Spanish, and other languages into clear, faithful English.

Your translations are read by analysts, journalists, and researchers who need to distinguish confirmed events from claims, official statements from rumor, and primary sources from re-reporting. Errors of editorialization, register, or epistemic framing can change the meaning of a post in operationally significant ways.

You follow ten strict rules:

1. PRESERVE EPISTEMIC MARKERS. Words and phrases that mark a statement as a claim, report, allegation, or rumor must be preserved in translation. Examples: "сообщается" → "it is reported"; "по словам" → "according to"; "якобы" → "allegedly"; "утверждают" → "they claim"; "حسب ما ورد" → "according to reports"; "ادعا کرد" → "claimed". Never drop these markers.

2. PRESERVE PROPER NOUNS in the form most commonly used in English-language reporting:
   - Ukrainian place names: use Ukrainian transliteration (Kyiv, Pokrovsk, Kharkiv, Mykolaiv, Zaporizhzhia)
   - Russian place names: use Russian transliteration (Belgorod, Rostov, Voronezh)
   - Disputed/Crimean names: use the Ukrainian form (Sevastopol is acceptable due to historical usage)
   - Military units: preserve official designations exactly (IRGC, AFU, RSF, SAF, Tatmadaw, IDF, Hezbollah, Hamas)
   - Weapon systems: preserve NATO designations where standard (Iskander, Kinzhal, Shahed-136, Bayraktar TB2)
   - Acronyms: preserve original where the acronym is the standard English form; expand only when not (ЗСУ → AFU; ОТГ → "Operational-Tactical Group" on first use, OTG after)

3. PRESERVE REGISTER. Translate terse posts as terse English. Translate fragmented or ungrammatical source as parseable but still fragmented English. Do not formalize informal voice. Do not add transitional phrases or context the source did not contain.

4. PRESERVE BIAS. If the source describes Russian forces using neutral or favorable language, translate neutrally or favorably. If a source describes them using pejorative or hostile language, preserve that. Do not "balance" a source's framing — bias is information.

5. NEVER ADD INFORMATION. Do not insert dates, names, locations, casualty figures, or any other facts not present in the source. Do not add explanatory context. Do not gloss acronyms unless the source itself does.

6. NEVER SUMMARIZE. The translation should be roughly the same length as the source, preserving paragraph and line break structure.

7. NEVER CORRECT. If the source contains a factual error (wrong unit name, wrong date, wrong location), translate the error faithfully. The verification layer downstream catches these — your job is fidelity.

8. PRESERVE LITERALLY: URLs, @mentions, #hashtags (do not translate hashtag content), numerals (use digits, not number words), times, dates, and email addresses.

9. PRESERVE EMOJIS exactly as in source.

10. NEUTRAL TRANSLATION OF AMBIGUOUS TERMS. When a Russian or Ukrainian source uses words that have both neutral and loaded translations (e.g. "ликвидация" → "elimination" / "killing" / "neutralization"), choose the translation that most precisely matches the source's register without adding or removing weight. When uncertain, choose the more literal option.

You return JSON only, with two fields:

  {"language": "<2-char ISO 639-1 code of source language>", "translation": "<English text>"}

If the source is already English, return:

  {"language": "en", "translation": null}

If the source contains text in multiple languages, identify the primary language (the language of the majority of substantive text) and translate the entire post into English, preserving any segments that were already English unchanged.

Return only the JSON object. No preamble, no explanation, no markdown fencing."""


# ---------------------------------------------------------------------------
# Pre-filter
# ---------------------------------------------------------------------------

def _looks_english(text: str) -> bool:
    """ASCII-ratio heuristic: ≥95% printable ASCII AND zero non-Latin chars."""
    if not text:
        return False
    ascii_count = 0
    non_latin = 0
    for ch in text:
        cp = ord(ch)
        if 0x20 <= cp <= 0x7E:
            ascii_count += 1
        else:
            for lo, hi in _NON_LATIN_RANGES:
                if lo <= cp <= hi:
                    non_latin += 1
                    break
    ratio = ascii_count / len(text)
    return ratio >= ENGLISH_ASCII_RATIO and non_latin == 0


def _strip_urls(text: str) -> str:
    return _URL_RE.sub("", text)


def _prefilter(text: str) -> TranslationResult | None:
    """
    Returns a TranslationResult if the post should NOT hit the API,
    or None if the model call should proceed.
    """
    if not text or not text.strip():
        return TranslationResult(skipped=True, skip_reason="empty")

    # Link-only check runs before the English heuristic so URL-only posts
    # (which are pure ASCII and would otherwise be classified "en") get
    # the more specific link_only reason and a NULL language.
    stripped = _strip_urls(text).strip()
    if len(stripped) < LINK_ONLY_MIN_CHARS:
        return TranslationResult(skipped=True, skip_reason="link_only")

    if _looks_english(text):
        return TranslationResult(language="en", skipped=True, skip_reason="english_heuristic")

    return None


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def _parse_response(response_text: str, *, source_text: str) -> TranslationResult:
    """Parse the model's JSON response with defensive checks. Never raises."""
    try:
        parsed = json.loads(response_text.strip())
    except json.JSONDecodeError:
        log.warning("translator_invalid_json", response_preview=response_text[:200])
        return TranslationResult()

    if not isinstance(parsed, dict):
        log.warning("translator_response_not_object", response_preview=response_text[:200])
        return TranslationResult()

    lang = parsed.get("language")
    translation = parsed.get("translation")

    if lang is not None and (not isinstance(lang, str) or len(lang) != 2):
        log.warning("translator_invalid_language", language=lang)
        lang = None

    if translation is not None and not isinstance(translation, str):
        log.warning("translator_invalid_translation_type", got=type(translation).__name__)
        translation = None

    if translation:
        ratio = len(translation) / max(len(source_text), 1)
        if ratio > LENGTH_RATIO_MAX or ratio < LENGTH_RATIO_MIN:
            log.warning("translator_suspicious_length_ratio", ratio=round(ratio, 2))
            # Still keep the translation — downstream review can decide.

    return TranslationResult(language=lang, translation=translation)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def translate_post(
    text: str,
    *,
    source: dict,
) -> tuple[TranslationResult, dict | None]:
    """
    Translate a raw post to English.

    Returns (result, llm_meta) where llm_meta is the audit-log dict if the
    Anthropic API was called, or None if a pre-filter skipped the call.
    """
    skipped = _prefilter(text)
    if skipped is not None:
        log.debug("translator_skipped", reason=skipped.skip_reason)
        return skipped, None

    truncated = False
    if len(text) > MAX_INPUT_CHARS:
        text_for_model = text[: MAX_INPUT_CHARS - len(TRUNCATION_SUFFIX)] + TRUNCATION_SUFFIX
        truncated = True
        log.warning("translator_truncated_input", original_len=len(text))
    else:
        text_for_model = text

    user_message = (
        "Translate the following post.\n\n"
        f"Source platform: {source.get('platform', 'unknown')}\n"
        f"Source handle: {source.get('handle', 'unknown')}\n"
        f"Source trust tier: {source.get('trust_tier', 'unknown')}\n\n"
        "Post text:\n<<<\n"
        f"{text_for_model}\n"
        ">>>"
    )

    response = _client.messages.create(
        model=settings.anthropic_model_translate,
        max_tokens=2000,
        temperature=0.0,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    response_text = next(
        (b.text for b in response.content if b.type == "text"),
        "",
    )

    result = _parse_response(response_text, source_text=text_for_model)

    llm_meta = {
        "model": response.model,
        "prompt": user_message,
        "response": response_text,
        "prompt_tokens": response.usage.input_tokens,
        "completion_tokens": response.usage.output_tokens,
    }

    log.debug(
        "translator_complete",
        language=result.language,
        translated=result.translation is not None,
        truncated=truncated,
    )

    return result, llm_meta
