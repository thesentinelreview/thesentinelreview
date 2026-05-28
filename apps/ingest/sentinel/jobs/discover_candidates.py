"""
Discover candidate sources by mining mentions, links, and handles
from posts ingested in the last N hours.

Populates candidate_sources and candidate_mentions tables. Idempotent
per (candidate, mentioning_post, mention_type) — safe to re-run.

Run via: python -m sentinel.jobs.discover_candidates
Configured via env vars:
    DATABASE_URL              required
    DISCOVER_SINCE_HOURS      default 24
"""
from __future__ import annotations

import os
import re
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import psycopg
import structlog
from psycopg.rows import dict_row

log = structlog.get_logger()


# ---------- Mention extraction ----------

# X username: starts with letter/underscore, 1-15 alphanumeric+underscore.
# Lookbehind prevents matching emails (foo@bar.com) and URLs (path/@handle).
_X_MENTION_RE = re.compile(r'(?<![@\w/])@([A-Za-z_]\w{0,14})\b')

# Telegram username via t.me link. Excludes Telegram reserved paths.
_TG_LINK_RE = re.compile(
    r'(?:https?://)?t\.me/'
    r'(?!s/|joinchat/|\+|share|addstickers|proxy|setlanguage|iv\?)'
    r'([A-Za-z][\w]{4,31})\b',
    re.IGNORECASE,
)

# Telegram @-mention (only meaningful when extracted from Telegram posts).
# Telegram usernames are 5-32 chars, must start with a letter.
_TG_AT_RE = re.compile(r'(?<![@\w/])@([A-Za-z][\w]{4,31})\b')

# Bluesky handle: any subdomain of bsky.social. Distinctive enough to mine
# from any source platform.
_BSKY_RE = re.compile(
    r'\b([a-zA-Z0-9][a-zA-Z0-9.\-]{0,127}\.bsky\.social)\b',
    re.IGNORECASE,
)

# Per-post cap: prevents a single noisy post (e.g., follow list dump) from
# flooding the queue.
_MAX_CANDIDATES_PER_POST = 10
_CONTEXT_RADIUS = 150
_MAX_CONTEXT_LEN = 500


def _norm(handle: str) -> str:
    """Lowercase for dedup comparison. Original case preserved at promote time."""
    return handle.lower().strip()


def _snippet(text: str, start: int, end: int) -> str:
    s = max(0, start - _CONTEXT_RADIUS)
    e = min(len(text), end + _CONTEXT_RADIUS)
    out = text[s:e].replace('\n', ' ').strip()
    if s > 0:
        out = '…' + out
    if e < len(text):
        out = out + '…'
    return out[:_MAX_CONTEXT_LEN]


def extract_candidates(text: str, post_platform: str) -> Iterator[tuple[str, str, str, str]]:
    """
    Yield (candidate_platform, normalized_handle, mention_type, context_snippet).

    candidate_platform is the platform of the *discovered* account, not the
    mentioning post. e.g. a Telegram post linking t.me/foo yields ('telegram','foo',...).
    """
    if not text:
        return

    seen: set[tuple[str, str]] = set()
    yielded = 0

    def emit(plat: str, handle: str, mtype: str, m_start: int, m_end: int):
        nonlocal yielded
        key = (plat, _norm(handle))
        if key in seen:
            return
        seen.add(key)
        yielded += 1
        return (plat, _norm(handle), mtype, _snippet(text, m_start, m_end))

    # X @-mentions (only inside X posts; on other platforms @ means something else)
    if post_platform == 'x':
        for m in _X_MENTION_RE.finditer(text):
            if yielded >= _MAX_CANDIDATES_PER_POST:
                return
            result = emit('x', m.group(1), 'at_mention', m.start(), m.end())
            if result:
                yield result

    # Telegram t.me/ links (work from any source platform)
    for m in _TG_LINK_RE.finditer(text):
        if yielded >= _MAX_CANDIDATES_PER_POST:
            return
        result = emit('telegram', m.group(1), 'link', m.start(), m.end())
        if result:
            yield result

    # Telegram @-mentions (only inside Telegram posts)
    if post_platform == 'telegram':
        for m in _TG_AT_RE.finditer(text):
            if yielded >= _MAX_CANDIDATES_PER_POST:
                return
            result = emit('telegram', m.group(1), 'at_mention', m.start(), m.end())
            if result:
                yield result

    # Bluesky handles (work from any source platform — distinctive)
    for m in _BSKY_RE.finditer(text):
        if yielded >= _MAX_CANDIDATES_PER_POST:
            return
        result = emit('bluesky', m.group(1), 'link', m.start(), m.end())
        if result:
            yield result


# ---------- DB layer ----------

