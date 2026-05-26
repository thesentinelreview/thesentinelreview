"""
One-shot dry-run for the weapon_type classifier (PR 1 verification gate).

Re-runs the live extractor on a sample of recent raw_posts per theater and reports
the weapon_type distribution + a spread of sample classifications, so an operator
can confirm classification quality BEFORE the change is merged. The printed block
is paste-ready markdown for the PR description.

Read-only: issues SELECTs and LLM calls but never writes to the database (no
insert_event / log_llm_call / mark_post_processed / update_post_translation).
Designed to run from GitHub Actions via the sentinel-dryrun-weapon-type workflow,
where DATABASE_URL and ANTHROPIC_API_KEY are provided as repo secrets.

Configured via env vars:
  SENTINEL_DRYRUN_SAMPLE      (default 50)   — most-recent posts sampled per theater
  SENTINEL_DRYRUN_RATE_LIMIT  (default 4.0)  — max extract_event calls per second
"""
from __future__ import annotations

import os
import time
from collections import Counter
from dataclasses import dataclass, field

import psycopg
import structlog

from sentinel.config import settings
from sentinel.db import get_conn
from sentinel.models import WEAPON_TYPES
from sentinel.pipeline.extractor import extract_event

log = structlog.get_logger()

THEATERS: tuple[str, ...] = ("ukraine", "iran", "sudan", "myanmar")

NULL_KEY = "(null)"

# Keyword families used ONLY to flag likely mixed-weapon descriptions in the report
# (a reviewer aid). Never used for classification — that stays the LLM's job.
_WEAPON_KEYWORDS: dict[str, tuple[str, ...]] = {
    "artillery": ("artiller", "shell", "mortar", "mlrs", "grad", "himars", "rocket"),
    "drone":     ("drone", "uav", "fpv", "shahed", "bayraktar", "loitering"),
    "missile":   ("missile", "ballistic", "cruise", "iskander", "kinzhal", "anti-ship"),
    "armor":     ("tank", "armor", "armour", "ifv", "apc", "mechani"),
    "infantry":  ("infantry", "small-arms", "small arms", "ground assault", "raid"),
    "naval":     ("naval", "warship", "frigate", "vessel", "gunboat"),
}


@dataclass
class TheaterResult:
    theater: str
    posts: int = 0                                       # posts sampled + classified
    events: int = 0                                      # has_event == True
    nulls: int = 0                                       # has_event but weapon_type is None
    dist: Counter[str] = field(default_factory=Counter)  # weapon_type -> count (events only)
    samples: list[tuple[str, str | None, bool]] = field(default_factory=list)  # (desc, wt, mixed)

    @property
    def null_pct(self) -> float:
        return 100.0 * self.nulls / self.events if self.events else 0.0


def _config() -> dict:
    return {
        "sample":   int(os.environ.get("SENTINEL_DRYRUN_SAMPLE", "50")),
        "rate_rps": float(os.environ.get("SENTINEL_DRYRUN_RATE_LIMIT", "4.0")),
    }


def _sample_posts(conn: psycopg.Connection, *, theater: str, limit: int) -> list[dict]:
    """Most-recent posts whose source covers this theater, non-empty text only."""
    rows = conn.execute(
        """
        SELECT rp.id,
               rp.text,
               rp.translated_text,
               rp.posted_at,
               s.display_name,
               s.platform,
               s.trust_tier
        FROM raw_posts rp
        JOIN sources s ON s.id = rp.source_id
        WHERE %s = ANY (s.theaters)
          AND length(btrim(COALESCE(rp.translated_text, rp.text))) > 0
        ORDER BY rp.posted_at DESC
        LIMIT %s
        """,
        (theater, limit),
    ).fetchall()
    return rows  # type: ignore[return-value]


def _mixed(description: str) -> bool:
    """Heuristic: does the description touch more than one weapon family?"""
    text = description.lower()
    hits = sum(1 for kws in _WEAPON_KEYWORDS.values() if any(k in text for k in kws))
    return hits > 1


