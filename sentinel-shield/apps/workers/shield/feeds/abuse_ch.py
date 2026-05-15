from __future__ import annotations

import csv
import io
import uuid
from typing import Any

import structlog

from .base import BaseFeed

log = structlog.get_logger()

_SEVERITY_MAP = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "low": "low",
}


class MalwareBazaarFeed(BaseFeed):
    """SHA256 malware hashes from Abuse.ch MalwareBazaar."""

    feed_handle = "abuse_bazaar"
    feed_type = "abuse_ioc"

    def fetch(self, feed_id: uuid.UUID) -> list[dict[str, Any]]:
        resp = self._get("https://bazaar.abuse.ch/export/txt/sha256/recent/")
        iocs: list[dict[str, Any]] = []
        for line in resp.text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if len(line) != 64:
                continue
            iocs.append({
                "feed_id": feed_id,
                "ioc_type": "hash_sha256",
                "value": line.lower(),
                "threat_type": "malware",
                "confidence": 80,
                "severity": "high",
                "raw_data": {"source": "malwarebazaar"},
            })
        log.info("malwarebazaar.fetched", count=len(iocs))
        return iocs


class URLhausFeed(BaseFeed):
    """Malicious URLs from Abuse.ch URLhaus."""

    feed_handle = "abuse_urlhaus"
    feed_type = "abuse_ioc"

    def fetch(self, feed_id: uuid.UUID) -> list[dict[str, Any]]:
        resp = self._get("https://urlhaus.abuse.ch/downloads/csv_recent/")
        iocs: list[dict[str, Any]] = []
        reader = csv.DictReader(
            line for line in resp.text.splitlines() if not line.startswith("#")
        )
        for row in reader:
            url = (row.get("url") or "").strip()
            if not url:
                continue
            iocs.append({
                "feed_id": feed_id,
                "ioc_type": "url",
                "value": url,
                "threat_type": "malware",
                "malware_family": row.get("tags") or None,
                "confidence": 85,
                "severity": "high",
                "raw_data": {
                    "source": "urlhaus",
                    "threat": row.get("threat"),
                    "tags": row.get("tags"),
                },
            })
        log.info("urlhaus.fetched", count=len(iocs))
        return iocs


class ThreatFoxFeed(BaseFeed):
    """IOCs from Abuse.ch ThreatFox (last 24h)."""

    feed_handle = "abuse_threatfox"
    feed_type = "abuse_ioc"

    _TYPE_MAP = {
        "md5_hash": "hash_md5",
        "sha256_hash": "hash_sha256",
        "ip:port": "ip",
        "domain": "domain",
        "url": "url",
    }

    def fetch(self, feed_id: uuid.UUID) -> list[dict[str, Any]]:
        resp = self._post(
            "https://threatfox-api.abuse.ch/api/v1/",
            json={"query": "get_iocs", "days": 1},
        )
        data = resp.json()
        if data.get("query_status") != "ok":
            log.warning("threatfox.bad_status", status=data.get("query_status"))
            return []

        iocs: list[dict[str, Any]] = []
        for entry in data.get("data") or []:
            raw_type = entry.get("ioc_type", "")
            ioc_type = self._TYPE_MAP.get(raw_type)
            if not ioc_type:
                continue
            value = entry.get("ioc", "").strip()
            # Strip port from ip:port format
            if raw_type == "ip:port" and ":" in value:
                value = value.rsplit(":", 1)[0]
            if not value:
                continue
            confidence = min(int(entry.get("confidence_level", 50) or 50), 100)
            iocs.append({
                "feed_id": feed_id,
                "ioc_type": ioc_type,
                "value": value,
                "threat_type": entry.get("threat_type"),
                "malware_family": entry.get("malware"),
                "confidence": confidence,
                "severity": "high" if confidence >= 75 else "medium",
                "tags": (entry.get("tags") or "").split(",") if entry.get("tags") else [],
                "raw_data": {
                    "source": "threatfox",
                    "malware_printable": entry.get("malware_printable"),
                    "reporter": entry.get("reporter"),
                },
            })
        log.info("threatfox.fetched", count=len(iocs))
        return iocs
