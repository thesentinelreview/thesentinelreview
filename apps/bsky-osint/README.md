# bsky-osint

Discover, score, and export public Bluesky handles for conflict and national security OSINT monitoring across Ukraine, Iran, Sudan, and Myanmar.

> **DISCLAIMER**: This tool is for public OSINT source discovery and media-monitoring workflows only. It does not verify claims automatically. Analysts must review source context, timestamps, media authenticity, and corroboration before using outputs. Do not use for harassment, doxxing, real-time tactical targeting, or any purpose that violates platform terms of service.

---

## Installation

```bash
cd apps/bsky-osint
pip install -e .

# Optional: LLM-assisted post filtering and source classification
pip install -e ".[llm]"
```

## Usage

### Discover sources across regions

```bash
bsky-osint discover --regions Ukraine Iran Sudan Myanmar --window 7d --quality high --output outputs/sources.csv --format csv json md
```

### Score a pre-existing seed list

```bash
bsky-osint score --input data/seed_handles.csv --window 30d --output outputs/scored.md --format md
```

### Re-export in additional formats

```bash
bsky-osint export --input outputs/sources.json --format csv md --output-dir outputs
```

### Enable LLM enrichment (Haiku + Sonnet)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bsky-osint discover --regions Ukraine --window 7d --llm-enrich --output outputs/sources.csv
```

---

## Configuration

Edit `config.yaml` to adjust:
- Keywords per region and language
- Quality thresholds (high ≥ 75, medium ≥ 50)
- LLM model selection

---

## Output formats

| Format | Description |
|---|---|
| `csv` | Spreadsheet-ready, all fields |
| `json` | Full structured data including sample posts |
| `md` | Markdown table ranked by score |

---

## Scoring

Scores are 0–100, deterministic:

| Component | Max |
|---|--:|
| Primary source links | 30 |
| Media / evidence attached | 25 |
| Regional / local expertise | 20 |
| Known affiliation signals | 15 |
| Recent activity in window | 10 |

Confidence: **High** ≥ 75 · **Medium** ≥ 50 · **Low** < 50

With `--llm-enrich`, Claude Haiku pre-filters noisy posts and Claude Sonnet classifies source categories from bios and sample posts.

---

## Safety constraints

- Only public Bluesky API endpoints — no login, no scraping
- PII (phone numbers, email addresses, home addresses) stripped from posts before scoring
- Posts with doxxing or violence language are dropped
- Accounts with doxxing patterns are rejected
- Posts with tactical real-time movement language are flagged as `sensitive` and require analyst review
- No real-time precision targeting functionality

---

## Adding seed handles

Edit `data/seed_handles.csv`. Columns: `handle,category,regions,notes`

```csv
handle,category,regions,notes
bellingcat.com,osint,"Ukraine,Myanmar,Iran",Open-source investigations
```
