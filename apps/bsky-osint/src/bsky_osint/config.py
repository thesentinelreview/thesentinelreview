from __future__ import annotations

import os
from pathlib import Path

import yaml
from pydantic import BaseModel


class LLMConfig(BaseModel):
    model_filter: str = "claude-haiku-4-5-20251001"
    model_classify: str = "claude-sonnet-4-6"
    filter_batch_size: int = 20
    classify_batch_size: int = 5


class RegionConfig(BaseModel):
    languages: list[str]
    keywords: dict[str, list[str]]


class AppConfig(BaseModel):
    regions: dict[str, RegionConfig]
    source_types: list[str]
    quality_thresholds: dict[str, int]
    windows: dict[str, int]
    llm: LLMConfig = LLMConfig()

    def window_days(self, window: str) -> int:
        if window not in self.windows:
            raise ValueError(f"Unknown window '{window}'. Valid: {list(self.windows)}")
        return self.windows[window]

    def quality_min_score(self, quality: str) -> int:
        if quality not in self.quality_thresholds:
            raise ValueError(f"Unknown quality '{quality}'. Valid: {list(self.quality_thresholds)}")
        return self.quality_thresholds[quality]


_DEFAULT_CONFIG_PATH = Path(__file__).parent.parent.parent / "config.yaml"


def load_config(path: Path | None = None) -> AppConfig:
    config_path = path or Path(os.environ.get("BSKY_OSINT_CONFIG", str(_DEFAULT_CONFIG_PATH)))
    with open(config_path) as f:
        raw = yaml.safe_load(f)

    # env overrides for LLM models
    if "BSKY_OSINT_LLM_FILTER_MODEL" in os.environ:
        raw.setdefault("llm", {})["model_filter"] = os.environ["BSKY_OSINT_LLM_FILTER_MODEL"]
    if "BSKY_OSINT_LLM_CLASSIFY_MODEL" in os.environ:
        raw.setdefault("llm", {})["model_classify"] = os.environ["BSKY_OSINT_LLM_CLASSIFY_MODEL"]

    return AppConfig(**raw)
