import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from bsky_osint.exporters import export_csv, export_json, export_markdown
from bsky_osint.models import CandidateSource

_NOW = datetime(2024, 6, 1, tzinfo=timezone.utc)


def _sources():
    return [
        CandidateSource(
            handle="bellingcat.com",
            display_name="Bellingcat",
            source_category="osint",
            regions=["Ukraine", "Iran"],
            quality_score=92.0,
            confidence="high",
            rationale="Verified OSINT organization",
            profile_url="https://bsky.app/profile/bellingcat.com",
            last_scored_at=_NOW,
        ),
        CandidateSource(
            handle="myanmar-now.bsky.social",
            display_name="Myanmar Now",
            source_category="local_media",
            regions=["Myanmar"],
            quality_score=55.0,
            confidence="medium",
            rationale="Local news outlet",
            profile_url="https://bsky.app/profile/myanmar-now.bsky.social",
            last_scored_at=_NOW,
        ),
    ]


def test_csv_headers(tmp_path):
    out = tmp_path / "out.csv"
    export_csv(_sources(), out)
    with open(out) as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
    assert "handle" in headers
    assert "quality_score" in headers
    assert "confidence" in headers
    assert "rank" in headers


def test_csv_rank_order(tmp_path):
    out = tmp_path / "out.csv"
    export_csv(_sources(), out)
    with open(out) as f:
        rows = list(csv.DictReader(f))
    assert rows[0]["handle"] == "bellingcat.com"
    assert rows[0]["rank"] == "1"
    assert rows[1]["rank"] == "2"


def test_json_valid(tmp_path):
    out = tmp_path / "out.json"
    export_json(_sources(), out)
    with open(out) as f:
        data = json.load(f)
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["handle"] == "bellingcat.com"
    assert data[0]["rank"] == 1


def test_json_regions_preserved(tmp_path):
    out = tmp_path / "out.json"
    export_json(_sources(), out)
    with open(out) as f:
        data = json.load(f)
    assert "Ukraine" in data[0]["regions"]


def test_markdown_table_headers(tmp_path):
    out = tmp_path / "out.md"
    export_markdown(_sources(), out)
    content = out.read_text()
    assert "| Rank |" in content
    assert "| Handle |" in content
    assert "| Score |" in content
    assert "| Confidence |" in content


def test_markdown_contains_disclaimer(tmp_path):
    out = tmp_path / "out.md"
    export_markdown(_sources(), out)
    content = out.read_text()
    assert "DISCLAIMER" in content


def test_markdown_rank_order(tmp_path):
    out = tmp_path / "out.md"
    export_markdown(_sources(), out)
    content = out.read_text()
    lines = [l for l in content.splitlines() if l.startswith("|") and "bellingcat" in l or (l.startswith("|") and "myanmar" in l.lower())]
    bellingcat_line = next((l for l in content.splitlines() if "bellingcat" in l), "")
    myanmar_line = next((l for l in content.splitlines() if "myanmar-now" in l), "")
    assert "| 1 |" in bellingcat_line
    assert "| 2 |" in myanmar_line


def test_sensitive_flag_shown_in_markdown(tmp_path):
    sources = _sources()
    sources[0] = sources[0].model_copy(update={"sensitive": True})
    out = tmp_path / "out.md"
    export_markdown(sources, out)
    content = out.read_text()
    assert "⚠️" in content
