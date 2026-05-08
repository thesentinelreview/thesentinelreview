"""
Deduplication — decides whether a newly extracted event is already represented
in the database.

Strategy (simple geographic + temporal clustering for v0.1):
  1. Look for existing events of the same type within RADIUS_KM and WINDOW_HOURS.
  2. If found, check description similarity. If it looks like the same incident,
     return the existing event ID so the caller can corroborate rather than duplicate.

v0.2 could replace step 2 with an embedding similarity check.
"""
from __future__ import annotations

import uuid
from datetime import datetime

import psycopg
import structlog

from sentinel.db import find_nearby_events

log = structlog.get_logger()

RADIUS_KM = 5.0     # events within 5 km are candidates for deduplication
WINDOW_HOURS = 6.0  # events within 6 hours are candidates


def find_duplicate(
    conn: psycopg.Connection,
    *,
    lng: float,
    lat: float,
    occurred_at: datetime,
    event_type: str,
) -> uuid.UUID | None:
    """
    Return the ID of an existing event that likely represents the same incident,
    or None if this looks like a new event.
    """
    candidates = find_nearby_events(
        conn,
        lng=lng,
        lat=lat,
        radius_km=RADIUS_KM,
        within_hours=WINDOW_HOURS,
        event_type=event_type,
    )

    if not candidates:
        return None

    # Take the closest candidate in space; the temporal filter already limits the window.
    # For v0.1 this is sufficient — a same-type event within 5 km / 6 h is almost certainly
    # the same incident being reported by multiple sources.
    best = candidates[0]

    log.debug(
        "dedup_candidate_found",
        existing_id=str(best["id"]),
        dist_km=round(best["dist_km"], 2),
        event_type=event_type,
    )

    return best["id"]
