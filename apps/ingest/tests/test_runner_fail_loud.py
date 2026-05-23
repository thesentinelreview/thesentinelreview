"""
Unit tests for the "fail loud" ingest runner logic in sentinel.runner.

No database is needed: _process_one, the drain, the post-count query and the
job enqueuer are all patched. We assert exit codes, source classification and
the all-jobs-failed escalation.
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from sentinel import runner
from sentinel.runner import _AllJobsFailed, _drain_queue, _strict_mode_enabled, _summarize
from sentinel.worker import JobOutcome

_NOW = datetime(2026, 5, 23, 12, 0, tzinfo=UTC)


def _ingest(source_id: str, *, failed: bool = False, error: str | None = None) -> JobOutcome:
    return JobOutcome(
        processed=True,
        job_type="ingest_source",
        source_id=source_id,
        failed=failed,
        error_type="RuntimeError" if failed else None,
        error=error if failed else None,
    )


# ---------------------------------------------------------------------------
# _strict_mode_enabled
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "value,expected",
    [
        (None, True),    # unset → strict
        ("", True),      # empty (undefined repo variable) → strict
        ("true", True),
        ("TRUE", True),
        ("1", True),
        ("false", False),
        ("False", False),
        ("0", False),
        ("no", False),
        ("off", False),
    ],
)
def test_strict_mode_parsing(monkeypatch, value, expected):
    if value is None:
        monkeypatch.delenv("SENTINEL_STRICT_MODE", raising=False)
    else:
        monkeypatch.setenv("SENTINEL_STRICT_MODE", value)
    assert _strict_mode_enabled() is expected


# ---------------------------------------------------------------------------
# _summarize
# ---------------------------------------------------------------------------

def test_summarize_classifies_sources():
    outcomes = [
        _ingest("A"),                             # wrote posts  → succeeded
        _ingest("B"),                             # no posts     → empty
        _ingest("C", failed=True, error="boom"),  # raised       → failed
        JobOutcome(processed=True, job_type="extract_events", source_id="A"),  # ignored
    ]
    s = _summarize(outcomes, {"A": 3})
    assert s.posts_written_total == 3
    assert s.sources_attempted == 3
    assert s.sources_succeeded == 1
    assert s.sources_empty == 1
    assert s.sources_failed_with_error == 1


def test_summarize_failed_source_with_posts_counts_as_failed():
    # A source may write a few posts then raise on a later page; error wins.
    s = _summarize([_ingest("A", failed=True, error="late boom")], {"A": 2})
    assert s.sources_failed_with_error == 1
    assert s.sources_succeeded == 0
    assert s.sources_empty == 0


# ---------------------------------------------------------------------------
# _drain_queue
# ---------------------------------------------------------------------------

def test_drain_queue_raises_when_all_jobs_fail():
    seq = [
        _ingest("A", failed=True, error="x"),
        _ingest("B", failed=True, error="y"),
        JobOutcome(processed=False),
    ]
    with patch("sentinel.worker._process_one", side_effect=seq):
        with pytest.raises(_AllJobsFailed) as ei:
            _drain_queue()
    assert len(ei.value.outcomes) == 2


def test_drain_queue_returns_outcomes_when_some_succeed():
    seq = [
        _ingest("A"),
        _ingest("B", failed=True, error="y"),
        JobOutcome(processed=False),
    ]
    with patch("sentinel.worker._process_one", side_effect=seq):
        outcomes = _drain_queue()
    assert len(outcomes) == 2
    assert sum(o.failed for o in outcomes) == 1


def test_drain_queue_empty_returns_empty_list():
    with patch("sentinel.worker._process_one", side_effect=[JobOutcome(processed=False)]):
        assert _drain_queue() == []


# ---------------------------------------------------------------------------
# run_ingest exit codes
# ---------------------------------------------------------------------------

def _run_ingest_with(*, outcomes, posts, strict, enqueued=3):
    """Drive run_ingest with all I/O patched; return the SystemExit code.

    `outcomes` may be a list (returned by the drain) or an exception instance
    (raised by the drain, e.g. _AllJobsFailed).
    """
    patches = [
        patch.object(runner, "_configure_logging", lambda: None),
        patch.object(runner, "_strict_mode_enabled", lambda: strict),
        patch.object(runner, "_db_now", lambda: _NOW),
        patch.object(runner, "_posts_written_since", lambda since: posts),
        patch("sentinel.scheduler._enqueue_ingest_jobs", lambda: enqueued),
    ]
    if isinstance(outcomes, BaseException):
        patches.append(patch.object(runner, "_drain_queue", side_effect=outcomes))
    else:
        patches.append(patch.object(runner, "_drain_queue", return_value=outcomes))

    for p in patches:
        p.start()
    try:
        with pytest.raises(SystemExit) as ei:
            runner.run_ingest()
        return ei.value.code
    finally:
        for p in reversed(patches):
            p.stop()


def test_run_ingest_zero_write_strict_exits_1():
    assert _run_ingest_with(outcomes=[_ingest("A")], posts={}, strict=True) == 1


def test_run_ingest_zero_write_non_strict_exits_0():
    assert _run_ingest_with(outcomes=[_ingest("A")], posts={}, strict=False) == 0


def test_run_ingest_with_posts_exits_0():
    assert _run_ingest_with(outcomes=[_ingest("A")], posts={"A": 5}, strict=True) == 0


def test_run_ingest_all_failed_strict_exits_1():
    exc = _AllJobsFailed([_ingest("A", failed=True, error="x")])
    assert _run_ingest_with(outcomes=exc, posts={}, strict=True) == 1


def test_run_ingest_all_failed_non_strict_exits_0():
    exc = _AllJobsFailed([_ingest("A", failed=True, error="x")])
    assert _run_ingest_with(outcomes=exc, posts={}, strict=False) == 0
