from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from ..config import settings
from ..db import get_conn, upsert_cve
from .base import BaseFeed

log = structlog.get_logger()

_NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"
_SEVERITY_MAP = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
    "NONE": "none",
}


def _parse_severity(cvss_data: dict[str, Any] | None) -> tuple[float | None, str | None, str | None]:
    if not cvss_data:
        return None, None, None
    score = cvss_data.get("baseScore")
    vector = cvss_data.get("vectorString")
    severity = _SEVERITY_MAP.get((cvss_data.get("baseSeverity") or "").upper())
    return score, vector, severity


class NVDFeed(BaseFeed):
    """CVE data from NIST NVD API v2."""

    feed_handle = "nvd_cve"
    feed_type = "cve_nvd"

    def fetch(self, feed_id: uuid.UUID) -> list[dict[str, Any]]:
        # NVD ingestor writes directly to cves table; returns empty list for IOC pipeline
        return []

    def sync_cves(self, since_days: int = 1) -> int:
        since = datetime.now(timezone.utc) - timedelta(days=since_days)
        pub_start = since.strftime("%Y-%m-%dT%H:%M:%S.000")
        pub_end = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000")

        total_upserted = 0
        start_index = 0
        results_per_page = 2000
        headers = {}
        if settings.nvd_api_key:
            headers["apiKey"] = settings.nvd_api_key

        while True:
            params = {
                "pubStartDate": pub_start,
                "pubEndDate": pub_end,
                "startIndex": start_index,
                "resultsPerPage": results_per_page,
            }
            resp = self._get(_NVD_BASE, params=params, headers=headers)
            data = resp.json()

            total_results = data.get("totalResults", 0)
            vulns = data.get("vulnerabilities", [])

            with get_conn() as conn:
                for item in vulns:
                    cve = item.get("cve", {})
                    cve_id = cve.get("id", "")
                    if not cve_id:
                        continue

                    published_str = cve.get("published", "")
                    modified_str = cve.get("lastModified", published_str)
                    try:
                        published_at = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
                        modified_at = datetime.fromisoformat(modified_str.replace("Z", "+00:00"))
                    except ValueError:
                        continue

                    desc = next(
                        (d["value"] for d in cve.get("descriptions", []) if d.get("lang") == "en"),
                        "",
                    )

                    metrics = cve.get("metrics", {})
                    cvss_v31 = next(iter(metrics.get("cvssMetricV31", [])), {})
                    cvss_v30 = next(iter(metrics.get("cvssMetricV30", [])), {})
                    cvss_data = (cvss_v31 or cvss_v30).get("cvssData") or {}
                    score, vector, severity = _parse_severity(cvss_data)

                    refs = [r.get("url", "") for r in cve.get("references", [])]
                    affected = [
                        {"vendor": n.get("vendor", ""), "product": n.get("product", "")}
                        for conf in cve.get("configurations", [])
                        for node in conf.get("nodes", [])
                        for n in node.get("cpeMatch", [])
                    ]

                    upsert_cve(
                        conn,
                        cve_id=cve_id,
                        published_at=published_at,
                        modified_at=modified_at,
                        cvss_v3_score=score,
                        cvss_v3_vector=vector,
                        severity=severity,
                        description=desc,
                        affected_products=affected,
                        references=refs,
                    )
                    total_upserted += 1
                conn.commit()

            start_index += len(vulns)
            log.info("nvd.progress", upserted=total_upserted, total=total_results)

            if start_index >= total_results:
                break

            # NVD rate limit: 5 req/30s without key, 50 req/30s with key
            time.sleep(6 if not settings.nvd_api_key else 0.6)

        return total_upserted
