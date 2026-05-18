# Source Feed Translation — Prompt Spec

> **Purpose:** Drop-in specification for `apps/ingest/sentinel/pipeline/translator.py`. Tuned for the specific challenges of OSINT conflict content (Russian milblogger posts, Iranian state press, Arabic press wires, Burmese activist channels).
>
> **Target model:** `claude-haiku-4-5`
>
> **Last updated:** May 18, 2026.

---

## Design principles

Translation for conflict OSINT is unusually high-stakes for a "machine translation" task. Five principles drive every rule below:

1. **Preserve register.** A terse Russian milblogger post should read terse in English. Do not smooth out fragmentation, do not formalize informal voice. The user is reading a primary source, not an editor's polish.
2. **Preserve epistemic markers.** Words like *сообщается*, *по словам*, *утверждают*, *якобы*, *حسب ما ورد*, ادعا کرد — these convert claims into confirmed events when mistranslated or dropped. Treat them as inviolable.
3. **Preserve names.** Place names, unit designations, weapon systems, people. Standard English-language reporting conventions for transliteration (Pokrovsk, Kyiv, IRGC, AFU). When in doubt, keep the original form rather than guess.
4. **No editorializing.** Do not add context, smooth biased framing, or correct factual errors in source. A biased pro-Russian post should read pro-Russian in English. Bias is information.
5. **No summarization.** One source sentence → roughly one English sentence. Same paragraph structure. Same line breaks.

---

## Pre-translation pipeline (code, not prompt)

Before calling the model, the translator script runs these checks. These reduce cost and prevent garbage-in calls:

### Skip translation if any of:

1. **Empty or whitespace-only.** Set `language=null`, `translated_text=null`.
2. **Likely English by character heuristic.** Compute these on the raw text:
   - `ascii_ratio = (printable ASCII chars) / (total chars)`
   - `non_latin_count = count of chars in Cyrillic, Arabic, Hebrew, CJK, Burmese, Thai, Devanagari ranges`
   - If `ascii_ratio >= 0.95 AND non_latin_count == 0`, treat as English. Set `language='en'`, `translated_text=null`. Skip API call.
3. **Link-only post.** Strip URLs; if remaining text is fewer than 5 non-whitespace characters, treat as a "link-only" post. Set `language=null`, `translated_text=null` (preserves the original URL in `text`; user clicks through).
4. **Excessive length.** If post is over 4,000 characters (rare on Telegram, possible on RSS), truncate at 4,000 with `[…truncated]` suffix before translation. Log a warning.

### Always preserve in the output, untouched:

- URLs
- @mentions
- #hashtags (do not translate hashtag content)
- Emojis
- Numerals (digits, not number words)
- Email addresses

### Rate limiting

Call `claude-haiku-4-5` no more than 5 requests/second per ingest worker to stay well under any rate limits. Each ingest cycle runs every 30 minutes, so even at 5000 posts/day this is comfortably within limits.

---

## The prompt

### System prompt

```
You are a translator for an open-source intelligence (OSINT) conflict-monitoring platform. You translate posts from Russian, Ukrainian, Arabic, Persian/Farsi, Hebrew, Burmese, French, Spanish, and other languages into clear, faithful English.

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

Return only the JSON object. No preamble, no explanation, no markdown fencing.
```

### User prompt template

```
Translate the following post.

Source platform: {platform}        # one of: telegram, rss, x
Source handle: {source_handle}     # e.g., DefMon3, IranIntl_En, iranintl_rss
Source trust tier: {trust_tier}    # 1-3 (does not affect translation, included for logging only)

Post text:
<<<
{post_text}
>>>
```

The triple-bracketed delimiter (`<<<` and `>>>`) helps the model identify the input boundary even when the post contains quotation marks, brackets, or code-like content.

---

## Model parameters

| Parameter | Value | Reason |
|---|---|---|
| `model` | `claude-haiku-4-5` | Cheapest model with strong translation quality |
| `max_tokens` | `2000` | Enough for any single post; truncation at 4000 chars input maps to ~2000 token output worst case |
| `temperature` | `0.0` | Deterministic, no creativity for translation |
| `system` | (the system prompt above) | |

---

## Output handling (code)

After receiving the model response:

```python
import json

def parse_translation_response(response_text: str) -> dict:
    """
    Returns {"language": str | None, "translation": str | None}.
    Stores NULL translation on any parse failure; we log but do not block ingest.
    """
    try:
        parsed = json.loads(response_text.strip())
    except json.JSONDecodeError:
        # Model didn't return valid JSON. Log and skip translation for this post.
        log_warning("translator: invalid JSON response", response_text)
        return {"language": None, "translation": None}

    lang = parsed.get("language")
    translation = parsed.get("translation")

    # Sanity check: language code is 2 chars
    if lang and (not isinstance(lang, str) or len(lang) != 2):
        log_warning("translator: invalid language code", lang)
        lang = None

    # Sanity check: translation length not wildly different from source
    # (>4x source length suggests hallucination; <0.2x suggests truncation/summarization)
    if translation:
        ratio = len(translation) / max(len(source_text), 1)
        if ratio > 4.0 or ratio < 0.2:
            log_warning("translator: suspicious length ratio", ratio)
            # Still store it, but flag for review

    return {"language": lang, "translation": translation}
```

Failures are non-blocking. A post with `translated_text = NULL` simply renders the original text in the Source Feed with a small "translation unavailable" indicator. The ingest pipeline continues.

---

## Test cases (verification before shipping)

Run these eight inputs through the translator and verify outputs match expectations. These cover the high-risk cases.

### Test 1: Russian milblogger with epistemic marker

**Input:**
```
По данным украинских источников, российские войска якобы вошли в восточные окраины Покровска. Подтверждения нет.
```

