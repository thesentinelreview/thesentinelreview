"""
Unit tests for sentinel.pipeline.briefing.

Covers:
  - _build_user_message()         — pure function, no mocks needed
  - generate_briefing_draft()     — Anthropic client mocked
  - hallucinated event ID handling — should warn + drop unknown IDs
  - missing tool block            — should raise RuntimeError
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from sentinel.models import BriefingInput


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utc(y: int, m: int, d: int, h: int = 0) -> datetime:
    return datetime(y, m, d, h, tzinfo=timezone.utc)


def _event(event_id: str | None = None, oblast: str = "Donetsk") -> dict:
    eid = event_id or str(uuid.uuid4())
    return {
        "id": eid,
        "event_type": "strike",
        "location_name": "Pokrovsk",
        "oblast": oblast,
        "confidence": "verified",
        "source_count": 3,
        "occurred_at": "2024-11-01T12:00:00Z",
        "description": "Artillery strike near Pokrovsk market.",
    }


def _briefing_input(events: list[dict] | None = None) -> BriefingInput:
    return BriefingInput(
        theater="ukraine",
        period_start=_utc(2024, 11, 1, 0),
        period_end=_utc(2024, 11, 1, 23),
        events=events or [_event()],
        baseline_7d={"Donetsk": 5.2, "Zaporizhzhia": 2.0},
        notable_shifts=["Donetsk: up 40% vs 7d avg"],
    )


_BLUF_DRAFT = (
    "## BLUF\n\n"
    "Strike tempo in Donetsk is roughly double the 7-day baseline, concentrated on Pokrovsk.\n\n"
    "## WHAT CHANGED\n\n"
    "Donetsk logged 12 events against a 5.2/day baseline; two clusters are corroborated.\n\n"
    "## WHY IT MATTERS\n\n"
    "Sustained pressure on the Pokrovsk axis narrows the remaining supply corridors.\n\n"
    "## OUTLOOK (24–72H)\n\n"
    "Watch for renewed shelling near Pokrovsk; sustained drone activity would indicate "
    "follow-on strikes.\n\n"
    "⚠ AI-generated analysis. Events sourced from open-source reporting; "
    "locations and details unverified. Not for operational use."
)


def _tool_use_block(raw: dict) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", input=raw)


def _text_block() -> SimpleNamespace:
    return SimpleNamespace(type="text", text="ok")


def _make_response(raw: dict | None = None) -> SimpleNamespace:
    content = [_tool_use_block(raw)] if raw is not None else [_text_block()]
    usage = SimpleNamespace(input_tokens=200, output_tokens=300, cache_read_input_tokens=0)
    return SimpleNamespace(content=content, model="claude-opus-4-7-test", usage=usage)


# ---------------------------------------------------------------------------
# _build_user_message — pure function tests
# ---------------------------------------------------------------------------

class TestBuildUserMessage:
    def test_contains_theater(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        msg = _build_user_message(_briefing_input())
        assert "UKRAINE" in msg

    def test_contains_period(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        msg = _build_user_message(_briefing_input())
        assert "2024-11-01" in msg

    def test_contains_event_counts(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        events = [
            _event() | {"confidence": "verified"},
            _event() | {"confidence": "partial"},
            _event() | {"confidence": "unconfirmed"},
        ]
        inp = _briefing_input(events=events)
        msg = _build_user_message(inp)
        assert "Verified: 1" in msg
        assert "Partial: 1" in msg
        assert "Unconfirmed: 1" in msg

    def test_contains_baseline_data(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        msg = _build_user_message(_briefing_input())
        assert "Donetsk" in msg
        assert "5.2" in msg

    def test_contains_notable_shift(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        msg = _build_user_message(_briefing_input())
        assert "Donetsk: up 40%" in msg

    def test_contains_event_id_in_event_list(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        eid = str(uuid.uuid4())
        inp = _briefing_input(events=[_event(event_id=eid)])
        msg = _build_user_message(inp)
        assert eid in msg

    def test_no_shifts_shows_placeholder(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        inp = BriefingInput(
            theater="ukraine",
            period_start=_utc(2024, 11, 1),
            period_end=_utc(2024, 11, 1, 23),
            events=[_event()],
            baseline_7d={},
            notable_shifts=[],
        )
        msg = _build_user_message(inp)
        assert "(no notable shifts)" in msg

    def test_no_baseline_shows_placeholder(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        inp = BriefingInput(
            theater="ukraine",
            period_start=_utc(2024, 11, 1),
            period_end=_utc(2024, 11, 1, 23),
            events=[_event()],
            baseline_7d={},
            notable_shifts=[],
        )
        msg = _build_user_message(inp)
        assert "(no baseline data)" in msg

    def test_event_type_uppercased(self) -> None:
        from sentinel.pipeline.briefing import _build_user_message

        msg = _build_user_message(_briefing_input())
        assert "STRIKE" in msg


# ---------------------------------------------------------------------------
# generate_briefing_draft — mocked Anthropic
# ---------------------------------------------------------------------------

class TestGenerateBriefingDraft:
    def _make_raw(self, event_ids: list[str]) -> dict:
        return {
            "draft_text": _BLUF_DRAFT,
            "referenced_event_ids": event_ids,
            "confidence_summary": "2 verified, 1 partial, 0 unconfirmed",
        }

    @patch("sentinel.pipeline.briefing._client")
    def test_happy_path_returns_output(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.briefing import generate_briefing_draft

        eid = str(uuid.uuid4())
        inp = _briefing_input(events=[_event(event_id=eid)])
        raw = self._make_raw([eid])
        mock_client.messages.create.return_value = _make_response(raw)

        output, meta = generate_briefing_draft(inp)

        assert output.draft_text.startswith("## BLUF")
        assert output.confidence_summary == "2 verified, 1 partial, 0 unconfirmed"
        assert len(output.referenced_event_ids) == 1
        assert str(output.referenced_event_ids[0]) == eid

    @patch("sentinel.pipeline.briefing._client")
    def test_hallucinated_id_dropped(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.briefing import generate_briefing_draft

        eid = str(uuid.uuid4())
        hallucinated_id = str(uuid.uuid4())  # not in events list
        inp = _briefing_input(events=[_event(event_id=eid)])
        raw = self._make_raw([eid, hallucinated_id])
        mock_client.messages.create.return_value = _make_response(raw)

        output, _ = generate_briefing_draft(inp)

        assert len(output.referenced_event_ids) == 1
        assert str(output.referenced_event_ids[0]) == eid

    @patch("sentinel.pipeline.briefing._client")
    def test_raises_when_no_tool_block(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.briefing import generate_briefing_draft

        mock_client.messages.create.return_value = _make_response(None)

        with pytest.raises(RuntimeError, match="record_briefing"):
            generate_briefing_draft(_briefing_input())

    @patch("sentinel.pipeline.briefing._client")
    def test_llm_meta_populated(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.briefing import generate_briefing_draft

        eid = str(uuid.uuid4())
        inp = _briefing_input(events=[_event(event_id=eid)])
        raw = self._make_raw([eid])
        mock_client.messages.create.return_value = _make_response(raw)

        _, meta = generate_briefing_draft(inp)

        assert meta["model"] == "claude-opus-4-7-test"
        assert meta["prompt_tokens"] == 200
        assert meta["completion_tokens"] == 300
        assert isinstance(meta["prompt"], str)
        json.loads(meta["response"])  # must be valid JSON

    @patch("sentinel.pipeline.briefing._client")
    def test_empty_referenced_ids_allowed(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.briefing import generate_briefing_draft

        raw = self._make_raw([])  # LLM returned no refs
        mock_client.messages.create.return_value = _make_response(raw)

        output, _ = generate_briefing_draft(_briefing_input())

        assert output.referenced_event_ids == []

    @patch("sentinel.pipeline.briefing._client")
    def test_referenced_ids_are_uuid_objects(self, mock_client: MagicMock) -> None:
        from sentinel.pipeline.briefing import generate_briefing_draft

        eid = str(uuid.uuid4())
        inp = _briefing_input(events=[_event(event_id=eid)])
        mock_client.messages.create.return_value = _make_response(self._make_raw([eid]))

        output, _ = generate_briefing_draft(inp)

        for ref_id in output.referenced_event_ids:
            assert isinstance(ref_id, uuid.UUID)


# ---------------------------------------------------------------------------
# W2-3 BLUF prompt structure — the system prompt sent to the model carries the
# four-section instruction and the OUTLOOK monitoring-not-prediction constraints
# ---------------------------------------------------------------------------

class TestBlufPromptStructure:
    BLUF_HEADINGS = [
        "## BLUF",
        "## WHAT CHANGED",
        "## WHY IT MATTERS",
        "## OUTLOOK (24–72H)",
    ]

    OUTLOOK_CONSTRAINTS = [
        "Indicators to watch, framed as monitoring priorities.",
        "Never predictions.",
        'Use uncertainty language ("watch for", "would indicate").',
        "No probability claims, no forecasted outcomes.",
    ]

    def _sent_system_text(self, mock_client: MagicMock) -> str:
        from sentinel.pipeline.briefing import generate_briefing_draft

        eid = str(uuid.uuid4())
        raw = {
            "draft_text": _BLUF_DRAFT,
            "referenced_event_ids": [eid],
            "confidence_summary": "1 verified, 0 partial, 0 unconfirmed",
        }
        mock_client.messages.create.return_value = _make_response(raw)
        generate_briefing_draft(_briefing_input(events=[_event(event_id=eid)]))
        kwargs = mock_client.messages.create.call_args.kwargs
        return kwargs["system"][0]["text"]

    @patch("sentinel.pipeline.briefing._client")
    def test_prompt_has_four_section_headings_in_order(self, mock_client: MagicMock) -> None:
        system_text = self._sent_system_text(mock_client)
        positions = [system_text.find(h) for h in self.BLUF_HEADINGS]
        assert all(p != -1 for p in positions), f"missing heading(s): {positions}"
        assert positions == sorted(positions), "headings out of order"

    @patch("sentinel.pipeline.briefing._client")
    def test_prompt_has_outlook_constraints_verbatim(self, mock_client: MagicMock) -> None:
        system_text = self._sent_system_text(mock_client)
        for constraint in self.OUTLOOK_CONSTRAINTS:
            assert constraint in system_text

    @patch("sentinel.pipeline.briefing._client")
    def test_prompt_keeps_carried_over_hard_rules(self, mock_client: MagicMock) -> None:
        system_text = self._sent_system_text(mock_client)
        # Standing posture + grounding rules are unchanged by the BLUF restructure.
        assert (
            "⚠ AI-generated analysis. Events sourced from open-source reporting; "
            "locations and details unverified. Not for operational use." in system_text
        )
        assert "Never speculate beyond the input event list." in system_text
        assert "Never reference event IDs in the prose" in system_text