def _select_samples(
    samples: list[tuple[str, str | None, bool]],
    k: int = 10,
) -> list[tuple[str, str | None, bool]]:
    """Up to k samples maximizing weapon_type variety, surfacing mixed-flagged rows first."""
    # mixed-flagged first, then grouped by weapon_type for a stable, varied spread.
    order = sorted(range(len(samples)), key=lambda i: (not samples[i][2], samples[i][1] or "~"))
    chosen: list[int] = []
    seen: set[str] = set()
    for i in order:                       # one per distinct weapon_type
        wt = samples[i][1] or NULL_KEY
        if wt not in seen:
            chosen.append(i)
            seen.add(wt)
        if len(chosen) >= k:
            break
    for i in order:                       # fill remaining slots
        if len(chosen) >= k:
            break
        if i not in chosen:
            chosen.append(i)
    return [samples[i] for i in chosen]


def _render_report(results: list[TheaterResult], *, model: str, sample: int) -> str:
    cols = list(WEAPON_TYPES) + [NULL_KEY]
    lines: list[str] = [
        "## Weapon-type dry-run",
        "",
        f"Model `{model}` · {sample} most-recent posts/theater · read-only (no DB writes)",
        "",
        "### Distribution (events only)",
        "",
        "| theater | events | " + " | ".join(cols) + " | null % |",
        "|" + "---|" * (len(cols) + 3),
    ]
    for r in results:
        cells = " | ".join(str(r.dist.get(c, 0)) for c in cols)
        flag = " ⚠️" if r.null_pct > 30 else ""
        lines.append(f"| {r.theater} | {r.events} | {cells} | {r.null_pct:.0f}%{flag} |")

    lines += ["", "### Sample classifications", ""]
    for r in results:
        lines.append(f"#### {r.theater}")
        picked = _select_samples(r.samples)
        if not picked:
            lines += ["_(no events extracted in this sample)_", ""]
            continue
        for desc, wt, mixed in picked:
            d = " ".join((desc or "").split())
            if len(d) > 160:
                d = d[:159] + "…"
            tag = " _(mixed?)_" if mixed else ""
            lines.append(f"- `{wt or NULL_KEY}` — {d}{tag}")
        lines.append("")
    return "\n".join(lines)


def run_dryrun(conn: psycopg.Connection | None = None) -> list[TheaterResult]:
    """Classify a recent-post sample per theater and print a markdown report.

    Opens its own connection when `conn` is None. Returns per-theater results so
    callers (the GitHub Actions wrapper, tests) can log a final tally.
    """
    cfg = _config()
    log.info("weapon_dryrun_start", **cfg)

    interval = 1.0 / cfg["rate_rps"] if cfg["rate_rps"] > 0 else 0.0
    next_call_at = time.monotonic()

    own_conn = conn is None
    if own_conn:
        conn_ctx = get_conn()
        conn = conn_ctx.__enter__()
    assert conn is not None

    results: list[TheaterResult] = []
    try:
        for theater in THEATERS:
            res = TheaterResult(theater=theater)
            for post in _sample_posts(conn, theater=theater, limit=cfg["sample"]):
                res.posts += 1
                source = {
                    "display_name": post["display_name"],
                    "platform": post["platform"],
                    "trust_tier": post["trust_tier"],
                }
                text = post["translated_text"] or post["text"]

                now = time.monotonic()
                if now < next_call_at:
                    time.sleep(next_call_at - now)
                next_call_at = time.monotonic() + interval

                try:
                    event, _meta = extract_event(
                        text,
                        source=source,
                        theater=theater,
                        post_timestamp=post["posted_at"],
                    )
                except Exception:
                    log.exception("weapon_dryrun_extract_failed", theater=theater)
                    continue

                if not event.has_event:
                    continue
                res.events += 1
                wt = event.weapon_type
                res.dist[wt or NULL_KEY] += 1
                if wt is None:
                    res.nulls += 1
                res.samples.append((event.description or "", wt, _mixed(event.description or "")))

            log.info(
                "weapon_dryrun_theater",
                theater=theater,
                posts=res.posts,
                events=res.events,
                nulls=res.nulls,
                null_pct=round(res.null_pct, 1),
            )
            results.append(res)
    finally:
        if own_conn:
            conn_ctx.__exit__(None, None, None)  # type: ignore[union-attr]

    print(
        _render_report(results, model=settings.anthropic_model_extract, sample=cfg["sample"]),
        flush=True,
    )
    return results
