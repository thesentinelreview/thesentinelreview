#!/usr/bin/env python3
"""
Claude Haiku-based relevance scoring for the aggregator.

Each story gets a 0-10 score reflecting how clearly it's about
national security, defense, intelligence, or foreign policy with
security implications. Score is added to feed.xml as <sentinel:score>.

Used as a soft filter:
  - Stories with score >= 6 are eligible for the daily briefing
  - All stories remain on the site (scoring is metadata, not exclusion)
"""

import json
import os

from anthropic import Anthropic

client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = "claude-haiku-4-5-20251001"

SYSTEM_PROMPT = """You are a relevance classifier for The Sentinel Review,
a national security news publication. You will be given a news headline
and summary. Score it 0-10 on how clearly it concerns:
- US national security
- Defense, military operations, or defense industry
- Intelligence community activity
- Foreign policy with direct security implications
- Conflict events (active wars, terrorism, state-on-state escalation)
- Cyber threats to government, critical infrastructure, or defense
- Nuclear / WMD developments
- Sanctions, export controls, or trade security

Score guide:
- 9-10: Core national security event (strike, designation, official statement)
- 7-8:  Strong analysis or news on a security topic
- 5-6:  Indirect — economic, diplomatic, or political with security angle
- 3-4:  Tangential — general foreign affairs without clear security frame
- 0-2:  Off-topic — lifestyle, sports, internal politics, book reviews,
        obituaries, unrelated business

Respond ONLY with JSON: {"score": <int 0-10>, "reason": "<one short clause>"}"""


def score_story(title: str, summary: str) -> dict:
    user_msg = f"Title: {title}\n\nSummary: {summary[:500]}"
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=80,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = resp.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text)
    except Exception as e:
        return {"score": 5, "reason": f"scoring_error: {type(e).__name__}"}
