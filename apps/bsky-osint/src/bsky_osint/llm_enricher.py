from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING

try:
    import anthropic
except ImportError:
    anthropic = None  # type: ignore[assignment]

from .models import CandidateSource, RawPost, SourceCategory

logger = logging.getLogger(__name__)

_FILTER_SYSTEM = (
    "You are a conflict-intelligence analyst. "
    "Given a list of Bluesky posts about a conflict region, "
    "return a JSON array of booleans (one per post, same order). "
    "True = the post contains first-hand observation, primary-source reporting, "
    "official statement, verified geolocation, or original media evidence. "
    "False = opinion, commentary, repost noise, or unverifiable rumour."
)

_CLASSIFY_SYSTEM = (
    "You are a conflict-intelligence analyst. "
    "Classify a Bluesky account into exactly one source category based on "
    "the handle, bio, and sample posts provided. "
    "Respond with a JSON object: {\"category\": \"<category>\", \"rationale\": \"<one sentence>\"}. "
    "Valid categories: journalist, osint, local_media, government, "
    "emergency_services, researcher, aggregator, unknown."
)


class LLMEnricher:
    def __init__(self, filter_model: str, classify_model: str):
        if anthropic is None:
            raise ImportError(
                "anthropic package required for LLM enrichment. "
                "Install with: pip install 'bsky-osint[llm]'"
            )
        self._client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        self._filter_model = filter_model
        self._classify_model = classify_model

    def filter_posts(self, posts: list[RawPost]) -> list[RawPost]:
        if not posts:
            return posts
        payload = [{"index": i, "text": p.text} for i, p in enumerate(posts)]
        prompt = (
            f"Region context: {posts[0].matched_region or 'conflict zone'}.\n\n"
            f"Posts:\n{json.dumps(payload, ensure_ascii=False)}\n\n"
            "Return a JSON array of booleans, one per post, same order."
        )
        try:
            msg = self._client.messages.create(
                model=self._filter_model,
                max_tokens=512,
                system=_FILTER_SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = msg.content[0].text.strip()
            # strip markdown fences if present
            if text.startswith("```"):
                text = text.split("```")[1].lstrip("json").strip()
            flags: list[bool] = json.loads(text)
            if len(flags) != len(posts):
                logger.warning("LLM filter returned %d flags for %d posts; keeping all", len(flags), len(posts))
                return posts
            kept = [p for p, keep in zip(posts, flags) if keep]
            logger.debug("LLM filter: %d/%d posts kept", len(kept), len(posts))
            return kept
        except Exception as exc:
            logger.warning("LLM filter failed (%s); keeping all posts", exc)
            return posts

    def classify_source(self, source: CandidateSource) -> tuple[SourceCategory, str]:
        samples = "\n".join(f"- {sp.text[:200]}" for sp in source.sample_posts[:5])
        prompt = (
            f"Handle: {source.handle}\n"
            f"Display name: {source.display_name}\n"
            f"Bio: {source.description}\n"
            f"Sample posts:\n{samples or '(none)'}\n\n"
            "Classify this account."
        )
        try:
            msg = self._client.messages.create(
                model=self._classify_model,
                max_tokens=256,
                system=_CLASSIFY_SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            )
            text = msg.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("```")[1].lstrip("json").strip()
            result = json.loads(text)
            category = result.get("category", "unknown")
            rationale = result.get("rationale", "")
            valid = {"journalist", "osint", "local_media", "government", "emergency_services", "researcher", "aggregator", "unknown"}
            if category not in valid:
                category = "unknown"
            return category, rationale  # type: ignore[return-value]
        except Exception as exc:
            logger.warning("LLM classify failed for %s (%s); using unknown", source.handle, exc)
            return "unknown", ""


class NoopEnricher:
    """Drop-in stub used when --llm-enrich is off."""

    def filter_posts(self, posts: list[RawPost]) -> list[RawPost]:
        return posts

    def classify_source(self, source: CandidateSource) -> tuple[SourceCategory, str]:
        return source.source_category, source.rationale
