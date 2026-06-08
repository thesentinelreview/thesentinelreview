"""
Deduplication — decides whether a newly extracted event is already represented
in the database.

Strategy (geographic + temporal clustering):
  Look for an existing event of the same type within RADIUS_KM and within
  ±dedup_max_time_gap_hours of the incoming event's occurred_at. If one exists,
  return it (closest in space) so the caller can corroborate rather than create a
  duplicate. The time window is anchored on the incoming occurred_at — NOT on
  now() — so delayed reports of the same older incident still match.

v0.2 could add a description/embedding similarity check on top of this spatial +
temporal gate.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import psycopg
import structlog

from sentinel.config import settings
from sentinel.db import find_nearby_events
from sentinel.pipeline.geocode_precision import COARSE

log = structlog.get_logger()

RADIUS_KM = 5.0     # events within 5 km are candidates for deduplication


def find_duplicate(
    conn: psycopg.Connection,
    *,
    lng: float,
    lat: float,
    occurred_at: datetime,
    event_type: str,
    incoming_precision: str,
) -> dict[str, Any] | None:
    """
    Return the existing event (as a row dict, closest in space) that likely
    represents the same incident, or None if this looks like a new event.

    A coarse-precision incoming event sits on a region/country centroid, not a real
    location, so a shared coordinate is not co-location — it can't be spatially
    deduped and is always treated as new. (find_nearby_events excludes coarse
    *candidates* symmetrically.) Otherwise find_nearby_events already bounds
    candidates to the same type, RADIUS_KM, and ±dedup_max_time_gap_hours of
    occurred_at, so the spatially-closest candidate is always a valid match.
    """
    if incoming_precision in COARSE:
        return None

    candidates = find_nearby_events(
        conn,
        lng=lng,
        lat=lat,
        occurred_at=occurred_at,
        max_gap_hours=settings.dedup_max_time_gap_hours,
        radius_km=RADIUS_KM,
        event_type=event_type,
    )

    if not candidates:
        return None

    best = candidates[0]
    log.debug(
        "dedup_candidate_found",
        existing_id=str(best["id"]),
        dist_km=round(best["dist_km"], 2),
        gap_hours=round(abs((best["occurred_at"] - occurred_at).total_seconds()) / 3600, 1),
        event_type=event_type,
    )
    return best
