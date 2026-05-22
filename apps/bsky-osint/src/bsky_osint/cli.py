from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Annotated, Optional

import typer
from rich.console import Console
from rich.table import Table

from .bluesky_client import BlueskyClient
from .config import load_config
from .discovery import DiscoveryEngine
from .exporters import export_csv, export_json, export_markdown
from .llm_enricher import LLMEnricher, NoopEnricher
from .models import CandidateSource
from .safety import check_candidate, flag_sensitive
from .scoring import score_candidate
from .utils import now_utc

app = typer.Typer(help="Bluesky conflict & national security OSINT source discovery.")
console = Console()

_VALID_REGIONS = {"Ukraine", "Iran", "Sudan", "Myanmar"}
_VALID_FORMATS = {"csv", "json", "md"}
_VALID_WINDOWS = {"24h", "7d", "30d"}
_VALID_QUALITY = {"high", "medium", "low"}


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        level=getattr(logging, level.upper(), logging.INFO),
    )


def _make_enricher(llm_enrich: bool, cfg) -> LLMEnricher | NoopEnricher:
    if not llm_enrich:
        return NoopEnricher()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        console.print("[yellow]Warning:[/yellow] --llm-enrich requires ANTHROPIC_API_KEY; falling back to no-op enricher.")
        return NoopEnricher()
    return LLMEnricher(
        filter_model=cfg.llm.model_filter,
        classify_model=cfg.llm.model_classify,
    )


def _score_and_filter(
    candidates: dict[str, CandidateSource],
    min_score: int,
) -> list[CandidateSource]:
    results: list[CandidateSource] = []
    for src in candidates.values():
        if not check_candidate(src):
            continue
        src = flag_sensitive(src)
        score, confidence, rationale = score_candidate(src)
        src = src.model_copy(update={
            "quality_score": score,
            "confidence": confidence,
            "rationale": src.rationale or rationale,
            "last_scored_at": now_utc(),
        })
        if score >= min_score:
            results.append(src)
    return results


def _do_export(sources: list[CandidateSource], output: Path, formats: list[str]) -> None:
    base = output.with_suffix("")
    for fmt in formats:
        if fmt == "csv":
            p = output if output.suffix == ".csv" else base.with_suffix(".csv")
            export_csv(sources, p)
            console.print(f"[green]CSV:[/green] {p}")
        elif fmt == "json":
            p = base.with_suffix(".json")
            export_json(sources, p)
            console.print(f"[green]JSON:[/green] {p}")
        elif fmt == "md":
            p = base.with_suffix(".md")
            export_markdown(sources, p)
            console.print(f"[green]Markdown:[/green] {p}")


def _print_summary(sources: list[CandidateSource]) -> None:
    table = Table(title=f"Top results ({len(sources)} sources)")
    table.add_column("Rank", justify="right")
    table.add_column("Handle")
    table.add_column("Category")
    table.add_column("Regions")
    table.add_column("Score", justify="right")
    table.add_column("Conf.")
    ranked = sorted(sources, key=lambda s: s.quality_score, reverse=True)
    for i, src in enumerate(ranked[:20], 1):
        table.add_row(
            str(i),
            src.handle,
            src.source_category,
            ", ".join(src.regions),
            f"{src.quality_score:.1f}",
            src.confidence,
        )
    console.print(table)


