from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from dateutil.parser import parse as dateutil_parse

PRIMARY_SOURCE_DOMAINS = {
    # news / wire
    "reuters.com", "apnews.com", "bbc.co.uk", "bbc.com", "rferl.org",
    "nytimes.com", "washingtonpost.com", "theguardian.com", "ft.com",
    # Ukraine
    "kyivindependent.com", "pravda.com.ua", "ukrinform.ua", "mil.gov.ua",
    "president.gov.ua",
    # OSINT / verification
    "bellingcat.com", "liveuamap.com", "osintukraine.com",
    "lighthousereports.com", "c4ads.org",
    # research
    "isw.pub", "understandingwar.org", "iiss.org",
    # Sudan
    "sudantribune.com", "radiotamazuj.org",
    # Myanmar
    "myanmar-now.org", "frontiermyanmar.net", "dvb.no",
    # official / archive
    "archive.org", "web.archive.org",
    # general NGO
    "hrw.org", "amnesty.org", "icrc.org", "un.org", "unocha.org",
}

_URL_RE = re.compile(r"https?://([^/\s]+)")


def extract_links(text: str) -> list[str]:
    return _URL_RE.findall(text)


def is_primary_source_link(url: str) -> bool:
    m = _URL_RE.match(url)
    if not m:
        m = re.match(r"([^/\s]+)", url)
    domain = m.group(1).lower().lstrip("www.") if m else ""
    return any(domain == d or domain.endswith("." + d) for d in PRIMARY_SOURCE_DOMAINS)


def extract_external_links_from_post(post_record: dict) -> list[str]:
    links: list[str] = []
    embed = post_record.get("embed") or {}
    # external embed
    external = embed.get("external") or {}
    if uri := external.get("uri"):
        links.append(uri)
    # facets (linked text)
    for facet in post_record.get("facets") or []:
        for feature in facet.get("features") or []:
            if feature.get("$type") == "app.bsky.richtext.facet#link":
                if u := feature.get("uri"):
                    links.append(u)
    # inline URLs in text
    links.extend(_URL_RE.findall(post_record.get("text") or ""))
    return list(dict.fromkeys(links))  # deduplicate preserving order


def parse_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        dt = dateutil_parse(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)
