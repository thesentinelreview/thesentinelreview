"""
Unit tests for sentinel.pipeline.extractor.extract_event().

The Anthropic client is patched at the module level so no real API calls are
made. Tests exercise:
  - Happy path: post with a real event
  - Skipped post: has_event=False
  - Missing tool block: RuntimeError raised
  - Hallucinated / missing geolocation_signals fields use safe defaults
  - LLM meta dict is populated correctly
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from sentinel.models import GeolocationSignal


# ---------------------------------------------------------------------------
# Helpers to build fake Anthropic response objects
# ---------------------------------------------------------------------------

def _tool_use_block(raw: dict) -> SimpleNamespace:
    block = SimpleNamespace(type="tool_use", input=raw)
    return block


def _text_block(text: str = "ok") -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _make_response(raw: dict | None) -> SimpleNamespace:
    """Fake anthropic.types.Message with one tool_use block (or none)."""
    content = [_tool_use_block(raw)] if raw is not None else [_text_block()]
    usage = SimpleNamespace(
        input_tokens=100,
        output_tokens=50,
        cache_read_input_tokens=0,
    )
    return SimpleNamespace(
        content=content,
        model="claude-sonnet-4-6-test",
        usage=usage,
    )


def _source(platform: str = "telegram", tier: int = 2) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "handle": "TestChannel",
        "platform": platform,
        "display_name": "Test Channel",
        "trust_tier": tier,
    }


# ---------------------------------------------------------------------------
# Base raw response for a valid event
# ---------------------------------------------------------------------------

_VALID_RAW: dict = {
    "has_event": True,
    "event_type": "strike",
    "occurred_at": "2024-11-01T12:00:00Z",
    "location_name": "Pokrovsk",
    "oblast": "Donetsk",
    "lat": 48.07,
    "lng": 37.71,
    "actor": "Russian forces",
    "description": "Artillery strike reported near Pokrovsk market.",
    "geolocation_signals": {
        "geolocated_footage": True,
        "official_acknowledgment": False,
        "matching_press": False,
        "coordinates_given": False,
        "landmarks_visible": False,
    },
    "is_high_impact": False,
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestExtractEvent:
    @patch("sentinel.pipeline.extractor._client")
    def test_happy_path_returns_event(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(_VALID_RAW)

        from sentinel.pipeline.extractor import extract_event

        event, meta = extract_event("Artillery strike near Pokrovsk.", source=_source())

        assert event.has_event is True
        assert event.event_type == "strike"
        assert event.location_name == "Pokrovsk"
        assert event.oblast == "Donetsk"
        assert event.lat == pytest.approx(48.07)
        assert event.lng == pytest.approx(37.71)
        assert event.is_high_impact is False
        assert isinstance(event.geolocation_signals, GeolocationSignal)
        assert event.geolocation_signals.geolocated_footage is True

    @patch("sentinel.pipeline.extractor._client")
    def test_skipped_post_returns_no_event(self, mock_client: MagicMock) -> None:
        raw = {"has_event": False, "skip_reason": "general commentary, not a discrete event"}
        mock_client.messages.create.return_value = _make_response(raw)

        from sentinel.pipeline.extractor import extract_event

        event, _ = extract_event("Analysis: the situation is worsening.", source=_source())

        assert event.has_event is False
        assert event.skip_reason == "general commentary, not a discrete event"
        assert event.event_type is None

    @patch("sentinel.pipeline.extractor._client")
    def test_raises_when_no_tool_block(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(None)

        from sentinel.pipeline.extractor import extract_event

        with pytest.raises(RuntimeError, match="record_event"):
            extract_event("some text", source=_source())

    @patch("sentinel.pipeline.extractor._client")
    def test_llm_meta_populated(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(_VALID_RAW)

        from sentinel.pipeline.extractor import extract_event

        _, meta = extract_event("Artillery strike near Pokrovsk.", source=_source())

        assert meta["model"] == "claude-sonnet-4-6-test"
        assert meta["prompt_tokens"] == 100
        assert meta["completion_tokens"] == 50
        assert isinstance(meta["prompt"], str)
        assert "Artillery strike" in meta["prompt"]
        # response should be JSON-serialisable
        json.loads(meta["response"])

    @patch("sentinel.pipeline.extractor._client")
    def test_missing_geo_signals_defaults_to_all_false(self, mock_client: MagicMock) -> None:
        raw = dict(_VALID_RAW)
        raw.pop("geolocation_signals")
        mock_client.messages.create.return_value = _make_response(raw)

        from sentinel.pipeline.extractor import extract_event

        event, _ = extract_event("strike", source=_source())

        geo = event.geolocation_signals
        assert geo.geolocated_footage is False
        assert geo.official_acknowledgment is False
        assert geo.coordinates_given is False

    @patch("sentinel.pipeline.extractor._client")
    def test_text_capped_at_4000_chars(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            {"has_event": False, "skip_reason": "too long"}
        )
        long_text = "x" * 10_000

        from sentinel.pipeline.extractor import extract_event

        extract_event(long_text, source=_source())

        call_kwargs = mock_client.messages.create.call_args[1]
        user_msg = call_kwargs["messages"][0]["content"]
        assert len(user_msg) <= 4100  # 4000 cap + header overhead

    @patch("sentinel.pipeline.extractor._client")
    def test_source_info_in_prompt(self, mock_client: MagicMock) -> None:
        mock_client.messages.create.return_value = _make_response(
            {"has_event": False, "skip_reason": "none"}
        )

        from sentinel.pipeline.extractor import extract_event

        src = _source(platform="x", tier=1)
        src["display_name"] = "SpecialHandle"
        extract_event("text", source=src)

        call_kwargs = mock_client.messages.create.call_args[1]
        user_msg = call_kwargs["messages"][0]["content"]
        assert "SpecialHandle" in user_msg
        assert "trust tier 1" in user_msg

    @patch("sentinel.pipeline.extractor._client")
    def test_high_impact_flag_preserved(self, mock_client: MagicMock) -> None:
        raw = dict(_VALID_RAW)
        raw["is_high_impact"] = True
        mock_client.messages.create.return_value = _make_response(raw)

        from sentinel.pipeline.extractor import extract_event

        event, _ = extract_event("Mass casualty event.", source=_source())

        assert event.is_high_impact is True
