from __future__ import annotations

import csv
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Union

from .bluesky_client import BlueskyClient
from .config import AppConfig
from .llm_enricher import LLMEnricher, NoopEnricher
from .models import CandidateSource, RawPost, SamplePost
from .safety import filter_posts as safety_filter_posts
from .utils import extract_external_links_from_post, is_primary_source_link, now_utc, parse_dt

logger = logging.getLogger(__name__)

Enricher = Union[LLMEnricher, NoopEnricher]

# Actor search terms by region for bio-based discovery
_ACTOR_SEARCH_TERMS: dict[str, list[str]] = {
    "Ukraine": ["Ukraine OSINT", "Ukraine journalist", "Ukraine reporter", "Ukraine news", "Ukraine conflict"],
    "Iran": ["Iran journalist", "Iran OSINT", "Iran news", "IRGC analyst"],
    "Sudan": ["Sudan journalist", "Sudan reporter", "Sudan OSINT", "Sudan news"],
    "Myanmar": ["Myanmar journalist", "Myanmar news", "Burma reporter", "Myanmar OSINT"],
}


def _window_since(days: int) -> str:
    dt = datetime.now(tz=timezone.utc) - timedelta(days=days)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_post(item: dict, query: str = "", region: str = "", keywords: list[str] | None = None) -> RawPost | None:
    post = item.get("post") or item  # getAuthorFeed wraps in {"post": ...}
    record = post.get("record") or {}
    author = post.get("author") or {}
    handle = author.get("handle", "")
    if not handle:
        return None

    text = record.get("text") or ""
    created_at = parse_dt(record.get("createdAt"))
    if created_at is None:
        return None

    embed = record.get("embed") or {}
    embed_type = embed.get("$type") or ""
    has_media = any(t in embed_type for t in ("images", "video", "recordWithMedia"))
    media_types: list[str] = []
    if "images" in embed_type:
        media_types.append("image")
    if "video" in embed_type:
        media_types.append("video")
    if "external" in embed_type:
        has_media = True
        media_types.append("external")

    ext_links = extract_external_links_from_post(record)

    matched_kws: list[str] = []
    if keywords:
        text_lower = text.lower()
        matched_kws = [kw for kw in keywords if kw.lower() in text_lower]

    return RawPost(
        uri=post.get("uri", ""),
        cid=post.get("cid", ""),
        author_handle=handle,
        author_did=author.get("did", ""),
        text=text,
        created_at=created_at,
        indexed_at=parse_dt(post.get("indexedAt")),
        langs=record.get("langs") or [],
        reply_count=post.get("replyCount", 0),
        repost_count=post.get("repostCount", 0),
        like_count=post.get("likeCount", 0),
        quote_count=post.get("quoteCount", 0),
        has_media=has_media,
        media_types=media_types,
        external_links=ext_links,
        matched_query=query,
        matched_region=region,
        matched_keywords=matched_kws,
    )


