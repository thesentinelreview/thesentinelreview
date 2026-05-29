"""
Unit tests for sentinel.ingestors.gdelt.GdeltEventsIngestor.

Regression guard for the GDELT 2.0 column-index bug: the ActionGeo_CountryCode
filter and DATEADDED were mis-indexed (51/1 instead of 53/59), so the country
check compared ActionGeo_Type (an int 0-5) against "UP"/"IR"/... and discarded
100% of rows for every theater. These tests pin the corrected GDELT 2.0 layout
by feeding a synthetic 61-column Events row through fetch().
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

from sentinel.ingestors.gdelt import GdeltEventsIngestor


def _row(overrides: dict[int, str] | None = None) -> list[str]:
    """A synthetic GDELT 2.0 Event row (61 columns, 0-based)."""
    row = [""] * 61
    row[0] = "1234567890"                  # GLOBALEVENTID
    row[1] = "20260529"                    # SQLDATE (must NOT be read as DATEADDED)
    row[28] = "19"                         # EventRootCode -> "Fighting"
    row[31] = "7"                          # NumMentions
    row[34] = "-5.2"                       # AvgTone
    row[52] = "Bakhmut, Ukraine"           # ActionGeo_FullName
    row[53] = "UP"                         # ActionGeo_CountryCode (Ukraine)
    row[56] = "48.5956"                    # ActionGeo_Lat
    row[57] = "37.9999"                    # ActionGeo_Long
    row[59] = "20260529120000"             # DATEADDED (yyyymmddHHMMSS)
    row[60] = "https://example.com/article"  # SOURCEURL
    for idx, val in (overrides or {}).items():
        row[idx] = val
    return row


def _tsv(*rows: list[str]) -> bytes:
    return ("\n".join("\t".join(r) for r in rows)).encode("utf-8")


def _fetch_with(csv_bytes: bytes, theater: str = "ukraine"):
    ingestor = GdeltEventsIngestor(
        {"handle": f"gdelt_{theater}", "platform": "gdelt", "theaters": [theater]}
    )
    with patch(
        "sentinel.ingestors.gdelt._get_lastupdate_urls",
        return_value=("http://x/events.CSV.zip", ""),
    ), patch(
        "sentinel.ingestors.gdelt._download_and_unzip", return_value=csv_bytes
    ):
        return ingestor.fetch(since_hours=24)


class TestGdeltEventsColumnMapping:
    def test_ukraine_cameo_row_is_ingested(self) -> None:
        # Core regression: under the old (51/1) indices this yielded 0 events.
        results = _fetch_with(_tsv(_row()))
        assert len(results) == 1
        post = results[0]
        assert post["external_id"] == "gdelt_1234567890"
        assert post["posted_at"] == datetime(2026, 5, 29, 12, 0, 0, tzinfo=timezone.utc)
        assert post["archive_url"] == "https://example.com/article"
        # corrected geo + CAMEO label land in the text the extractor reads
        assert "Fighting" in post["text"]
        assert "Bakhmut, Ukraine" in post["text"]
        assert "48.5956, 37.9999" in post["text"]

    def test_wrong_country_is_filtered(self) -> None:
        # An Iran row must not be returned for the ukraine theater.
        assert _fetch_with(_tsv(_row({53: "IR"}))) == []

    def test_non_cameo_root_is_filtered(self) -> None:
        # EventRootCode 01 (public statement) is not a conflict CAMEO code.
        assert _fetch_with(_tsv(_row({28: "01"}))) == []

    def test_actiongeo_type_at_col51_is_not_used_as_country(self) -> None:
        # A "UP" decoy at the old (buggy) country index 51 must be ignored; the
        # real ActionGeo_CountryCode at 53 is "US", so nothing is returned.
        r = _row({53: "US"})
        r[51] = "UP"
        assert _fetch_with(_tsv(r)) == []

    def test_short_row_is_skipped(self) -> None:
        assert _fetch_with(_tsv(["only", "three", "cols"])) == []

    def test_mixed_rows_keep_only_matching(self) -> None:
        results = _fetch_with(
            _tsv(
                _row(),                        # UP + 19 (Fighting) -> keep
                _row({53: "IR"}),              # wrong country
                _row({28: "01"}),              # non-CAMEO root
                _row({0: "999", 28: "18"}),    # UP + 18 (Assault) -> keep
            )
        )
        assert {p["external_id"] for p in results} == {"gdelt_1234567890", "gdelt_999"}