**Expected output language:** `ru`

**Expected output translation:**
> "According to Ukrainian sources, Russian forces allegedly entered the eastern outskirts of Pokrovsk. There is no confirmation."

**What we're checking:** "По данным" → "according to" preserved. "якобы" → "allegedly" preserved. "Подтверждения нет" → "There is no confirmation" preserved as a distinct sentence (not merged).

### Test 2: Ukrainian source with weapon system + acronym

**Input:**
```
ЗСУ знищили російський танк Т-90М біля Бахмута за допомогою Javelin.
```

**Expected output translation:**
> "The AFU destroyed a Russian T-90M tank near Bakhmut using a Javelin."

**What we're checking:** ЗСУ → AFU. T-90M preserved exactly. Bakhmut transliterated (Ukrainian form). Javelin preserved. No editorialization.

### Test 3: Arabic Iran source with date and number

**Input:**
```
أعلن الحرس الثوري الإيراني عن مقتل 3 من قادته في غارة جوية إسرائيلية في دمشق يوم 15 مايو.
```

**Expected output language:** `ar`

**Expected output translation:**
> "The IRGC announced the deaths of 3 of its commanders in an Israeli airstrike in Damascus on May 15."

**What we're checking:** IRGC preserved (not "Iranian Revolutionary Guard Corps" expanded). Numerals preserved as digits. Date preserved. Damascus transliterated. No added context about Israel-Iran tensions.

### Test 4: Already-English RSS post

**Input:**
```
Reuters: Russia launched 47 drones overnight; Ukrainian air defense intercepted 36, the Ukrainian Air Force said.
```

**Expected output language:** `en`

**Expected output translation:** `null`

**What we're checking:** Pre-filter heuristic correctly identifies English and the model returns `null` for translation. Should also work if the heuristic somehow misses it.

### Test 5: Mixed-language post (Russian primary, embedded English)

**Input:**
```
Российские войска применили "Lancet" против украинских позиций. Запись с дрона ниже.
```

**Expected output translation:**
> "Russian forces used 'Lancet' against Ukrainian positions. Drone footage below."

**What we're checking:** Embedded English "Lancet" preserved exactly. Russian translated.

### Test 6: Telegram post with hashtags, @mentions, and emoji

**Input:**
```
🔥 Знищено ще один Т-90М! 
#Покровськ #ЗСУ #Україна
@DefMon3
```

**Expected output translation:**
> "🔥 Another T-90M destroyed!
> 
> #Покровськ #ЗСУ #Україна
> 
> @DefMon3"

**What we're checking:** Emoji preserved. Hashtags preserved untranslated (still in Ukrainian). @mention preserved. Line breaks preserved.

### Test 7: Burmese activist channel

**Input:**
```
စစ်ကောင်စီတပ်ဖွဲ့သည် မကွေးတိုင်း၌ ဗုံးကြဲတိုက်ခိုက်မှုပြုလုပ်ခဲ့ပြီး အရပ်သား ၇ ဦးသေဆုံးခဲ့သည်။
```

**Expected output language:** `my`

**Expected output translation:**
> "The junta forces conducted an airstrike in Magway Region, killing 7 civilians."

**What we're checking:** Burmese transliterates Magway region correctly. Numeral preserved. "Junta" is acceptable as standard English usage for SAC; "Tatmadaw" also acceptable. No editorialization beyond what's in source.

### Test 8: Empty / link-only post (should not reach the model)

**Input:**
```
https://t.me/somechannel/12345
```

**Expected output:** `{"language": null, "translation": null}` — handled by pre-filter, no API call.

**What we're checking:** Pre-filter correctly skips link-only posts.

---

## Things this prompt does *not* do (intentional)

These would all add complexity for marginal benefit. Hold off until requested:

1. **Confidence scoring on translations.** Possible to add ("how confident are you in this translation, 0–1"), but adds latency and we don't currently use the score. Skip.
2. **Glossary lookup.** Could maintain a glossary table for tricky terms and inject into prompt. Not worth it at this scale; the proper-noun rule covers most needs.
3. **Multi-target-language output.** Some users may eventually want Russian → Spanish or Arabic → French. Out of scope; if requested later, easy to extend.
4. **Translation memory / caching across identical posts.** Same source post body would re-translate. The dedupe layer downstream catches duplicate events, but identical source posts in `raw_posts` could share translations. Possible Phase 3 optimization if cost grows. Premature now.
5. **Sentiment / stance detection.** Not the translator's job. The extraction layer's job, if anyone's.

---

## Cost & latency budget (sanity check)

At ~5,000 posts/day, assuming ~40% pre-filtered as English and ~60% hitting the API:

- **API calls/day:** ~3,000
- **Avg tokens per call:** ~200 in, ~250 out
- **Daily cost:** small dollar amount with Haiku pricing
- **Latency added per post:** ~1–2 seconds, well within ingest cycle budget (every 30 min has plenty of headroom)
- **Failure rate budget:** <1% (parse failures + sanity-check rejections)

If observed cost or failure rate exceeds budget, the first lever is the pre-filter heuristic (tighten ASCII threshold to 0.90 to catch more English) and the second is rate limiting.

---

## Logging requirements

Every translation call should log to `llm_logs` (existing table) with:

- `model`: `claude-haiku-4-5`
- `purpose`: `translate_raw_post`
- `input_tokens`, `output_tokens`, `cost_usd`
- `source_post_id`: foreign key to `raw_posts.id`
- `source_language_detected`: from response
- `success`: bool
- `error`: string or null

This gives you the same audit trail you already have for extraction and briefing, and lets you debug failures or measure cost over time.

---

*This spec drafted to be handed directly to Claude Code as part of the Source Feed Phase 1 implementation brief. No additional clarification required for implementation.*
