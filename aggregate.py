#!/usr/bin/env python3
"""
The Sentinel Review — Automated News Aggregator
Pulls RSS feeds from national security sources and generates index.html + feed.xml.
"""

import feedparser
import html
import re
import sys
from datetime import datetime, timezone
from dateutil import parser as date_parser
from pathlib import Path

# ============================================================
# CONFIGURATION
# ============================================================

FEEDS = [
    {"name": "Defense News",      "url": "https://www.defensenews.com/arc/outboundfeeds/rss/",                 "source_tag": "Defense News"},
    {"name": "Breaking Defense",  "url": "https://breakingdefense.com/feed/",                                   "source_tag": "Breaking Defense"},
    {"name": "The War Zone",      "url": "https://www.twz.com/feed",                                            "source_tag": "The War Zone"},
    {"name": "War on the Rocks",  "url": "https://warontherocks.com/feed/",                                     "source_tag": "War on the Rocks"},
    {"name": "Defense One",       "url": "https://www.defenseone.com/rss/all/",                                 "source_tag": "Defense One"},
    {"name": "CSIS Analysis",     "url": "https://www.csis.org/analysis/feed",                                  "source_tag": "CSIS"},
    {"name": "Atlantic Council",  "url": "https://www.atlanticcouncil.org/feed/",                               "source_tag": "Atlantic Council"},
    {"name": "Foreign Policy",    "url": "https://foreignpolicy.com/feed/",                                     "source_tag": "Foreign Policy"},
    {"name": "CISA Advisories",   "url": "https://www.cisa.gov/news-events/cybersecurity-advisories/all.xml",   "source_tag": "CISA"},
    {"name": "Stars and Stripes", "url": "https://www.stripes.com/rss",                                         "source_tag": "Stars and Stripes"},
    {"name": "Lawfare",           "url": "https://www.lawfaremedia.org/feed",                                   "source_tag": "Lawfare"},
    {"name": "Just Security",     "url": "https://www.justsecurity.org/feed/",                                  "source_tag": "Just Security"},
]

CATEGORIES = {
    "Cyber":          {"icon": "🔐", "keywords": ["cyber", "ransomware", "hack", "hacker", "cisa", "exploit", "vulnerability", "malware", "phishing", "zero-day", "breach", "encryption", "apt", "ddos"]},
    "Indo-Pacific":   {"icon": "🌏", "keywords": ["china", "taiwan", "prc ", " pla ", "indo-pacific", "japan", "korea", "beijing", "xi jinping", "south china sea", "philippines", "quad"]},
    "Middle East":    {"icon": "🌍", "keywords": ["iran", "israel", "saudi", "yemen", "gaza", "syria", "iraq", "centcom", "hezbollah", "houthi", "tehran", "jerusalem", "hamas", "red sea"]},
    "Europe / NATO":  {"icon": "🏴", "keywords": ["nato", "russia", "ukraine", "europe", "putin", "kyiv", "moscow", "kremlin", "baltic", "poland", " eu ", "brussels", "zelensky"]},
    "Nuclear":        {"icon": "⚛️", "keywords": ["nuclear", "missile", "icbm", "warhead", "nonproliferation", "iaea", "stratcom", "hypersonic", "new start"]},
    "Homeland":       {"icon": "🛡️", "keywords": ["dhs", "fbi", "border", "terrorism", "domestic", "homeland", "extremism", "cbp"]},
    "Defense Policy": {"icon": "🏛️", "keywords": ["pentagon", "dod", "ndaa", "f-35", "army", "navy", "marine", "air force", "joint chiefs", "secdef", "congress", "hegseth", "austin"]},
    "Intelligence":   {"icon": "🕵️", "keywords": ["cia", "nsa", "dni", "intelligence community", "odni", "espionage", "spy", "classified", "fisa"]},
}

DEFAULT_CATEGORY_NAME = "National Security"
DEFAULT_CATEGORY_ICON = "📍"

MAX_PER_FEED = 15
MAX_HERO_SIDEBAR = 5
MAX_NEWS_GRID = 6
MAX_TICKER = 5

# ============================================================
# HELPERS
# ============================================================

def fetch_all_feeds():
    stories = []
    for feed in FEEDS:
        try:
            print(f"  Fetching {feed['name']}...", end=" ", flush=True)
            parsed = feedparser.parse(feed['url'])
            count = 0
            for entry in parsed.entries[:MAX_PER_FEED]:
                story = extract_story(entry, feed['source_tag'])
                if story:
                    stories.append(story)
                    count += 1
            print(f"✓ {count} stories")
        except Exception as e:
            print(f"✗ ERROR: {e}")
    return stories


