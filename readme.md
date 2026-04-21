# The Sentinel Review — Automated News Aggregator

A fully automated national security news site. RSS feeds from 12+ trusted sources → auto-categorized by region/topic → rendered into a polished site → deployed live. Updates every 2 hours, with zero manual work.

## What You're Getting

- **`aggregate.py`** — The Python script that fetches and categorizes news
- **`template.html`** — The site design, with placeholders where news gets inserted
- **`requirements.txt`** — Python dependencies
- **`.github/workflows/aggregate.yml`** — Schedules the script to run every 2 hours
- **`README.md`** — This file

## How It Works

```
   ┌─────────────────┐   every 2 hours    ┌─────────────────┐
   │  GitHub Actions │ ─────────────────▶ │  aggregate.py   │
   └─────────────────┘                    └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  Fetches 12 RSS │
                                          │  feeds, sorts,  │
                                          │  categorizes    │
                                          └────────┬────────┘
                                                   │
                                                   ▼
   ┌─────────────────┐                    ┌─────────────────┐
   │   Netlify       │ ◀───── git push ── │  index.html     │
   │   auto-deploys  │                    │  regenerated    │
   └─────────────────┘                    └─────────────────┘
            │
            ▼
   🌐 Live site updated
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
2. Drag in these four files:
   - `aggregate.py`
   - `template.html`
   - `requirements.txt`
   - `README.md` (this file — optional)
3. **Important — the workflow file goes in a subfolder:**
   - Click **"Add file"** → **"Create new file"**
   - In the filename box, type: `.github/workflows/aggregate.yml` (the slashes create folders automatically)
   - Paste the contents of your `aggregate.yml` file
   - Click **Commit new file**

### Step 4 — Run the aggregator for the first time
1. Go to the **Actions** tab in your repository
2. Click **"I understand my workflows, go ahead and enable them"** if prompted
3. Click **"Aggregate News"** in the left sidebar
4. Click **"Run workflow"** dropdown → **"Run workflow"** button
5. Wait ~1 minute. A new `index.html` file will appear in your repo.

### Step 5 — Connect Netlify for hosting (free)
1. Go to [netlify.com](https://netlify.com) and sign up (use your GitHub account — easiest)
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **GitHub**, authorize Netlify, pick your `sentinel-review` repo
4. For **Build command**: leave empty
5. For **Publish directory**: type `.` (just a dot — means the root folder)
6. Click **Deploy**
7. In ~30 seconds, your site is live at a URL like `yourname-sentinel.netlify.app`

### Step 6 — Rename your site (optional)
In Netlify: **Site configuration → Change site name** → pick something like `sentinel-review`.

### Step 7 — Custom domain (optional, ~$12/year)
Buy a domain from Namecheap or Cloudflare, then: **Netlify → Domain management → Add custom domain**. Netlify walks you through DNS.

## That's it. Your site is now fully automated.

Every 2 hours, GitHub Actions runs the aggregator, regenerates the site, commits changes, and Netlify redeploys. You don't need to do anything.

---

## Customization

### Change the update frequency
Edit `.github/workflows/aggregate.yml`, find this line:
```yaml
- cron: '5 */2 * * *'
```
Replace with:
- Every hour: `'5 * * * *'`
- Every 6 hours: `'5 */6 * * *'`
- Every morning at 6 AM UTC: `'0 6 * * *'`

### Add or remove RSS feeds
Open `aggregate.py`, find the `FEEDS` list at the top, add entries like:
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
Edit `template.html`. The CSS variables at the top of the `<style>` block (lines ~10–25) control the whole theme.

---

## Activating the Newsletter Signup

Right now the subscribe form shows a popup. To actually collect emails:

1. In Netlify → **Forms** → enable forms
2. The form is already set up with `data-netlify="true"` — Netlify auto-detects it on next deploy
3. Submissions appear in your Netlify dashboard (free: 100/month)
4. For larger volume and real email sending, connect to Mailchimp, ConvertKit, or Buttondown

---

## Testing Locally Before Uploading

If you want to run it on your own computer first:
```bash
pip install -r requirements.txt
python aggregate.py
# Open index.html in your browser
```

---

## Troubleshooting

**Workflow fails with "feed not found"** — One of the RSS URLs may have changed. The script continues past failures, so the site still updates with other sources. To find replacement feeds, search "[publication name] RSS".

**Site isn't updating** — Check **Actions** tab on GitHub. If runs are green but no commits, it means nothing changed (feeds returned same stories). If runs are red, click into the run to see the error.

**Netlify isn't redeploying** — Ensure Netlify is connected to the `main` branch of the repo. Each commit should trigger a rebuild.

**Categories are miscategorizing stories** — Tune the keywords in the `CATEGORIES` dict. Keywords are matched case-insensitively; more specific keywords (longer phrases) score higher.

---

## Legal Notes

This site aggregates headlines and brief excerpts (under 280 characters) from public RSS feeds, with prominent attribution and links back to the original sources. This follows standard news aggregation fair-use conventions (similar to Google News, Drudge Report, RealClearDefense).

If you plan to monetize the site significantly or scale it, consult a media lawyer about your specific use. Don't republish full articles.

---

## Questions?

Come back to Claude and ask. This project is built to be easily modified — describe what you want changed, paste the relevant file, and Claude can generate the update.
