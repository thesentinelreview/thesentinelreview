from __future__ import annotations

import logging
import re

from .models import CandidateSource, RawPost

logger = logging.getLogger(__name__)

# PII patterns
_PHONE_RE = re.compile(
    r"(?<!\w)(\+?\d[\d\s\-().]{7,}\d)(?!\w)"
)
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_HOME_ADDRESS_RE = re.compile(
    r"\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|"
    r"Boulevard|Blvd|Court|Ct|Place|Pl|Way|Terrace|Ter)\b",
    re.IGNORECASE,
)

# Violence / doxxing patterns
_VIOLENCE_RE = re.compile(
    r"\b(kill\s+him|kill\s+her|hunt\s+down|find\s+and\s+kill|execute\s+him|"
    r"target\s+this\s+person|attack\s+this\s+person|doxx(?:ing|ed)?)\b",
    re.IGNORECASE,
)

# Tactical real-time precision movement
_TACTICAL_RE = re.compile(
    r"\b(troop\s+position\s+at|convoy\s+at\s+grid|exact\s+coordinates|"
    r"gps\s+coord|lat\s*[:\-]\s*\d|lng\s*[:\-]\s*\d|"
    r"soldiers?\s+at\s+\d{1,3}\.\d+|unit\s+moving\s+toward)\b",
    re.IGNORECASE,
)


def _has_pii(text: str) -> bool:
    return bool(_EMAIL_RE.search(text) or _HOME_ADDRESS_RE.search(text))


def _has_violence(text: str) -> bool:
    return bool(_VIOLENCE_RE.search(text))


def filter_posts(posts: list[RawPost]) -> list[RawPost]:
    clean: list[RawPost] = []
    for post in posts:
        if _has_pii(post.text):
            logger.debug("Dropped post %s: PII detected", post.uri)
            continue
        if _has_violence(post.text):
            logger.debug("Dropped post %s: violence/doxxing language", post.uri)
            continue
        clean.append(post)
    return clean


def flag_sensitive(source: CandidateSource) -> CandidateSource:
    for sp in source.sample_posts:
        if _TACTICAL_RE.search(sp.text):
            logger.info("Flagged %s as sensitive: tactical real-time language", source.handle)
            return source.model_copy(update={"sensitive": True})
    return source


def check_candidate(source: CandidateSource) -> bool:
    """Return True if the candidate is safe to include, False to reject."""
    all_text = " ".join(sp.text for sp in source.sample_posts)
    all_text += " " + source.description
    if _has_violence(all_text):
        logger.info("Rejected %s: violence/doxxing language in profile or posts", source.handle)
        return False
    return True