class DiscoveryEngine:
    def __init__(
        self,
        client: BlueskyClient,
        config: AppConfig,
        enricher: Enricher | None = None,
    ):
        self._client = client
        self._cfg = config
        self._enricher: Enricher = enricher or NoopEnricher()

    def build_queries(self, region: str, window_days: int) -> list[tuple[str, list[str]]]:
        """Return list of (query_string, matched_keywords) for the region."""
        region_cfg = self._cfg.regions.get(region)
        if not region_cfg:
            return []
        since = _window_since(window_days)
        queries: list[tuple[str, list[str]]] = []
        for lang, kws in region_cfg.keywords.items():
            if not kws:
                continue
            # Build bundles of up to 5 keywords to avoid overly long queries
            for i in range(0, min(len(kws), 15), 5):
                bundle = kws[i : i + 5]
                terms = " OR ".join(f'"{kw}"' if " " in kw else kw for kw in bundle)
                queries.append((terms, bundle))
        return queries

    def search_posts_for_region(self, region: str, window_days: int) -> list[RawPost]:
        since = _window_since(window_days)
        queries = self.build_queries(region, window_days)
        all_posts: list[RawPost] = []
        seen_uris: set[str] = set()

        for q_str, kws in queries:
            cursor: str | None = None
            pages = 0
            while pages < 3:  # max 3 pages per query to stay polite
                try:
                    data = self._client.search_posts(q=q_str, limit=100, cursor=cursor, since=since)
                except Exception as exc:
                    logger.warning("searchPosts failed for '%s': %s", q_str, exc)
                    break
                for item in data.get("posts") or []:
                    post = _parse_post({"post": item} if "record" in item else item, q_str, region, kws)
                    if post and post.uri not in seen_uris:
                        seen_uris.add(post.uri)
                        all_posts.append(post)
                cursor = data.get("cursor")
                if not cursor:
                    break
                pages += 1

        # Apply safety + optional LLM filter
        all_posts = safety_filter_posts(all_posts)
        all_posts = self._enricher.filter_posts(all_posts)
        logger.info("Region %s: %d posts after filtering", region, len(all_posts))
        return all_posts

    def search_actors_for_region(self, region: str) -> list[str]:
        """Return a list of handles discovered via actor search."""
        terms = _ACTOR_SEARCH_TERMS.get(region, [f"{region} journalist", f"{region} OSINT"])
        handles: list[str] = []
        seen: set[str] = set()
        for term in terms[:3]:  # limit actor queries per region
            try:
                data = self._client.search_actors(q=term, limit=25)
            except Exception as exc:
                logger.warning("searchActors failed for '%s': %s", term, exc)
                continue
            for actor in data.get("actors") or []:
                h = actor.get("handle", "")
                if h and h not in seen:
                    seen.add(h)
                    handles.append(h)
        return handles

    def _enrich_handle(self, handle: str, partial: CandidateSource) -> CandidateSource:
        try:
            profile = self._client.get_profile(handle)
        except Exception as exc:
            logger.warning("getProfile failed for %s: %s", handle, exc)
            return partial

        did = profile.get("did", partial.did)
        display_name = profile.get("displayName") or partial.display_name
        description = profile.get("description") or partial.description
        followers = profile.get("followersCount", partial.followers_count)
        following = profile.get("followsCount", partial.following_count)
        posts_count = profile.get("postsCount", partial.posts_count)

        # Fetch recent feed
        sample_posts: list[SamplePost] = list(partial.sample_posts)
        media_posts = partial.media_posts_count
        link_posts = partial.link_posts_count
        primary_links = partial.primary_source_link_count
        official_links = partial.official_domain_link_count
        recent_scanned = partial.recent_posts_scanned
        langs: set[str] = set(partial.languages_detected)

        try:
            feed_data = self._client.get_author_feed(handle, limit=50)
            for item in feed_data.get("feed") or []:
                raw = _parse_post(item, region=partial.regions[0] if partial.regions else "")
                if raw is None:
                    continue
                recent_scanned += 1
                if raw.has_media:
                    media_posts += 1
                if raw.external_links:
                    link_posts += 1
                for link in raw.external_links:
                    if is_primary_source_link(link):
                        primary_links += 1
                langs.update(raw.langs)
                if len(sample_posts) < 5:
                    sample_posts.append(SamplePost(
                        text=raw.text,
                        created_at=raw.created_at,
                        url=f"https://bsky.app/profile/{handle}/post/{raw.uri.split('/')[-1]}",
                        has_media=raw.has_media,
                        links=raw.external_links,
                    ))
        except Exception as exc:
            logger.warning("getAuthorFeed failed for %s: %s", handle, exc)

        enriched = partial.model_copy(update={
            "did": did,
            "display_name": display_name,
            "description": description,
            "profile_url": f"https://bsky.app/profile/{handle}",
            "followers_count": followers,
            "following_count": following,
            "posts_count": posts_count,
            "recent_posts_scanned": recent_scanned,
            "media_posts_count": media_posts,
            "link_posts_count": link_posts,
            "primary_source_link_count": primary_links,
            "official_domain_link_count": official_links,
            "languages_detected": sorted(langs),
            "sample_posts": sample_posts,
            "first_seen_at": partial.first_seen_at or now_utc(),
        })

        # LLM classification (optional)
        category, llm_rationale = self._enricher.classify_source(enriched)
        return enriched.model_copy(update={
            "source_category": category,
            "rationale": llm_rationale or enriched.rationale,
        })

    def collect_candidates(
        self,
        regions: list[str],
        window_days: int,
    ) -> dict[str, CandidateSource]:
        """Full discovery pass: posts + actors → partial candidates."""
        partials: dict[str, CandidateSource] = {}

        for region in regions:
            posts = self.search_posts_for_region(region, window_days)
            for post in posts:
                h = post.author_handle
                if h not in partials:
                    partials[h] = CandidateSource(
                        handle=h,
                        did=post.author_did,
                        regions=[],
                        first_seen_at=now_utc(),
                    )
                src = partials[h]
                if region not in src.regions:
                    src.regions.append(region)
                partials[h] = src.model_copy(update={
                    "relevant_posts_count": src.relevant_posts_count + 1,
                    "matched_keywords": list(set(src.matched_keywords + post.matched_keywords)),
                    "matched_queries": list(set(src.matched_queries + ([post.matched_query] if post.matched_query else []))),
                })

            for handle in self.search_actors_for_region(region):
                if handle not in partials:
                    partials[handle] = CandidateSource(
                        handle=handle,
                        regions=[region],
                        first_seen_at=now_utc(),
                    )
                elif region not in partials[handle].regions:
                    partials[handle].regions.append(region)

        # Enrich all candidates
        enriched: dict[str, CandidateSource] = {}
        for handle, partial in partials.items():
            enriched[handle] = self._enrich_handle(handle, partial)

        return enriched

    def collect_from_seed_csv(
        self,
        seed_path: Path,
        window_days: int,
    ) -> dict[str, CandidateSource]:
        """Enrich a pre-existing seed list rather than doing keyword search."""
        candidates: dict[str, CandidateSource] = {}
        with open(seed_path, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                handle = row.get("handle", "").strip().lstrip("@")
                if not handle:
                    continue
                category_raw = row.get("category", "unknown").strip().lower().replace(" ", "_")
                regions_raw = [r.strip() for r in row.get("regions", "").split(",") if r.strip()]
                partial = CandidateSource(
                    handle=handle,
                    source_category=category_raw if category_raw in {  # type: ignore[arg-type]
                        "journalist", "osint", "local_media", "government",
                        "emergency_services", "researcher", "aggregator"
                    } else "unknown",
                    regions=regions_raw,
                    first_seen_at=now_utc(),
                )
                candidates[handle] = self._enrich_handle(handle, partial)
        return candidates
