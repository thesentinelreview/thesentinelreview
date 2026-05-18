"""
Live integration tests for the translator — hits the real Anthropic API.

These exist to verify the eight verification cases listed in TRANSLATOR_SPEC.md
against actual claude-haiku-4-5 output. They cost a small amount of money each
run and are SKIPPED BY DEFAULT.

Run locally with:
    SENTINEL_LIVE_TRANSLATION_TESTS=1 ANTHROPIC_API_KEY=sk-ant-... \
        pytest apps/ingest/tests/test_translator_live.py -v

Each assertion is intentionally permissive: we check that the model preserved
specific epistemic markers, proper-noun forms, or structural elements — not
exact wording. Translation has legitimate variability.
"""
from __future__ import annotations

import os

import pytest

LIVE = os.environ.get("SENTINEL_LIVE_TRANSLATION_TESTS") == "1"

pytestmark = pytest.mark.skipif(
    not LIVE,
    reason="Live translation tests disabled; set SENTINEL_LIVE_TRANSLATION_TESTS=1 to run.",
)


def _source(platform: str = "telegram", tier: int = 2, handle: str = "TestChannel") -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000000",
        "handle": handle,
        "platform": platform,
        "display_name": handle,
        "trust_tier": tier,
    }


# ---------------------------------------------------------------------------
# Spec Test 1: Russian milblogger with epistemic marker
# ---------------------------------------------------------------------------

def test_russian_epistemic_markers_preserved() -> None:
    from sentinel.pipeline.translator import translate_post

    text = (
        "По данным украинских источников, российские войска якобы вошли в "
        "восточные окраины Покровска. Подтверждения нет."
    )
    result, _ = translate_post(text, source=_source(handle="DefMon3"))

    assert result.language == "ru"
    assert result.translation is not None
    lowered = result.translation.lower()
    assert "according to" in lowered, result.translation
    assert "allegedly" in lowered, result.translation
    assert "pokrovsk" in lowered, result.translation
    # Two sentences in source → two-ish in output (not merged into one).
    assert result.translation.count(".") >= 2, result.translation


# ---------------------------------------------------------------------------
# Spec Test 2: Ukrainian source with weapon system + acronym
# ---------------------------------------------------------------------------

def test_ukrainian_acronym_and_weapon_preserved() -> None:
    from sentinel.pipeline.translator import translate_post

    text = "ЗСУ знищили російський танк Т-90М біля Бахмута за допомогою Javelin."
    result, _ = translate_post(text, source=_source(handle="DefMon3"))

    assert result.language == "uk"
    assert result.translation is not None
    assert "AFU" in result.translation, result.translation
    assert "T-90M" in result.translation, result.translation
    assert "Bakhmut" in result.translation, result.translation
    assert "Javelin" in result.translation, result.translation


# ---------------------------------------------------------------------------
# Spec Test 3: Arabic Iran source with date and number
# ---------------------------------------------------------------------------

def test_arabic_irgc_and_numerals() -> None:
    from sentinel.pipeline.translator import translate_post

    text = (
        "أعلن الحرس الثوري الإيراني عن مقتل 3 من قادته في غارة جوية إسرائيلية "
        "في دمشق يوم 15 مايو."
    )
    result, _ = translate_post(text, source=_source(handle="IranIntl_En"))

    assert result.language == "ar"
    assert result.translation is not None
    assert "IRGC" in result.translation, result.translation
    assert "3" in result.translation, result.translation
    assert "Damascus" in result.translation.lower() or "Damascus" in result.translation
    assert "15" in result.translation, result.translation


# ---------------------------------------------------------------------------
# Spec Test 4: Already-English RSS post
# ---------------------------------------------------------------------------

def test_english_post_returns_null_translation() -> None:
    from sentinel.pipeline.translator import translate_post

    text = (
        "Reuters: Russia launched 47 drones overnight; Ukrainian air defense "
        "intercepted 36, the Ukrainian Air Force said."
    )
    result, meta = translate_post(text, source=_source(platform="rss", handle="reuters"))

    # The pre-filter should catch this before any API call.
    assert result.language == "en"
    assert result.translation is None
    assert meta is None  # confirms no API call was made


# ---------------------------------------------------------------------------
# Spec Test 5: Mixed-language post (Russian primary, embedded English)
# ---------------------------------------------------------------------------

def test_mixed_language_preserves_embedded_english() -> None:
    from sentinel.pipeline.translator import translate_post

    text = 'Российские войска применили "Lancet" против украинских позиций. Запись с дрона ниже.'
    result, _ = translate_post(text, source=_source())

    assert result.language == "ru"
    assert result.translation is not None
    assert "Lancet" in result.translation, result.translation


# ---------------------------------------------------------------------------
# Spec Test 6: Telegram post with hashtags, @mentions, and emoji
# ---------------------------------------------------------------------------

def test_telegram_preserves_metadata() -> None:
    from sentinel.pipeline.translator import translate_post

    text = "🔥 Знищено ще один Т-90М!\n#Покровськ #ЗСУ #Україна\n@DefMon3"
    result, _ = translate_post(text, source=_source(handle="DefMon3"))

    assert result.translation is not None
    assert "🔥" in result.translation, result.translation
    # Hashtags untranslated (still Ukrainian).
    assert "#Покровськ" in result.translation, result.translation
    assert "#ЗСУ" in result.translation, result.translation
    assert "@DefMon3" in result.translation, result.translation
    assert "T-90M" in result.translation, result.translation


# ---------------------------------------------------------------------------
# Spec Test 7: Burmese activist channel
# ---------------------------------------------------------------------------

def test_burmese_translation() -> None:
    from sentinel.pipeline.translator import translate_post

    text = (
        "စစ်ကောင်စီတပ်ဖွဲ့သည် မကွေးတိုင်း၌ ဗုံးကြဲတိုက်ခိုက်မှုပြုလုပ်ခဲ့ပြီး "
        "အရပ်သား ၇ ဦးသေဆုံးခဲ့သည်။"
    )
    result, _ = translate_post(text, source=_source(handle="MyanmarNow"))

    assert result.language == "my"
    assert result.translation is not None
    lowered = result.translation.lower()
    assert "magway" in lowered, result.translation
    # 7 civilians killed — at minimum the numeral and "civilian" must appear.
    assert "7" in result.translation, result.translation
    assert "civilian" in lowered, result.translation


# ---------------------------------------------------------------------------
# Spec Test 8: Link-only post (must not reach the model)
# ---------------------------------------------------------------------------

def test_link_only_skipped_no_api_call() -> None:
    from sentinel.pipeline.translator import translate_post

    result, meta = translate_post("https://t.me/somechannel/12345", source=_source())

    assert result.skipped is True
    assert result.skip_reason == "link_only"
    assert result.translation is None
    assert meta is None  # confirms no API call
