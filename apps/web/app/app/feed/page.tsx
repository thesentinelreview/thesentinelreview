import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import s from "@/app/page.module.css";
import f from "./feed.module.css";
import PostCard from "@/components/PostCard";
import { resolveTheater, THEATERS } from "@/data/placeholder";
import { getSourceFeedPosts } from "@/lib/queries";

export const dynamic = "force-dynamic";

function buildHref(theater: string, before?: string | null): string {
  const p = new URLSearchParams();
  p.set("theater", theater);
  if (before) p.set("before", before);
  return `/app/feed?${p}`;
}

export default async function SourceFeedPage({
  searchParams,
}: {
  searchParams: Promise<{
    theater?: string;
    before?: string;
  }>;
}) {
  const params = await searchParams;
  const theater = resolveTheater(params.theater);
  const before = params.before;

  const page = await getSourceFeedPosts(theater.id, { before });

  return (
    <div className={s.app}>
      {/* TOP BAR — reuse dashboard styles for visual consistency */}
      <div className={s.topbar}>
        <div className={s.brand}>
          <div className={s.brandLogo} />
          <div className={s.brandName}>Sentinel Review</div>
          <div className={s.brandDivider}>/</div>
          <div className={s.brandSection}>Source Feed</div>
        </div>
        <div className={s.filters}>
          <span className={s.filterLabel}>Mode</span>
          <Link
            href={`/app?theater=${theater.id}`}
            className={`${s.filterChip}`}
          >
            AI synthesis
          </Link>
          <Link
            href={`/app/feed?theater=${theater.id}`}
            className={`${s.filterChip} ${s.filterChipActive}`}
          >
            Source feed
          </Link>
          <span className={s.filterLabel} style={{ marginLeft: 6 }}>Theater</span>
          {Object.values(THEATERS).map((t) => (
            <Link
              key={t.id}
              href={buildHref(t.id)}
              className={`${s.filterChip} ${theater.id === t.id ? s.filterChipActive : ""}`}
            >
              {t.label}
            </Link>
          ))}
          <div style={{ marginLeft: 8 }}>
            <UserButton />
          </div>
        </div>
      </div>

      {/* FEED CONTENT */}
      <div className={f.container}>
        <div className={f.intro}>
          <div className={f.introTitle}>{theater.mapSubtitle}</div>
          <div className={f.introMeta}>
            Raw OSINT posts that informed published events, English-translated where needed.
            Newest first.
          </div>
        </div>

        {page.posts.length === 0 ? (
          <div className={f.empty}>
            No posts in this window yet.
          </div>
        ) : (
          <>
            <div className={f.feed}>
              {page.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>

            {page.next_before && (
              <div className={f.more}>
                <Link
                  href={buildHref(theater.id, page.next_before)}
                  className={f.moreLink}
                >
                  Load older posts →
                </Link>
              </div>
            )}
          </>
        )}

        <div className={f.disclaimer}>
          ⚠ AI-translated content. Original-language text available via the &ldquo;Show original&rdquo; toggle on each card.
          Events sourced from open-source reporting; locations and details unverified. Not for operational use.
        </div>
      </div>
    </div>
  );
}