def extract_story(entry, source_tag):
    try:
        title = (entry.get('title') or '').strip()
        link = (entry.get('link') or '').strip()
        summary = entry.get('summary') or entry.get('description') or ''
        summary = clean_html(summary)[:280]
        if len(summary) == 280:
            summary = summary.rsplit(' ', 1)[0] + '…'

        pub_date = None
        for key in ['published', 'updated', 'pubDate', 'created']:
            val = entry.get(key)
            if val:
                try:
                    pub_date = date_parser.parse(val)
                    break
                except Exception:
                    continue
        if not pub_date:
            pub_date = datetime.now(timezone.utc)
        if pub_date.tzinfo is None:
            pub_date = pub_date.replace(tzinfo=timezone.utc)

        if not title or not link:
            return None

        return {
            'title': title,
            'link': link,
            'summary': summary or 'Click to read the full story at the source.',
            'pub_date': pub_date,
            'source': source_tag,
            'category': categorize(title + ' ' + summary),
        }
    except Exception:
        return None


def clean_html(text):
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def categorize(text):
    text_lower = ' ' + text.lower() + ' '
    scores = {}
    for cat_name, cat_data in CATEGORIES.items():
        score = sum(1 for kw in cat_data['keywords'] if kw in text_lower)
        if score > 0:
            scores[cat_name] = score
    if not scores:
        return DEFAULT_CATEGORY_NAME
    return max(scores, key=scores.get)


def get_category_icon(cat_name):
    if cat_name in CATEGORIES:
        return CATEGORIES[cat_name]['icon']
    return DEFAULT_CATEGORY_ICON


def time_ago(dt):
    now = datetime.now(timezone.utc)
    delta = now - dt
    seconds = delta.total_seconds()
    if seconds < 0:
        return "just now"
    if seconds < 3600:
        mins = max(1, int(seconds / 60))
        return f"{mins}m ago"
    elif seconds < 86400:
        hrs = int(seconds / 3600)
        return f"{hrs}h ago"
    else:
        days = int(seconds / 86400)
        return f"{days}d ago"


def dedupe(stories):
    seen = set()
    result = []
    for s in stories:
        key = re.sub(r'[^a-z0-9]', '', s['title'].lower())[:80]
        if key in seen:
            continue
        seen.add(key)
        result.append(s)
    return result


def esc(text):
    return html.escape(str(text))


