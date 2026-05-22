"""
GDELT 2.0 ingestors.

Two classes share this module:
  - GdeltEventsIngestor  — GDELT events database (conflict events, CAMEO codes)
  - GdeltGkgIngestor     — GDELT Global Knowledge Graph (themes, tone, entities)

Both read from the latest 15-minute update file only; no backfill.
GDELT publishes new files every 15 minutes; the runner enqueues these sources
every 30 minutes so at most two files are skipped between ingest cycles.

GDELT data: https://www.gdeltproject.org/data.html
"""
from __future__ import annotations

import csv
import io
import zipfile
from datetime import datetime, timedelta, timezone

import httpx
import structlog

from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"
_TIMEOUT = 60

# Maps GDELT ActionGeo_CountryCode → theater name
_COUNTRY_THEATER: dict[str, str] = {
    "UP": "ukraine",
    "IR": "iran",
    "BM": "myanmar",
    "SU": "sudan",
}

# Reverse: theater → country code for filtering
_THEATER_COUNTRY: dict[str, str] = {v: k for k, v in _COUNTRY_THEATER.items()}

# CAMEO EventRootCode values to ingest (assault, fight, mass violence, protest)
_CAMEO_CODES = {"18", "19", "20", "15"}

_CAMEO_LABELS: dict[str, str] = {
    "15": "Protest",
    "18": "Assault",
    "19": "Fighting",
    "20": "Mass violence",
}

# Themes that indicate conflict / security relevance in GDELT GKG
_GKG_THEMES = {
    "MILITARY", "ARMED_CONFLICT", "WMD", "TERRORIST", "KILL", "WOUND",
    "CRISISLEX_C03_TERROR", "CRISISLEX_C04_HIGHKILL", "CRISISLEX_T01_CIVIL_UNREST",
    "WAR", "CONFLICT", "NUCLEAR",
}

# GDELT Events CSV column indices (zero-based)
_COL_EVENT_ID    = 0
_COL_DATE_ADDED  = 1
_COL_ROOT_CODE   = 28
_COL_COUNTRY     = 51
_COL_GEO_NAME    = 53
_COL_LAT         = 55
_COL_LNG         = 56
_COL_SOURCE_URL  = 57
_COL_NUM_MENTIONS = 31
_COL_AVG_TONE    = 34

# GDELT GKG v2.1 CSV column indices (zero-based)
# https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/
_GKG_COL_ID      = 0   # GKGRECORDID
_GKG_COL_DATE    = 1   # DATE
_GKG_COL_SRC_URL = 3   # SOURCES (semicolon-delimited)
_GKG_COL_THEMES  = 7   # V2THEMES (semicolon-delimited "theme,charOffset" pairs)
_GKG_COL_LOCS    = 9   # V2LOCATIONS (semicolon-delimited "#"-separated fields)
_GKG_COL_TONE    = 15  # V2TONE (first value is overall tone)


def _get_lastupdate_urls() -> tuple[str, str]:
    """Return (events_zip_url, gkg_zip_url) from GDELT lastupdate.txt."""
    resp = httpx.get(_LASTUPDATE_URL, timeout=_TIMEOUT)
    resp.raise_for_status()
    lines = [ln.strip() for ln in resp.text.strip().splitlines() if ln.strip()]
    # Each line: "<size> <md5> <url>"
    def _url(line: str) -> str:
        return line.split()[-1]
    events_url = _url(lines[0])
    gkg_url = _url(lines[2]) if len(lines) >= 3 else ""
    return events_url, gkg_url


