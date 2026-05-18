# The Sentinel Review — Automated News Aggregator

A fully automated national security news site. RSS feeds from 18 trusted sources → auto-categorized by region/topic → rendered into a polished site → deployed live. Updates every 8 hours, with zero manual work.

## What You're Getting

- **`aggregate.py`** — Fetches 18 RSS feeds, categorizes stories, generates `index.html` and `feed.xml`
- **`template.html`** — The site design, with placeholders where news gets inserted
- **`generate_briefing.py`** — Reads `feed.xml` and sends a daily morning briefing email via Buttondown
- **`post_to_x.py`** — Posts one new story per run to X (Twitter); tracks state in `posted_state.json`
- **`posted_state.json`** — Persists which URLs have been posted to X (committed by the workflow bot)
- **`requirements.txt`** — Python dependencies (`feedparser`, `python-dateutil`, `tweepy`)
- **`.github/workflows/main.yml`** — Runs the aggregator and X poster every 8 hours
- **`.github/workflows/briefing.yml`** — Runs the briefing generator daily at 01:00 UTC
- **`readme.md`** — This file

## How It Works

```
                          every 8 hours
   ┌─────────────────┐ ─────────────────▶ ┌─────────────────┐
   │  GitHub Actions │                    │  aggregate.py   │
   │  (main.yml)     │                    └────────┬────────┘
   └─────────────────┘                             │
                                                   ▼
                                          ┌─────────────────┐
                                          │ Fetches 18 RSS  │
                                          │ feeds, sorts,   │
                                          │ categorizes     │
                                          └──────┬──┬───────┘
                                                 │  │
                              ┌──────────────────┘  └──────────────────┐
                              ▼                                         ▼
                     ┌────────────────┐                       ┌─────────────────┐
                     │  index.html    │                       │  post_to_x.py   │
                     │  feed.xml      │                       │  (1 tweet/run)  │
                     │  regenerated   │                       └─────────────────┘
                     └───────┬────────┘
                             │ git push
                             ▼
                    ┌────────────────────┐
                    │  Cloudflare Pages  │
                    │   auto-deploys     │
                    └─────────┬──────────┘
                              ▼
                   🌐 Live site updated

   ┌─────────────────┐    daily 01:00 UTC   ┌──────────────────────┐
   │  GitHub Actions │ ───────────────────▶ │ generate_briefing.py │
   │  (briefing.yml) │                      └──────────┬───────────┘
   └─────────────────┘                                 │
                                                       ▼
                                             ┌──────────────────┐
                                             │  Buttondown API  │
                                             │  schedules email │
                                             │  for 09:23 UTC   │
                                             └──────────────────┘
```

## Setup — One Time, ~20 Minutes

