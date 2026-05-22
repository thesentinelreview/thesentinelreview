from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from bsky_osint.models import CandidateSource, RawPost
from bsky_osint.llm_enricher import LLMEnricher, NoopEnricher

_NOW = datetime(2024, 1, 1, tzinfo=timezone.utc)


def _post(text: str, keep: bool = True) -> RawPost:
    return RawPost(
        uri="at://user.bsky.social/app.bsky.feed.post/abc",
        author_handle="user.bsky.social",
        text=text,
        created_at=_NOW,
        matched_region="Ukraine",
    )


def _source() -> CandidateSource:
    return CandidateSource(
        handle="kyivindependent.com",
        display_name="Kyiv Independent",
        description="Ukraine news outlet",
        regions=["Ukraine"],
    )


@pytest.fixture
def mock_anthropic():
    with patch("bsky_osint.llm_enricher.anthropic") as mock_mod:
        mock_client = MagicMock()
        mock_mod.Anthropic.return_value = mock_client
        yield mock_client


def _make_enricher(mock_client):
    enricher = LLMEnricher.__new__(LLMEnricher)
    enricher._client = mock_client
    enricher._filter_model = "claude-haiku-4-5-20251001"
    enricher._classify_model = "claude-sonnet-4-6"
    return enricher


def test_filter_keeps_true_posts(mock_anthropic):
    posts = [_post("Airstrike near Kharkiv"), _post("Commentary on the war")]
    mock_anthropic.messages.create.return_value.content = [MagicMock(text="[true, false]")]
    enricher = _make_enricher(mock_anthropic)
    result = enricher.filter_posts(posts)
    assert len(result) == 1
    assert result[0].text == "Airstrike near Kharkiv"


def test_filter_drops_all_false(mock_anthropic):
    posts = [_post("opinion"), _post("commentary")]
    mock_anthropic.messages.create.return_value.content = [MagicMock(text="[false, false]")]
    enricher = _make_enricher(mock_anthropic)
    result = enricher.filter_posts(posts)
    assert result == []


def test_filter_keeps_all_on_api_failure(mock_anthropic):
    posts = [_post("airstrike"), _post("shelling")]
    mock_anthropic.messages.create.side_effect = Exception("API error")
    enricher = _make_enricher(mock_anthropic)
    result = enricher.filter_posts(posts)
    assert len(result) == 2


def test_filter_keeps_all_on_mismatched_length(mock_anthropic):
    posts = [_post("a"), _post("b"), _post("c")]
    mock_anthropic.messages.create.return_value.content = [MagicMock(text="[true, false]")]
    enricher = _make_enricher(mock_anthropic)
    result = enricher.filter_posts(posts)
    assert len(result) == 3


def test_filter_strips_markdown_fences(mock_anthropic):
    posts = [_post("airstrike"), _post("opinion")]
    mock_anthropic.messages.create.return_value.content = [MagicMock(text="```json\n[true, false]\n```")]
    enricher = _make_enricher(mock_anthropic)
    result = enricher.filter_posts(posts)
    assert len(result) == 1


def test_classify_source_returns_category(mock_anthropic):
    mock_anthropic.messages.create.return_value.content = [
        MagicMock(text='{"category": "local_media", "rationale": "Ukraine news outlet."}')
    ]
    enricher = _make_enricher(mock_anthropic)
    category, rationale = enricher.classify_source(_source())
    assert category == "local_media"
    assert "Ukraine" in rationale


def test_classify_source_unknown_on_invalid_category(mock_anthropic):
    mock_anthropic.messages.create.return_value.content = [
        MagicMock(text='{"category": "influencer", "rationale": "social media star"}')
    ]
    enricher = _make_enricher(mock_anthropic)
    category, _ = enricher.classify_source(_source())
    assert category == "unknown"


def test_classify_source_unknown_on_api_failure(mock_anthropic):
    mock_anthropic.messages.create.side_effect = Exception("timeout")
    enricher = _make_enricher(mock_anthropic)
    category, rationale = enricher.classify_source(_source())
    assert category == "unknown"
    assert rationale == ""


# NoopEnricher tests

def test_noop_filter_passes_all():
    posts = [_post("a"), _post("b")]
    noop = NoopEnricher()
    assert noop.filter_posts(posts) == posts


def test_noop_classify_returns_existing():
    src = _source().model_copy(update={"source_category": "researcher", "rationale": "existing"})
    noop = NoopEnricher()
    category, rationale = noop.classify_source(src)
    assert category == "researcher"
    assert rationale == "existing"
