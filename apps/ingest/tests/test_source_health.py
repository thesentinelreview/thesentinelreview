"""
Unit tests for sentinel.db.record_source_fetch.

These cover the Python wiring of per-source health: the forward path writes the
durable SIGNALS (last_fetch_at, consecutive_errors, last_post_at, last_error_*)
and then delegates the health_status LABEL to the recompute_source_health() SQL
function (migration 0028), which is the single source of truth. The function's own
recency/error logic is pure SQL and is exercised directly against Postgres on a
Supabase branch (see the migration's validation); _classify_fetch's per-meta
classification is covered by the per-platform ingestor tests.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from sentinel.db import record_source_fetch


def _executed(conn: MagicMock) -> list[tuple[str, tuple]]:
    """All (sql, params) pairs passed to conn.execute, in call order."""
    out: list[tuple[str, tuple]] = []
    for call in conn.execute.call_args_list:
        sql = call.args[0]
        params = call.args[1] if len(call.args) > 1 else ()
        out.append((sql, params))
    return out


def _recompute_calls(conn: MagicMock) -> list[tuple[str, tuple]]:
    return [(sql, params) for sql, params in _executed(conn) if "recompute_source_health" in sql]


def _meta(*, results: int, newest: datetime | None = None, transport_error: str | None = None,
          http_status: int | None = None) -> dict:
    """A last_fetch_meta like every ingestor's _fetch_meta produces."""
    return {
        "transport_error": transport_error,
        "http_status": http_status,
        "raw_entries": results,
        "results": results,
        "newest_posted_at": newest,
    }


class TestRecordSourceFetch:
    def test_success_writes_signals_but_not_the_label(self) -> None:
        conn = MagicMock()
        sid = uuid.uuid4()
        newest = datetime(2026, 6, 9, 8, 0, tzinfo=timezone.utc)

        # results>0 but posts_inserted=0 — an all-deduped cycle, the exact case
        # that used to flap a healthy low-cadence feed to 'silent'.
        record_source_fetch(conn, sid, posts_inserted=0, meta=_meta(results=2, newest=newest))

        update_sql, update_params = _executed(conn)[0]
        assert "consecutive_errors = 0" in update_sql
        assert "last_post_at" in update_sql          # recency signal still advanced
        assert "health_status" not in update_sql     # the label is NOT authored here
        assert newest in update_params and sid in update_params

    def test_success_delegates_label_to_function(self) -> None:
        conn = MagicMock()
        sid = uuid.uuid4()

        # A genuinely empty cycle (0 results): the forward path must NOT stamp
        # 'silent' itself — it defers to recompute_source_health, which keeps the
        # feed 'healthy' if it posted within the recency window.
        record_source_fetch(conn, sid, posts_inserted=0, meta=_meta(results=0))

        recompute = _recompute_calls(conn)
        assert recompute == [("SELECT recompute_source_health(%s)", (sid,))]
        # delegation runs after the signal UPDATE
        assert _executed(conn)[-1][0] == recompute[0][0]

    def test_error_path_sets_specific_label_and_increments(self) -> None:
        conn = MagicMock()
        sid = uuid.uuid4()

        record_source_fetch(
            conn, sid, posts_inserted=0,
            meta=_meta(results=0, transport_error="boom", http_status=500),
        )

        update_sql, update_params = _executed(conn)[0]
        assert "consecutive_errors = consecutive_errors + 1" in update_sql
        # the fetch path still owns the specific error label (preserved by the
        # function for a 1-9 streak); http 5xx -> 'erroring'
        assert "health_status" in update_sql
        assert "erroring" in update_params
        assert "last_post_at" not in update_sql       # never advanced on failure
        # still delegates (the function coarsens to 'erroring' at >= 10)
        assert _recompute_calls(conn) == [("SELECT recompute_source_health(%s)", (sid,))]

    def test_recompute_called_exactly_once_per_fetch(self) -> None:
        for meta in (
            _meta(results=3, newest=datetime(2026, 6, 9, tzinfo=timezone.utc)),
            _meta(results=0),
            _meta(results=0, transport_error="dns"),
        ):
            conn = MagicMock()
            record_source_fetch(conn, uuid.uuid4(), posts_inserted=0, meta=meta)
            assert len(_recompute_calls(conn)) == 1, meta