def run(since_hours: int = 24, db_url: str | None = None) -> dict:
    """
    Scan raw_posts ingested in the last `since_hours` hours, extract candidate
    mentions, UPSERT candidate_sources, INSERT candidate_mentions.

    Returns a stats dict.
    """
    db_url = db_url or os.environ['DATABASE_URL']

    stats = {
        'posts_scanned': 0,
        'mentions_found': 0,
        'candidates_created': 0,
        'mentions_recorded': 0,
        'skipped_existing_source': 0,
        'skipped_self_reference': 0,
    }

    cutoff = datetime.now(UTC) - timedelta(hours=since_hours)

    with psycopg.connect(db_url, row_factory=dict_row, autocommit=False) as conn:
        # Cache existing sources (case-insensitive, @-prefix-insensitive) so we
        # don't re-discover them. X handles in `sources` are stored as '@foo',
        # but discovery extracts them bare — normalize both sides for comparison.
        with conn.cursor() as cur:
            cur.execute(
                "SELECT lower(regexp_replace(handle, '^@', '')) AS handle, platform FROM sources"
            )
            existing = {(r['platform'], r['handle']) for r in cur.fetchall()}

        # Pull recent posts with their source info. Lowercased + @-stripped
        # source handle for self-reference comparison (mirrors how `existing`
        # is normalized above).
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT rp.id, rp.text, rp.source_id,
                       s.platform AS source_platform,
                       lower(regexp_replace(s.handle, '^@', '')) AS source_handle_lower
                FROM raw_posts rp
                JOIN sources s ON s.id = rp.source_id
                WHERE rp.ingested_at >= %s
                  AND rp.text IS NOT NULL
                  AND length(rp.text) > 0
                ORDER BY rp.ingested_at DESC
                """,
                (cutoff,),
            )
            posts = cur.fetchall()

        log.info(
            'discover_candidates_start',
            posts_to_scan=len(posts),
            existing_sources=len(existing),
            since_hours=since_hours,
        )

        for post in posts:
            stats['posts_scanned'] += 1
            text = post['text'] or ''
            source_platform = post['source_platform']
            source_handle_lower = post['source_handle_lower']

            for cand_platform, cand_handle, mention_type, context in extract_candidates(
                text, source_platform
            ):
                stats['mentions_found'] += 1

                # Skip if already in production sources
                if (cand_platform, cand_handle) in existing:
                    stats['skipped_existing_source'] += 1
                    continue

                # Skip self-references
                if cand_platform == source_platform and cand_handle == source_handle_lower:
                    stats['skipped_self_reference'] += 1
                    continue

                with conn.cursor() as cur:
                    # UPSERT candidate. xmax=0 means INSERT (row didn't exist),
                    # xmax!=0 means UPDATE (row was already there).
                    cur.execute(
                        """
                        INSERT INTO candidate_sources (
                            handle, platform, discovery_method, discovery_context,
                            mention_count, first_seen_at, last_seen_at
                        ) VALUES (
                            %s, %s, 'mention_mining',
                            jsonb_build_object('first_mentioning_post_id', %s::text),
                            0, now(), now()
                        )
                        ON CONFLICT (platform, handle) DO UPDATE
                          SET last_seen_at = now(),
                              updated_at   = now()
                        RETURNING id, (xmax = 0) AS is_insert
                        """,
                        (cand_handle, cand_platform, str(post['id'])),
                    )
                    cand_row = cur.fetchone()
                    candidate_id = cand_row['id']
                    if cand_row['is_insert']:
                        stats['candidates_created'] += 1

                    # INSERT mention. Unique constraint makes this idempotent.
                    cur.execute(
                        """
                        INSERT INTO candidate_mentions (
                            candidate_id, mentioning_source_id, mentioning_post_id,
                            mention_type, mention_context
                        ) VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (
                            candidate_id, mentioning_source_id, mentioning_post_id, mention_type
                        ) DO NOTHING
                        RETURNING id
                        """,
                        (candidate_id, post['source_id'], post['id'], mention_type, context),
                    )
                    if cur.fetchone() is not None:
                        stats['mentions_recorded'] += 1
                        # Bump aggregated count only when we actually recorded
                        # a *new* mention. Re-scans don't inflate the score.
                        cur.execute(
                            """
                            UPDATE candidate_sources
                            SET mention_count = mention_count + 1,
                                updated_at    = now()
                            WHERE id = %s
                            """,
                            (candidate_id,),
                        )

                conn.commit()

    log.info('discover_candidates_complete', **stats)
    return stats


def main() -> None:
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt='iso'),
            structlog.processors.JSONRenderer(),
        ],
    )
    since_hours = int(os.environ.get('DISCOVER_SINCE_HOURS', '24'))
    run(since_hours=since_hours)


if __name__ == '__main__':
    main()
