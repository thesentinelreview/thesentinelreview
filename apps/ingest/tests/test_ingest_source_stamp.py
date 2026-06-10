"""Pure-logic tests for the source-health stamp retry/surface path (no Postgres).

The stamp is isolated from the post inserts, so a stamp failure never loses
data. But it must not be swallowed silently: a serialization/deadlock error gets
one retry, and a persistent failure is recorded so the run summary can surface
it. These tests exercise the decision logic with fake callables — no DB.
"""
from __future__ import annotations

from sentinel.jobs.ingest_source import (
    _is_serialization_error,
    _run_with_serialization_retry,
    drain_stamp_failures,
    record_stamp_failure,
)


class _FakeSerializationError(Exception):
    sqlstate = "40001"


class _FakeDeadlock(Exception):
    sqlstate = "40P01"


class _FakeOtherError(Exception):
    sqlstate = "23505"  # unique_violation — not retryable


def test_is_serialization_error_by_sqlstate() -> None:
    assert _is_serialization_error(_FakeSerializationError()) is True
    assert _is_serialization_error(_FakeDeadlock()) is True
    assert _is_serialization_error(_FakeOtherError()) is False
    assert _is_serialization_error(Exception("no sqlstate")) is False


def test_retry_succeeds_on_second_attempt() -> None:
    calls = {"n": 0}

    def attempt() -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise _FakeSerializationError("locked")
        # second attempt succeeds

    assert _run_with_serialization_retry(attempt) is None
    assert calls["n"] == 2


def test_persistent_serialization_error_returns_structured_error() -> None:
    calls = {"n": 0}

    def attempt() -> None:
        calls["n"] += 1
        raise _FakeSerializationError("still locked")

    error = _run_with_serialization_retry(attempt)
    assert error is not None
    assert "still locked" in error
    assert calls["n"] == 2  # one try + one retry, then give up


def test_non_retryable_error_is_not_retried() -> None:
    calls = {"n": 0}

    def attempt() -> None:
        calls["n"] += 1
        raise _FakeOtherError("dupe")

    error = _run_with_serialization_retry(attempt)
    assert error is not None and "dupe" in error
    assert calls["n"] == 1  # no retry for a non-serialization error


def test_record_and_drain_stamp_failures() -> None:
    drain_stamp_failures()  # clear any residue from other tests
    record_stamp_failure("feed_a", "BoomError: x")
    record_stamp_failure("feed_b", "BoomError: y")
    failures = drain_stamp_failures()
    assert [h for h, _ in failures] == ["feed_a", "feed_b"]
    assert drain_stamp_failures() == []  # draining clears it