def _download_and_unzip(url: str) -> bytes:
    resp = httpx.get(url, timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        name = zf.namelist()[0]
        return zf.read(name)


def _parse_gdelt_date(date_str: str) -> datetime | None:
    """Parse GDELT DATEADDED format: yyyymmddHHMMSS"""
    try:
        return datetime.strptime(date_str[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    except (ValueError, IndexError):
        return None


class GdeltEventsIngestor(BaseIngestor):
    """Ingest GDELT 2.0 conflict events for a single theater."""

    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        theater = (self.source.get("theaters") or ["ukraine"])[0]
        country_code = _THEATER_COUNTRY.get(theater)
        if not country_code:
            log.warning("gdelt_unknown_theater", theater=theater)
            return []

        try:
            events_url, _ = _get_lastupdate_urls()
            raw_csv = _download_and_unzip(events_url)
        except Exception as exc:
            log.error("gdelt_events_download_error", theater=theater, error=str(exc))
            return []

        results: list[RawPostData] = []
        reader = csv.reader(io.StringIO(raw_csv.decode("utf-8", errors="replace")), delimiter="\t")

        for row in reader:
            try:
                if len(row) <= _COL_SOURCE_URL:
                    continue
                if row[_COL_ROOT_CODE] not in _CAMEO_CODES:
                    continue
                if row[_COL_COUNTRY] != country_code:
                    continue

                posted_at = _parse_gdelt_date(row[_COL_DATE_ADDED])
                if posted_at is None:
                    continue

                event_id = row[_COL_EVENT_ID]
                geo_name = row[_COL_GEO_NAME] or "Unknown location"
                source_url = row[_COL_SOURCE_URL]
                cameo_label = _CAMEO_LABELS.get(row[_COL_ROOT_CODE], row[_COL_ROOT_CODE])
                num_mentions = row[_COL_NUM_MENTIONS] if len(row) > _COL_NUM_MENTIONS else ""
                avg_tone = row[_COL_AVG_TONE] if len(row) > _COL_AVG_TONE else ""

                text = (
                    f"{cameo_label} in {geo_name}.\n"
                    f"Mentions: {num_mentions}  Tone: {avg_tone}\n"
                    f"Source: {source_url}"
                )

                results.append(
                    RawPostData(
                        external_id=f"gdelt_{event_id}",
                        posted_at=posted_at,
                        text=text,
                        media_urls=[],
                        archive_url=source_url or None,
                        lang="en",
                    )
                )

                if len(results) >= 50:
                    break

            except Exception as exc:
                log.warning("gdelt_events_row_error", error=str(exc))
                continue

        log.debug("gdelt_events_fetched", theater=theater, count=len(results))
        return results


class GdeltGkgIngestor(BaseIngestor):
    """Ingest GDELT Global Knowledge Graph records for a single theater."""

    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        theater = (self.source.get("theaters") or ["ukraine"])[0]
        country_code = _THEATER_COUNTRY.get(theater)
        if not country_code:
            log.warning("gdelt_gkg_unknown_theater", theater=theater)
            return []

        try:
            _, gkg_url = _get_lastupdate_urls()
            if not gkg_url:
                log.warning("gdelt_gkg_no_url")
                return []
            raw_csv = _download_and_unzip(gkg_url)
        except Exception as exc:
            log.error("gdelt_gkg_download_error", theater=theater, error=str(exc))
            return []

        results: list[RawPostData] = []
        reader = csv.reader(
            io.StringIO(raw_csv.decode("utf-8", errors="replace")), delimiter="\t"
        )

        for row in reader:
            try:
                if len(row) <= max(_GKG_COL_THEMES, _GKG_COL_LOCS, _GKG_COL_TONE):
                    continue

                # Check themes for conflict relevance
                themes_raw = row[_GKG_COL_THEMES]
                themes = {t.split(",")[0] for t in themes_raw.split(";") if t}
                if not themes & _GKG_THEMES:
                    continue

                # Check locations for theater country code
                locs_raw = row[_GKG_COL_LOCS]
                loc_country_codes = set()
                for loc in locs_raw.split(";"):
                    parts = loc.split("#")
                    if len(parts) >= 3:
                        loc_country_codes.add(parts[2])
                if country_code not in loc_country_codes:
                    continue

                posted_at = _parse_gdelt_date(row[_GKG_COL_DATE])
                if posted_at is None:
                    continue

                record_id = row[_GKG_COL_ID]
                src_url = row[_GKG_COL_SRC_URL].split(";")[0] if row[_GKG_COL_SRC_URL] else ""
                tone_raw = row[_GKG_COL_TONE].split(",")[0] if row[_GKG_COL_TONE] else ""
                matched_themes = sorted(themes & _GKG_THEMES)

                text = (
                    f"GDELT GKG record for {theater}.\n"
                    f"Themes: {', '.join(matched_themes)}\n"
                    f"Tone: {tone_raw}\n"
                    f"Source: {src_url}"
                )

                results.append(
                    RawPostData(
                        external_id=f"gdelt_gkg_{record_id}",
                        posted_at=posted_at,
                        text=text,
                        media_urls=[],
                        archive_url=src_url or None,
                        lang="en",
                    )
                )

                if len(results) >= 30:
                    break

            except Exception as exc:
                log.warning("gdelt_gkg_row_error", error=str(exc))
                continue

        log.debug("gdelt_gkg_fetched", theater=theater, count=len(results))
        return results
