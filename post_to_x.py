#!/usr/bin/env python3
"""
The Sentinel Review — X (Twitter) Poster
Reads feed.xml, identifies newest unposted stories, posts to X.

Runs after aggregate.py in the same GitHub Actions workflow.
Tracks what's been posted in posted_state.json to prevent duplicates.

Budget: designed for ~$5/month X pay-per-use budget.
Posts 1 new story per run (every 2 hours) = 12/day = ~360/month = ~$3.60/mo.
"""

import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

try:
    import tweepy
except ImportError:
    print("✗ tweepy library not installed. Add 'tweepy' to requirements.txt.")
    sys.exit(1)


# ============================================================
# CONFIGURATION
# ============================================================

MAX_POSTS_PER_RUN = 1
POST_DELAY_SECONDS = 45
MAX_STORY_AGE_HOURS = 12
DAILY_POST_CAP = 15
STATE_FILE = Path(__file__).parent / 'posted_state.json'
STATE_HISTORY_LIMIT = 500
FEED_FILE = Path(__file__).parent / 'feed.xml'


# ============================================================
# X AUTHENTICATION
# ============================================================

def get_x_client():
    try:
        api_key = os.environ['X_API_KEY']
        api_secret = os.environ['X_API_SECRET']
        access_token = os.environ['X_ACCESS_TOKEN']
        access_token_secret = os.environ['X_ACCESS_TOKEN_SECRET']
        bearer_token = os.environ.get('X_BEARER_TOKEN', '')
    except KeyError as e:
        print(f"✗ Missing required environment variable: {e}")
        sys.exit(1)

    return tweepy.Client(
        bearer_token=bearer_token or None,
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )


# ============================================================
# STATE MANAGEMENT
# ============================================================

def load_state():
    if not STATE_FILE.exists():
        return {"posted_urls": [], "post_timestamps": [], "last_run": None}
    try:
        state = json.loads(STATE_FILE.read_text())
        if "post_timestamps" not in state:
            state["post_timestamps"] = []
        return state
    except Exception as e:
        print(f"⚠ Couldn't read state file ({e}), starting fresh.")
        return {"posted_urls": [], "post_timestamps": [], "last_run": None}


def save_state(state):
    state["posted_urls"] = state["posted_urls"][-STATE_HISTORY_LIMIT:]
    cutoff = datetime.now(timezone.utc).timestamp() - (48 * 3600)
    state["post_timestamps"] = [ts for ts in state["post_timestamps"] if ts > cutoff]
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    STATE_FILE.write_text(json.dumps(state, indent=2))


def posts_in_last_24h(state):
    cutoff = datetime.now(timezone.utc).timestamp() - (24 * 3600)
    return sum(1 for ts in state.get("post_timestamps", []) if ts > cutoff)


# ============================================================
# FEED PARSING
# ============================================================

def parse_feed():
    if not FEED_FILE.exists():
        print("✗ feed.xml not found. Run aggregate.py first.")
        sys.exit(1)

    tree = ET.parse(FEED_FILE)
    root = tree.getroot()
    stories = []

    for item in root.findall('.//item'):
        title_el = item.find('title')
        link_el = item.find('link')
        pub_date_el = item.find('pubDate')

        if title_el is None or link_el is None:
            continue

        title = (title_el.text or '').strip()
        link = (link_el.text or '').strip()
        pub_date_raw = (pub_date_el.text or '').strip() if pub_date_el is not None else ''

        pub_date = None
        try:
            from email.utils import parsedate_to_datetime
            pub_date = parsedate_to_datetime(pub_date_raw)
        except Exception:
            pub_date = datetime.now(timezone.utc)

        stories.append({
            'title': title,
            'link': link,
            'pub_date': pub_date,
        })

    return stories


def is_recent(pub_date):
    if not pub_date:
        return True
    age = datetime.now(timezone.utc) - pub_date
    return age.total_seconds() < MAX_STORY_AGE_HOURS * 3600


# ============================================================
# POST FORMATTING
# ============================================================

def build_post_text(story):
    title = story['title']
    link = story['link']
    url_length = 23
    max_title_length = 280 - url_length - 2

    if len(title) > max_title_length:
        title = title[:max_title_length - 1].rsplit(' ', 1)[0] + '…'

    return f"{title}\n\n{link}"


# ============================================================
# MAIN
# ============================================================

def main():
    print(f"🐦 X Poster starting at {datetime.now(timezone.utc).isoformat()}")
    print(f"   Budget mode: ~$5/month (max {MAX_POSTS_PER_RUN} post per run)\n")

    state = load_state()
    posted_set = set(state['posted_urls'])
    recent_count = posts_in_last_24h(state)
    print(f"📜 History: {len(posted_set)} previously posted URLs")
    print(f"📊 Last 24h: {recent_count}/{DAILY_POST_CAP} posts")

    if recent_count >= DAILY_POST_CAP:
        print(f"⛔ Daily cap reached ({DAILY_POST_CAP} posts in 24h). Skipping this run.")
        save_state(state)
        return

    stories = parse_feed()
    print(f"📰 Feed: {len(stories)} stories available")

    candidates = [
        s for s in stories
        if s['link'] not in posted_set and is_recent(s['pub_date'])
    ]

    if not candidates:
        print("✓ No new stories to post. All caught up.")
        save_state(state)
        return

    print(f"📬 {len(candidates)} new candidate stories found.")

    remaining_daily_budget = DAILY_POST_CAP - recent_count
    post_limit = min(MAX_POSTS_PER_RUN, remaining_daily_budget)
    to_post = candidates[:post_limit]
    print(f"📤 Posting {len(to_post)} stories this run.\n")

    client = get_x_client()

    posted_count = 0
    for i, story in enumerate(to_post):
        text = build_post_text(story)
        print(f"[{i+1}/{len(to_post)}] Posting: {story['title'][:70]}...")

        try:
            response = client.create_tweet(text=text)
            tweet_id = response.data.get('id') if response.data else 'unknown'
            print(f"   ✓ Posted (tweet id: {tweet_id})")
            state['posted_urls'].append(story['link'])
            state['post_timestamps'].append(datetime.now(timezone.utc).timestamp())
            posted_count += 1

            if i < len(to_post) - 1:
                print(f"   ⏳ Waiting {POST_DELAY_SECONDS}s before next post...")
                time.sleep(POST_DELAY_SECONDS)

        except tweepy.TooManyRequests:
            print(f"   ✗ Rate-limited by X. Stopping for this run.")
            break
        except tweepy.Forbidden as e:
            print(f"   ✗ Forbidden: {e}")
            print(f"   → Check: app has Read+Write permissions, post isn't duplicate.")
            state['posted_urls'].append(story['link'])
        except Exception as e:
            print(f"   ✗ Error: {e}")
            break

    save_state(state)
    print(f"\n✓ Run complete. Posted {posted_count} new stories.")


if __name__ == '__main__':
    main()
