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
    {"name": "Breaking Defense",  "url": "https://breaking
