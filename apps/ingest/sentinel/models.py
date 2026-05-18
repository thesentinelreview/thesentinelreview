"""Pydantic models mirroring the database schema. Used for validation throughout the pipeline."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ── Enums ─────────────────────────────────────────────────────────────────────

EventType   = Literal["strike", "clash", "movement"]
Confidence  = Literal["verified", "partial", "unconfirmed"]
Platform    = Literal["x", "telegram", "rss", "wire"]
JobType     = Literal["ingest_source", "extract_events", "generate_briefing"]
JobStatus   = Literal["pending", "running", "done", "failed"]
Relationship = Literal["primary", "corroborating", "contradicting"]


# ── Database row models ────────────────────────────────────────────────────────

class Source(BaseModel):
    id:           uuid.UUID
    handle:       str
    platform:     Platform
    display_name: str
    url:          str | None
    is_active:    bool
    trust_tier:   int
    notes:        str | None
    created_at:   datetime


class RawPost(BaseModel):
    id:              uuid.UUID
    source_id:       uuid.UUID
    external_id:     str
    posted_at:       datetime
    text:            str
    media_urls:      list[str]
    archive_url:     str | None
    lang:            str | None
    ingested_at:     datetime
    processed_at:    datetime | None
    skip_reason:     str | None
    translated_text: str | None = None


class Event(BaseModel):
    id:                   uuid.UUID
    event_type:           EventType
    occurred_at:          datetime
    lng:                  float
    lat:                  float
    location_name:        str
    oblast:               str
    actor:                str | None
    description:          str
    confidence:           Confidence
    published_at:         datetime | None
    human_reviewed_at:    datetime | None
    held_for_review:      bool
    created_at:           datetime


class Job(BaseModel):
    id:           uuid.UUID
    job_type:     JobType
    payload:      dict
    status:       JobStatus
    attempts:     int
    max_attempts: int
    scheduled_at: datetime
    started_at:   datetime | None
    completed_at: datetime | None
    error:        str | None
    created_at:   datetime


# ── LLM pipeline models ────────────────────────────────────────────────────────

class GeolocationSignal(BaseModel):
    """Signals the LLM detects that help establish event location confidence."""
    geolocated_footage:    bool = False
    official_acknowledgment: bool = False
    matching_press:        bool = False
    coordinates_given:     bool = False
    landmarks_visible:     bool = False


class ExtractedEvent(BaseModel):
    """Structured output from the entity extraction LLM call."""
    has_event:            bool
    skip_reason:          str | None = None

    # Only present when has_event is True
    event_type:           EventType | None = None
    occurred_at:          datetime | None = None
    location_name:        str | None = None
    oblast:               str | None = None
    lat:                  float | None = None
    lng:                  float | None = None
    actor:                str | None = None
    description:          str | None = None
    geolocation_signals:  GeolocationSignal = Field(default_factory=GeolocationSignal)
    is_high_impact:       bool = False  # mass casualty or escalatory — triggers held_for_review


class ConfidenceAssessment(BaseModel):
    """Output of the confidence scorer."""
    confidence:           Confidence
    source_count:         int
    platform_count:       int
    has_geolocation:      bool
    has_official_ack:     bool
    held_for_review:      bool
    reasoning:            str


class TranslationResult(BaseModel):
    """Result of running the translator on a raw post."""
    language:    str | None = None       # ISO 639-1, e.g. "ru", "ar"; None if undetermined
    translation: str | None = None       # English text; None if source is English or skipped
    skipped:     bool       = False      # True when the pre-filter skipped the API call
    skip_reason: str | None = None       # "empty" | "english_heuristic" | "link_only" | None


class BriefingInput(BaseModel):
    """Structured input fed to the briefing LLM call."""
    theater:              str
    period_start:         datetime
    period_end:           datetime
    events:               list[dict]   # serialised Event + source_count
    baseline_7d:          dict         # {oblast: avg_events_per_day}
    notable_shifts:       list[str]    # human-readable delta strings


class BriefingOutput(BaseModel):
    """Structured output from the briefing LLM call."""
    draft_text:           str
    referenced_event_ids: list[uuid.UUID]
    confidence_summary:   str          # one-liner: "X verified, Y partial, Z unconfirmed"


# ── Job payload schemas ────────────────────────────────────────────────────────

class IngestSourcePayload(BaseModel):
    source_id:    uuid.UUID
    since_hours:  int = 24


class ExtractEventsPayload(BaseModel):
    raw_post_ids: list[uuid.UUID]
    source_id:    uuid.UUID


class GenerateBriefingPayload(BaseModel):
    theater:      str = "ukraine"
    period_hours: int = 24
