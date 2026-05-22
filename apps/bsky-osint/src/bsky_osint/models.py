from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SamplePost(BaseModel):
    text: str
    created_at: datetime
    url: str
    has_media: bool = False
    links: list[str] = Field(default_factory=list)


SourceCategory = Literal[
    "journalist",
    "osint",
    "local_media",
    "government",
    "emergency_services",
    "researcher",
    "aggregator",
    "unknown",
]

Confidence = Literal["high", "medium", "low"]


class CandidateSource(BaseModel):
    handle: str
    did: str = ""
    display_name: str = ""
    description: str = ""
    profile_url: str = ""
    source_category: SourceCategory = "unknown"
    regions: list[str] = Field(default_factory=list)
    languages_detected: list[str] = Field(default_factory=list)
    followers_count: int = 0
    following_count: int = 0
    posts_count: int = 0
    recent_posts_scanned: int = 0
    relevant_posts_count: int = 0
    media_posts_count: int = 0
    link_posts_count: int = 0
    primary_source_link_count: int = 0
    official_domain_link_count: int = 0
    last_post_at: datetime | None = None
    first_seen_at: datetime | None = None
    last_scored_at: datetime | None = None
    quality_score: float = 0.0
    confidence: Confidence = "low"
    rationale: str = ""
    sensitive: bool = False
    sample_posts: list[SamplePost] = Field(default_factory=list)
    matched_keywords: list[str] = Field(default_factory=list)
    matched_queries: list[str] = Field(default_factory=list)


class RawPost(BaseModel):
    uri: str
    cid: str = ""
    author_handle: str
    author_did: str = ""
    text: str
    created_at: datetime
    indexed_at: datetime | None = None
    langs: list[str] = Field(default_factory=list)
    reply_count: int = 0
    repost_count: int = 0
    like_count: int = 0
    quote_count: int = 0
    has_media: bool = False
    media_types: list[str] = Field(default_factory=list)
    external_links: list[str] = Field(default_factory=list)
    matched_query: str = ""
    matched_region: str = ""
    matched_keywords: list[str] = Field(default_factory=list)