def xml_esc(text):
    return (str(text)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&apos;'))


# ============================================================
# RSS FEED GENERATOR
# ============================================================

def generate_rss(stories, site_url="https://example.com", max_items=30):
    now_rfc822 = datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S +0000')
    items_xml = []
    for s in stories[:max_items]:
        pub = s['pub_date'].strftime('%a, %d %b %Y %H:%M:%S +0000')
        icon = get_category_icon(s['category'])
        tweet_title = f"{icon} {s['title']} | {s['source']}"
        items_xml.append(f'''    <item>
      <title>{xml_esc(tweet_title)}</title>
      <link>{xml_esc(s['link'])}</link>
      <guid isPermaLink="true">{xml_esc(s['link'])}</guid>
      <pubDate>{pub}</pubDate>
      <category>{xml_esc(s['category'])}</category>
      <source url="{xml_esc(s['link'])}">{xml_esc(s['source'])}</source>
      <description>{xml_esc(s['summary'])}</description>
    </item>''')

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The Sentinel Review — National Security Feed</title>
    <link>{xml_esc(site_url)}</link>
    <atom:link href="{xml_esc(site_url)}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Automated national security news aggregation. Updated every hour.</description>
    <language>en-us</language>
    <lastBuildDate>{now_rfc822}</lastBuildDate>
    <generator>The Sentinel Review Aggregator</generator>
{chr(10).join(items_xml)}
  </channel>
</rss>
'''


# ============================================================
# RENDERERS
# ============================================================

def render_ticker(stories):
    items = stories[:MAX_TICKER]
    doubled = items + items
    return '\n        '.join(
        f'<span class="ticker-item">{esc(s["title"])}</span>' for s in doubled
    )


def render_hero(story):
    if not story:
        return ''
    return f'''<span class="hero-category">⚡ {esc(story['category'])}</span>
            <h1 class="hero-headline">{esc(story['title'])}</h1>
            <p class="hero-deck">{esc(story['summary'])}</p>
            <div class="hero-byline">
              <strong><a href="{esc(story['link'])}" target="_blank" rel="noopener" style="color: var(--gold-pale); text-decoration: none;">Read at {esc(story['source'])} →</a></strong>
              <span>•</span>
              <span>{story['pub_date'].strftime('%B %d, %Y · %I:%M %p UTC')}</span>
              <span>•</span>
              <span>{time_ago(story['pub_date'])}</span>
            </div>'''


def render_hero_sidebar(stories):
    items = []
    for s in stories[:MAX_HERO_SIDEBAR]:
        items.append(f'''        <a href="{esc(s['link'])}" target="_blank" rel="noopener" style="text-decoration:none; color:inherit;">
          <div class="sidebar-story-item" style="padding: 12px 24px;">
            <div class="s-tag">{esc(s['category'])}</div>
            <div class="s-headline">{esc(s['title'])}</div>
            <div class="s-time">{time_ago(s['pub_date'])} · {esc(s['source'])}</div>
          </div>
        </a>''')
    return '\n'.join(items)


def render_news_grid(stories):
    cards = []
    for i, s in enumerate(stories[:MAX_NEWS_GRID]):
        featured_class = ' card-featured' if i == 0 else ''
        icon = get_category_icon(s['category'])
        cards.append(f'''      <a href="{esc(s['link'])}" target="_blank" rel="noopener" style="text-decoration:none; color:inherit;">
        <div class="news-card{featured_class}">
          <div class="card-tag">{icon} {esc(s['category'])}</div>
          <div class="card-headline">{esc(s['title'])}</div>
          <div class="card-excerpt">{esc(s['summary'])}</div>
          <div class="card-meta"><span>{esc(s['source'])}</span><span>{time_ago(s['pub_date'])}</span></div>
        </div>
      </a>''')
    return '\n'.join(cards)


def render_regional(stories):
    regions = [
        ('Indo-Pacific',   '🌏'),
        ('Middle East',    '🌍'),
        ('Europe / NATO',  '🏴'),
        ('Nuclear',        '⚛️'),
        ('Cyber',          '🔐'),
    ]
    cards = []
    for region_name, icon in regions:
        matching = [s for s in stories if s['category'] == region_name]
        if matching:
            s = matching[0]
            count = len(matching)
            cards.append(f'''      <a href="{esc(s['link'])}" target="_blank" rel="noopener" style="text-decoration:none; color:inherit;">
        <div class="region-card">
          <div class="region-name">{icon} {esc(region_name)}</div>
          <div class="region-story">{esc(s['title'])}</div>
          <div class="region-count">{count} {"story" if count == 1 else "stories"} tracked</div>
        </div>
      </a>''')
        else:
            cards.append(f'''        <div class="region-card">
          <div class="region-name">{icon} {esc(region_name)}</div>
          <div class="region-story" style="opacity: 0.5;">No stories currently tracked</div>
          <div class="region-count">Awaiting feed updates</div>
        </div>''')
    return '\n'.join(cards)


# ============================================================
# MAIN
# ============================================================

def main():
    print("🦞 The Sentinel Review — Aggregator starting\n")
    print("Fetching feeds:")
    stories = fetch_all_feeds()
    stories = dedupe(stories)
    stories.sort(key=lambda s: s['pub_date'], reverse=True)

    print(f"\n✓ Collected {len(stories)} unique stories")

    if not stories:
        print("⚠️  No stories fetched — check RSS feeds and network.")
        sys.exit(1)

    from collections import Counter
    cat_counts = Counter(s['category'] for s in stories)
    for cat, n in cat_counts.most_common():
        print(f"    {cat}: {n}")

    template_path = Path(__file__).parent / 'template.html'
    template = template_path.read_text(encoding='utf-8')

    replacements = {
        '<!-- TICKER_CONTENT -->':   render_ticker(stories),
        '<!-- HERO_STORY -->':       render_hero(stories[0]),
        '<!-- HERO_SIDEBAR -->':     render_hero_sidebar(stories[1:1 + MAX_HERO_SIDEBAR]),
        '<!-- NEWS_GRID -->':        render_news_grid(stories[1 + MAX_HERO_SIDEBAR : 1 + MAX_HERO_SIDEBAR + MAX_NEWS_GRID]),
        '<!-- REGIONAL_GRID -->':    render_regional(stories),
        '<!-- LAST_UPDATED -->':     datetime.now(timezone.utc).strftime('%B %d, %Y at %I:%M %p UTC'),
    }

    for placeholder, content in replacements.items():
        template = template.replace(placeholder, content)

    out_path = Path(__file__).parent / 'index.html'
    out_path.write_text(template, encoding='utf-8')

    # Generate RSS feed for syndication (Make.com, Zapier, X bots, etc.)
    # IMPORTANT: Change SITE_URL below to your actual domain
    SITE_URL = "https://thesentinelreview.com"  # ← CHANGE THIS
    rss_path = Path(__file__).parent / 'feed.xml'
    rss_path.write_text(generate_rss(stories, site_url=SITE_URL), encoding='utf-8')

    print(f"\n✓ index.html generated — site is ready to deploy.")
    print(f"✓ feed.xml generated — {min(len(stories), 30)} items for syndication.")


if __name__ == '__main__':
    main()
