from __future__ import annotations

import math
from typing import Any

import structlog

log = structlog.get_logger()

_METRICS = [
    ("connections_per_hour", "event_type = 'network_connect'"),
    ("dns_queries_per_hour", "event_type = 'dns_query'"),
    ("auth_failures_per_hour", "event_type = 'login_fail'"),
    ("processes_per_hour", "event_type = 'process_start'"),
]


def run(conn: Any, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Compute hourly behavioral baselines per asset using Welford's online algorithm.
    Updates asset_baselines table. Run daily.
    """
    updated = 0
    for metric_name, where_clause in _METRICS:
        rows = conn.execute(
            f"""
            SELECT
                asset_id,
                EXTRACT(HOUR FROM event_time)::int as hour_of_day,
                EXTRACT(DOW FROM event_time)::int as day_of_week,
                COUNT(*) as cnt
            FROM telemetry_events
            WHERE {where_clause}
              AND event_time >= now() - interval '30 days'
              AND asset_id IS NOT NULL
            GROUP BY 1, 2, 3
            """,
        ).fetchall()

        for row in rows:
            existing = conn.execute(
                """
                SELECT mean, stddev, sample_count FROM asset_baselines
                WHERE asset_id = %s AND metric = %s AND hour_of_day = %s AND day_of_week = %s
                """,
                (str(row["asset_id"]), metric_name, row["hour_of_day"], row["day_of_week"]),
            ).fetchone()

            n = row["cnt"]
            x = float(n)

            if existing:
                old_mean = float(existing["mean"])
                old_m2 = (float(existing["stddev"]) ** 2) * existing["sample_count"]
                old_n = existing["sample_count"]
                new_n = old_n + 1
                delta = x - old_mean
                new_mean = old_mean + delta / new_n
                delta2 = x - new_mean
                new_m2 = old_m2 + delta * delta2
                new_stddev = math.sqrt(new_m2 / new_n) if new_n > 1 else 0.0

                conn.execute(
                    """
                    UPDATE asset_baselines SET mean = %s, stddev = %s, sample_count = %s, last_updated = now()
                    WHERE asset_id = %s AND metric = %s AND hour_of_day = %s AND day_of_week = %s
                    """,
                    (new_mean, new_stddev, new_n, str(row["asset_id"]), metric_name,
                     row["hour_of_day"], row["day_of_week"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO asset_baselines (asset_id, metric, hour_of_day, day_of_week, mean, stddev, sample_count)
                    VALUES (%s, %s, %s, %s, %s, 0, 1)
                    """,
                    (str(row["asset_id"]), metric_name, row["hour_of_day"], row["day_of_week"], x),
                )
            updated += 1

    conn.commit()
    log.info("update_baselines.done", updated=updated)
    return {"updated": updated}