@app.command()
def discover(
    regions: Annotated[list[str], typer.Option("--regions", help="Regions to search (Ukraine Iran Sudan Myanmar)")],
    window: Annotated[str, typer.Option(help="Time window: 24h | 7d | 30d")] = "7d",
    quality: Annotated[str, typer.Option(help="Min quality: high | medium | low")] = "high",
    output: Annotated[Path, typer.Option(help="Output file path (extension determines default format)")] = Path("outputs/sources.csv"),
    format: Annotated[list[str], typer.Option("--format", help="Output formats: csv json md")] = ["csv"],
    config: Annotated[Optional[Path], typer.Option(help="Path to config.yaml")] = None,
    llm_enrich: Annotated[bool, typer.Option("--llm-enrich/--no-llm-enrich", help="Use Claude Haiku/Sonnet for post filtering and source classification")] = False,
    log_level: Annotated[str, typer.Option(hidden=True)] = "INFO",
) -> None:
    """Discover and rank Bluesky sources for conflict OSINT monitoring."""
    _setup_logging(log_level)

    for r in regions:
        if r not in _VALID_REGIONS:
            console.print(f"[red]Unknown region:[/red] {r}. Valid: {sorted(_VALID_REGIONS)}")
            raise typer.Exit(1)
    if window not in _VALID_WINDOWS:
        console.print(f"[red]Unknown window:[/red] {window}. Valid: {sorted(_VALID_WINDOWS)}")
        raise typer.Exit(1)
    if quality not in _VALID_QUALITY:
        console.print(f"[red]Unknown quality:[/red] {quality}. Valid: {sorted(_VALID_QUALITY)}")
        raise typer.Exit(1)

    cfg = load_config(config)
    enricher = _make_enricher(llm_enrich, cfg)
    client = BlueskyClient()
    engine = DiscoveryEngine(client, cfg, enricher)

    console.print(f"[bold]Discovering sources[/bold] — regions: {regions}, window: {window}, quality: {quality}")
    candidates = engine.collect_candidates(regions, cfg.window_days(window))
    min_score = cfg.quality_min_score(quality)
    results = _score_and_filter(candidates, min_score)
    console.print(f"Found [bold]{len(results)}[/bold] sources above {quality} threshold (score ≥ {min_score})")

    if results:
        _print_summary(results)
        _do_export(results, output, format)
    else:
        console.print("[yellow]No sources found matching criteria.[/yellow]")


@app.command()
def score(
    input: Annotated[Path, typer.Option(help="CSV of seed handles (columns: handle, category, regions, notes)")],
    window: Annotated[str, typer.Option(help="Time window: 24h | 7d | 30d")] = "30d",
    quality: Annotated[str, typer.Option(help="Min quality: high | medium | low")] = "medium",
    output: Annotated[Path, typer.Option(help="Output file path")] = Path("outputs/scored.md"),
    format: Annotated[list[str], typer.Option("--format", help="Output formats: csv json md")] = ["md"],
    config: Annotated[Optional[Path], typer.Option(help="Path to config.yaml")] = None,
    llm_enrich: Annotated[bool, typer.Option("--llm-enrich/--no-llm-enrich")] = False,
    log_level: Annotated[str, typer.Option(hidden=True)] = "INFO",
) -> None:
    """Enrich and score a pre-existing list of seed handles."""
    _setup_logging(log_level)

    if not input.exists():
        console.print(f"[red]Input file not found:[/red] {input}")
        raise typer.Exit(1)

    cfg = load_config(config)
    enricher = _make_enricher(llm_enrich, cfg)
    client = BlueskyClient()
    engine = DiscoveryEngine(client, cfg, enricher)

    console.print(f"[bold]Scoring seed handles[/bold] from {input}, window: {window}")
    candidates = engine.collect_from_seed_csv(input, cfg.window_days(window))
    min_score = cfg.quality_min_score(quality)
    results = _score_and_filter(candidates, min_score)
    console.print(f"Scored [bold]{len(results)}[/bold] sources above {quality} threshold (score ≥ {min_score})")

    if results:
        _print_summary(results)
        _do_export(results, output, format)
    else:
        console.print("[yellow]No sources found matching criteria.[/yellow]")


@app.command()
def export(
    input: Annotated[Path, typer.Option(help="JSON file from a previous discover/score run")] = Path("outputs/sources.json"),
    format: Annotated[list[str], typer.Option("--format", help="Output formats: csv json md")] = ["csv", "json", "md"],
    output_dir: Annotated[Path, typer.Option(help="Output directory")] = Path("outputs"),
) -> None:
    """Re-export a previous result set in additional formats."""
    import json as _json

    if not input.exists():
        console.print(f"[red]Input file not found:[/red] {input}")
        raise typer.Exit(1)

    with open(input) as f:
        raw = _json.load(f)

    sources = [CandidateSource(**r) for r in raw]
    output_dir.mkdir(parents=True, exist_ok=True)
    base = output_dir / "sources"
    _do_export(sources, base, format)
