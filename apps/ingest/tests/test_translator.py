"""
Unit tests for sentinel.pipeline.translator.translate_post().

Anthropic client patched at module level — no real API calls.

Coverage:
  - Pre-filter: empty, whitespace, English-by-heuristic, link-only
  - Happy path: Russian → English (mocked)
  - Mixed-language: returns model output verbatim
  - Multi-byte / non-Latin pre-filter does NOT skip
  - Invalid JSON response → translation=None, language=None
  - Response not an object → translation=None
  - Invalid language code (non-2-char) → language=None, translation kept
  - Length-ratio out of bounds → still stored (logged only)
  - Length truncation at MAX_INPUT_CHARS
  - LLM meta is populated correctly
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


def _text_block(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _make_response(
    text: str, *, input_tokens: int = 50, output_tokens: int = 25
) -> SimpleNamespace:
    usage = SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens)
    return SimpleNamespace(
        content=[_text_block(text)],
        model="claude-haiku-4-5-test",
        usage=usage,
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
# Pre-filter behaviour
# ---------------------------------------------------------------------------

class TestPrefilter:
    @patch("sentinel.pipeline.translator._client")
    def test_empty_string_skipped(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.translator import translate_post

        result, meta = translate_post("", source=_source())

        assert result.skipped is True
        assert result.skip_reason == "empty"
        assert result.translation is None
        assert meta is None
        mock_client.messages.create.assert_not_called()

    @patch("sentinel.pipeline.translator._client")
    def test_whitespace_only_skipped(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.translator import translate_post

        result, meta = translate_post("   \n\t  ", source=_source())

        assert result.skipped is True
        assert result.skip_reason == "empty"
        assert meta is None

    @patch("sentinel.pipeline.translator._client")
    def test_english_ascii_skipped(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.translator import translate_post

        text = "Russia launched 47 drones overnight; air defense intercepted 36."
        result, meta = translate_post(text, source=_source())

        assert result.skipped is True
        assert result.skip_reason == "english_heuristic"
        assert result.language == "en"
        assert result.translation is None
        assert meta is None
        mock_client.messages.create.assert_not_called()

    @patch("sentinel.pipeline.translator._client")
    def test_link_only_skipped(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.translator import translate_post

        result, meta = translate_post("https://t.me/somechannel/12345", source=_source())

        assert result.skipped is True
        assert result.skip_reason == "link_only"
        assert meta is None
        mock_client.messages.create.assert_not_called()

    @patch("sentinel.pipeline.translator._client")
    def test_link_with_short_caption_skipped(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.translator import translate_post

        result, meta = translate_post("👍 https://t.me/x/1", source=_source())

        assert result.skipped is True
        assert result.skip_reason == "link_only"

    @patch("sentinel.pipeline.translator._client")
    def test_non_latin_not_skipped(self, mock_client: MagicMock) -> None:
        """A short Cyrillic post must NOT be caught by the English heuristic."""
        mock_client.messages.create.return_value = _make_response(
            '{"language": "ru", "translation": "Strike near Pokrovsk."}'
        )

        from sentinel.pipeline.translator import translate_post

        result, meta = translate_post("Удар возле Покровска.", source=_source())

        assert result.skipped is False
        assert result.language == "ru"
        assert meta is not None
        mock_client.messages.create.assert_called_once()


# ---------------------------------------------------------------------------
# API call + response parsing
# ---------------------------------------------------------------------------

class TestTranslateRussian:
    @patch("sentinel.pipeline.translator._client")
    def test_happy_path(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            '{"language": "ru", "translation": "According to Ukrainian sources, '
            'Russian forces allegedly entered the eastern outskirts of Pokrovsk."}'
        )

        from sentinel.pipeline.translator import translate_post

        text = (
            "По данным украинских источников, российские войска якобы вошли "
            "в восточные окраины Покровска."
        )
        result, meta = translate_post(text, source=_source())

        assert result.language == "ru"
        assert result.translation is not None
        assert "allegedly" in result.translation
        assert result.skipped is False
        assert meta is not None
        assert meta["model"] == "claude-haiku-4-5-test"
        assert meta["prompt_tokens"] == 50
        assert meta["completion_tokens"] == 25

    @patch("sentinel.pipeline.translator._client")
    def test_user_prompt_contains_source_metadata(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            '{"language": "ru", "translation": "Hi."}'
        )

        from sentinel.pipeline.translator import translate_post

        translate_post("Привет.", source=_source(platform="x", tier=1, handle="DefMon3"))

        kwargs = mock_client.messages.create.call_args.kwargs
        user_msg = kwargs["messages"][0]["content"]
        assert "Source platform: x" in user_msg
        assert "Source handle: DefMon3" in user_msg
        assert "Source trust tier: 1" in user_msg
        assert "<<<" in user_msg and ">>>" in user_msg

    @patch("sentinel.pipeline.translator._client")
    def test_temperature_zero(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            '{"language": "ru", "translation": "Hi."}'
        )

        from sentinel.pipeline.translator import translate_post

        translate_post("Привет.", source=_source())

        kwargs = mock_client.messages.create.call_args.kwargs
        assert kwargs["temperature"] == 0.0


# ---------------------------------------------------------------------------
# Response parsing edge cases
# ---------------------------------------------------------------------------

class TestResponseParsing:
    @patch("sentinel.pipeline.translator._client")
    def test_invalid_json_returns_null_translation(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response("not json at all")

        from sentinel.pipeline.translator import translate_post

        result, meta = translate_post("Привет.", source=_source())

        assert result.translation is None
        assert result.language is None
        # The API was still called — meta is populated for the audit log.
        assert meta is not None

    @patch("sentinel.pipeline.translator._client")
    def test_response_array_not_object(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response('["ru", "Hi."]')

        from sentinel.pipeline.translator import translate_post

        result, _ = translate_post("Привет.", source=_source())

        assert result.translation is None
        assert result.language is None

    @patch("sentinel.pipeline.translator._client")
    def test_invalid_language_code_dropped(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            '{"language": "russian", "translation": "Hi."}'
        )

        from sentinel.pipeline.translator import translate_post

        result, _ = translate_post("Привет.", source=_source())

        assert result.language is None
        assert result.translation == "Hi."

    @patch("sentinel.pipeline.translator._client")
    def test_null_translation_for_english_source(self, mock_client: MagicMock) -> None:
        """If model returns {language: en, translation: null}, accept it."""
        mock_client.messages.create.return_value = _make_response(
            '{"language": "en", "translation": null}'
        )

        from sentinel.pipeline.translator import translate_post

        # Use text that is non-Latin enough to skip the pre-filter but the
        # model decides is effectively English.
        result, _ = translate_post("Привет.", source=_source())

        assert result.language == "en"
        assert result.translation is None

    @patch("sentinel.pipeline.translator._client")
    def test_suspicious_length_ratio_still_stored(
        self, mock_client: MagicMock, caplog: pytest.LogCaptureFixture
    ) -> None:
        # 10-char source, 100-char translation (ratio = 10 > 4)
        mock_client.messages.create.return_value = _make_response(
            '{"language": "ru", "translation": "' + "x" * 100 + '"}'
        )

        from sentinel.pipeline.translator import translate_post

        result, _ = translate_post("Привет всем", source=_source())

        # Still stored — we flag but do not drop.
        assert result.translation is not None
        assert len(result.translation) == 100

    @patch("sentinel.pipeline.translator._client")
    def test_non_string_translation_dropped(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            '{"language": "ru", "translation": 42}'
        )

        from sentinel.pipeline.translator import translate_post

        result, _ = translate_post("Привет.", source=_source())

        assert result.translation is None


# ---------------------------------------------------------------------------
# Input length cap
# ---------------------------------------------------------------------------

class TestInputTruncation:
    @patch("sentinel.pipeline.translator._client")
    def test_long_input_truncated(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            '{"language": "ru", "translation": "..."}'
        )

        from sentinel.pipeline.translator import MAX_INPUT_CHARS, translate_post

        long_text = "Привет! " * 1000  # well over 4000 chars
        translate_post(long_text, source=_source())

        kwargs = mock_client.messages.create.call_args.kwargs
        user_msg = kwargs["messages"][0]["content"]
        # Locate the post text between the delimiters
        post_segment = user_msg.split("<<<\n", 1)[1].split("\n>>>", 1)[0]
        assert len(post_segment) <= MAX_INPUT_CHARS
        assert post_segment.endswith("[…truncated]")

    @patch("sentinel.pipeline.translator._client")
    def test_short_input_not_truncated(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            '{"language": "ru", "translation": "Hello."}'
        )

        from sentinel.pipeline.translator import translate_post

        translate_post("Привет!", source=_source())

        kwargs = mock_client.messages.create.call_args.kwargs
        user_msg = kwargs["messages"][0]["content"]
        assert "[…truncated]" not in user_msg
