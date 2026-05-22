from __future__ import annotations

import csv
import json
from pathlib import Path

from .models import CandidateSource

_CSV_FIELDS = [
    "rank", "handle", "display_name", "source_category", "regions",
    "quality_score", "confidence", "rationale", "profile_url",
    "followers_count", "relevant_posts_count", "media_posts_count",
    "primary_source_link_count", "languages_detected", "sensitive",
    "last_scored_at",
]

_WARNING = (
    "> **DISCLAIMER**: This tool is for public OSINT source discovery and "
    "media-monitoring workflows. It does not verify claims automatically. "
    "Analysts must review source context, timestamps, media authenticity, "
    "and corroboration before using outputs.\n"
)


def _ranked(sources: list[CandidateSource]) -> list[tuple[int, CandidateSource]]:
    sorted_sources = sorted(sources, key=lambda s: s.quality_score, reverse=True)
    return [(i + 1, s) for i, s in enumerate(sorted_sources)]


def export_csv(sources: list[CandidateSource], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=_CSV_FIELDS)
        writer.writeheader()
        for rank, src in _ranked(sources):
            writer.writerow({
                "rank": rank,
                "handle": src.handle,
                "display_name": src.display_name,
                "source_category": src.source_category,
                "regions": "|".join(src.regions),
                "quality_score": src.quality_score,
                "confidence": src.confidence,
                "rationale": src.rationale,
                "profile_url": src.profile_url,
                "followers_count": src.followers_count,
                "relevant_posts_count": src.relevant_posts_count,
                "media_posts_count": src.media_posts_count,
                "primary_source_link_count": src.primary_source_link_count,
                "languages_detected": "|".join(src.languages_detected),
                "sensitive": src.sensitive,
                "last_scored_at": src.last_scored_at.isoformat() if src.last_scored_at else "",
            })


def export_json(sources: list[CandidateSource], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    records = []
    for rank, src in _ranked(sources):
        data = json.loads(src.model_dump_json())
        data["rank"] = rank
        records.append(data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, default=str, ensure_ascii=False)


def export_markdown(sources: list[CandidateSource], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Bluesky Conflict OSINT Source Discovery Results\n",
        _WARNING,
        "| Rank | Handle | Display Name | Category | Regions | Score | Confidence | Rationale | Profile URL |",
        "|---:|---|---|---|---|---:|---|---|---|",
    ]
    for rank, src in _ranked(sources):
        regions = ", ".join(src.regions)
        handle_cell = f"`{src.handle}`"
        url_cell = f"[profile]({src.profile_url})" if src.profile_url else ""
        sensitive_tag = " ⚠️" if src.sensitive else ""
        lines.append(
            f"| {rank} | {handle_cell}{sensitive_tag} | {src.display_name} | "
            f"{src.source_category} | {regions} | {src.quality_score:.1f} | "
            f"{src.confidence} | {src.rationale} | {url_cell} |"
        )
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
