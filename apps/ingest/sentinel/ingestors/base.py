"""Abstract base class for all platform ingestors."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TypedDict


class RawPostData(TypedDict):
    external_id:  str
    posted_at:    object          # datetime
    text:         str
    media_urls:   list[str]
    archive_url:  str | None
    lang:         str | None


class BaseIngestor(ABC):
    def __init__(self, source: dict) -> None:
        self.source = source

    @abstractmethod
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        """Fetch posts from the platform. Returns a list of raw post dicts."""
        ...