### Step 1 — Create a GitHub account (free)
Go to [github.com](https://github.com) and sign up if you don't have one.

### Step 2 — Create a new repository
1. Click the **+** icon (top right) → **New repository**
2. Name it: `sentinel-review` (or anything you like)
3. Set it to **Public** (free GitHub Actions minutes) or Private (2,000 free minutes/month — plenty)
4. Check **"Add a README file"**
5. Click **Create repository**

### Step 3 — Upload the project files
1. In your new repo, click **"Add file"** → **"Upload files"**
2. Drag in these files:
   - `aggregate.py`
   - `generate_briefing.py`
   - `post_to_x.py`
   - `template.html`
   - `requirements.txt`
   - `readme.md` (optional)
3. **Important — workflow files go in a subfolder:**
   - Click **"Add file"** → **"Create new file"**
   - Type `.github/workflows/main.yml` in the filename box (slashes create folders)
   - Paste the contents of `main.yml`; repeat for `briefing.yml`

### Step 4 — Run the aggregator for the first time
1. Go to the **Actions** tab in your repository
2. Click **"I understand my workflows, go ahead and enable them"** if prompted
3. Click **"Aggregate News"** in the left sidebar
4. Click **"Run workflow"** → **"Run workflow"**
5. Wait ~1 minute. `index.html` and `feed.xml` will appear in your repo.

### Step 5 — Connect Cloudflare Pages for hosting (free)
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up or log in
2. Navigate to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. Authorize Cloudflare, choose **GitHub**, and select your repo
4. **Build command**: leave empty
5. **Build output directory**: `.` (just a dot)
6. Click **Save and Deploy** — your site is live in ~30 seconds

### Step 6 — Configure secrets
Add these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Used by |
|--------|---------|
| `BUTTONDOWN_API_KEY` | `briefing.yml` — sends the daily email |
| `X_API_KEY` | `main.yml` — posts to X |
| `X_API_SECRET` | `main.yml` |
| `X_ACCESS_TOKEN` | `main.yml` |
| `X_ACCESS_TOKEN_SECRET` | `main.yml` |
| `X_BEARER_TOKEN` | `main.yml` (optional) |

### Step 7 — Custom domain (optional, ~$12/year)
Buy a domain from Namecheap or Cloudflare, then: **Cloudflare Pages → your project → Custom domains → Set up a custom domain**.

## That's it. Your site is now fully automated.

Every 8 hours, GitHub Actions runs the aggregator, regenerates the site, commits changes, and Cloudflare Pages redeploys. The daily briefing email goes out at 09:23 UTC. You don't need to do anything.

---

## Customization

### Change the update frequency
Edit `.github/workflows/main.yml`, find this line:
```yaml
- cron: '5 */8 * * *'
```
Replace with:
- Every 2 hours: `'5 */2 * * *'`
- Every 6 hours: `'5 */6 * * *'`
- Every morning at 6 AM UTC: `'0 6 * * *'`

### Change the briefing delivery time
In `generate_briefing.py`, update:
```python
SCHEDULED_DELIVERY_HOUR_UTC = 9
SCHEDULED_DELIVERY_MINUTE_UTC = 23
```
And adjust the cron in `briefing.yml` to fire a few hours before delivery.

### Add or remove RSS feeds
Open `aggregate.py`, find the `FEEDS` list, add entries like:
```python
{"name": "New Source", "url": "https://example.com/rss", "source_tag": "Source Name"},
```

### Add new categories
In `aggregate.py`, find the `CATEGORIES` dict and add:
```python
"Space": {
    "icon": "🛰️",
    "keywords": ["space force", "satellite", "orbital", "spacex", "nasa"]
},
```

### Change colors, fonts, layout
Edit `template.html`. The CSS variables at the top of the `<style>` block control the whole theme.

---

## Newsletter (Buttondown)

The daily briefing is sent via [Buttondown](https://buttondown.com). Set the `BUTTONDOWN_API_KEY` secret and set `BRIEFING_MODE` in `briefing.yml` to one of:

- `schedule` — creates the email with a future `publish_date`; Buttondown delivers it precisely (current default)
- `send` — sends immediately when the workflow runs
- `draft` — saves as a draft for manual review before sending

---

## Testing Locally

```bash
pip install -r requirements.txt
python aggregate.py        # generates index.html + feed.xml
python generate_briefing.py  # requires BUTTONDOWN_API_KEY in environment
# Open index.html in your browser
```

---

## Troubleshooting

**Workflow fails with "feed not found"** — One of the RSS URLs may have changed. The script continues past failures, so the site still updates with other sources. Search "[publication name] RSS" to find a replacement.

**Site isn't updating** — Check the **Actions** tab. Green runs with no commits mean the feeds returned the same stories. Red runs: click into the run to see the error.

**Cloudflare Pages isn't redeploying** — Ensure the Pages project is connected to the `main` branch. Each commit triggers a rebuild. Check **Workers & Pages → your project → Deployments** for logs.

**Briefing not arriving** — Check `briefing.yml` run logs. Verify `BUTTONDOWN_API_KEY` is set and that `BRIEFING_MODE` is `schedule` or `send` (not `draft`).

**Categories are miscategorizing stories** — Tune the keywords in the `CATEGORIES` dict. Keywords are matched case-insensitively; longer/more-specific phrases score higher.

---

## Legal Notes

This site aggregates headlines and brief excerpts (under 280 characters) from public RSS feeds, with prominent attribution and links back to original sources. This follows standard news aggregation fair-use conventions (similar to Google News, RealClearDefense).

If you plan to monetize significantly or scale, consult a media lawyer. Don't republish full articles.

---

## Questions?

Come back to Claude and ask. This project is built to be easily modified — describe what you want changed and Claude can generate the update.
