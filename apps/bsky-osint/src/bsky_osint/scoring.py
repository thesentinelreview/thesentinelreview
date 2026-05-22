from __future__ import annotations

import math
import re

from .models import CandidateSource, Confidence

# Bio signals indicating regional/conflict expertise
_REGION_BIO_KEYWORDS = {
    "Ukraine": ["ukraine", "kyiv", "ukrainian", "donbas", "kharkiv", "dnipro", "odesa"],
    "Iran": ["iran", "iranian", "tehran", "irgc", "persian"],
    "Sudan": ["sudan", "sudanese", "khartoum", "darfur", "rsf", "saf"],
    "Myanmar": ["myanmar", "burma", "burmese", "junta", "rohingya"],
}

_KNOWN_AFFILIATION_KEYWORDS = [
    "journalist", "reporter", "correspondent", "editor", "news", "press",
    "osint", "open source", "geolocation", "verification", "bellingcat",
    "researcher", "analyst", "think tank", "institute", "policy",
    "government", "ministry", "official", "embassy", "military",
    "ngo", "ngos", "humanitarian", "aid worker",
    "conflict", "war", "defense", "security",
]

# Matches custom domain handles (e.g., bellingcat.com) but not standard .bsky.social handles
_DOMAIN_HANDLE_RE = re.compile(r"(?<!\.bsky)\.(?:com|org|net|gov|edu|io|app|media|news|pub|int)$")


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def score_candidate(source: CandidateSource) -> tuple[float, Confidence, str]:
    """Return (score 0-100, confidence bucket, rationale string)."""
    parts: list[str] = []

    # --- Component 1: primary source links (max 30) ---
    if source.relevant_posts_count > 0:
        ratio = source.primary_source_link_count / source.relevant_posts_count
    else:
        ratio = 0.0
    c1 = _clamp(ratio) * 30
    if c1 > 0:
        parts.append(f"links primary sources in {source.primary_source_link_count} posts")

    # --- Component 2: media / evidence (max 25) ---
    if source.recent_posts_scanned > 0:
        media_ratio = source.media_posts_count / source.recent_posts_scanned
    else:
        media_ratio = 0.0
    c2 = _clamp(media_ratio) * 25
    if c2 > 0:
        parts.append(f"media attached to {source.media_posts_count}/{source.recent_posts_scanned} recent posts")

    # --- Component 3: regional / local expertise (max 20) ---
    c3 = 0.0
    bio_lower = source.description.lower()
    # region-specific bio signals
    bio_region_hits = sum(
        1 for region in source.regions
        for kw in _REGION_BIO_KEYWORDS.get(region, [])
        if kw in bio_lower
    )
    if bio_region_hits:
        c3 += min(10.0, bio_region_hits * 3.0)
        parts.append(f"bio mentions region ({bio_region_hits} signals)")
    # post concentration on target regions
    if source.relevant_posts_count >= 3:
        c3 += 10.0
        parts.append("concentrated posting on target region")

    # --- Component 4: affiliation / verification discipline (max 15) ---
    c4 = 0.0
    aff_hits = sum(1 for kw in _KNOWN_AFFILIATION_KEYWORDS if kw in bio_lower)
    if aff_hits:
        c4 += min(8.0, aff_hits * 2.0)
        parts.append(f"bio shows professional affiliation ({aff_hits} signals)")
    # domain handle (e.g., bellingcat.com) is a strong credibility signal
    if _DOMAIN_HANDLE_RE.search(source.handle):
        c4 += 7.0
        parts.append("verified domain handle")

    # --- Component 5: recent activity (max 10) ---
    c5 = 0.0
    if source.relevant_posts_count >= 5:
        c5 = 10.0
    elif source.relevant_posts_count >= 2:
        c5 = 6.0
    elif source.relevant_posts_count >= 1:
        c5 = 3.0
    if c5 > 0:
        parts.append(f"{source.relevant_posts_count} relevant posts in window")

    score = round(c1 + c2 + c3 + c4 + c5, 1)
    score = min(100.0, score)

    if score >= 75:
        confidence: Confidence = "high"
    elif score >= 50:
        confidence = "medium"
    else:
        confidence = "low"

    rationale = "; ".join(parts) if parts else "insufficient signals"
    return score, confidence, rationale
