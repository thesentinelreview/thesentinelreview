import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { isDatabaseConfigured, queryOne } from "@/lib/db";
import { getEntitlementsForUser, tierLabel } from "@/lib/entitlements";
import { cleanEnv, FOUNDING_CAP } from "@/lib/stripe";
import { deriveAccountState, welcomeMessage, type AccountRow } from "@/lib/account";
import Panel from "@/components/ds/Panel";
import ManageBillingButton from "@/app/pricing/ManageBillingButton";
import ApiKeyManager, { type ApiKeyListItem } from "./ApiKeyManager";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const LABEL = "text-[10px] font-data tracking-[0.12em] uppercase text-slate-400";
const TIER_CHIP =
  "inline-block px-2 py-0.5 rounded text-[10px] font-bold text-amber-500/80 uppercase tracking-widest border border-amber-500/30 bg-amber-500/[0.06]";

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

async function getAccountRow(clerkUserId: string): Promise<AccountRow | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    // Deliberately NO status filter: /account must render cancelled rows too.
    return await queryOne<AccountRow>(
      `SELECT tier, status, is_founding, current_period_end, updated_at,
              stripe_customer_id, stripe_subscription_id
       FROM user_subscriptions
       WHERE clerk_user_id = $1`,
      [clerkUserId],
    );
  } catch {
    return null;
  }
}

// Live renewal date from Stripe (source of truth), DB value as fallback.
async function liveRenewalDate(stripeSubscriptionId: string, fallback: Date | null): Promise<Date | null> {
  try {
    const stripe = new Stripe(cleanEnv(process.env.STRIPE_SECRET_KEY));
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const ts = sub.items.data[0]?.current_period_end;
    return ts ? new Date(ts * 1000) : fallback;
  } catch {
    return fallback;
  }
}

// Same status filter as the checkout cap guard and the pricing counter.
async function getApiKeys(clerkUserId: string): Promise<ApiKeyListItem[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const rows = await query<{
      id: string; name: string; key_prefix: string;
      created_at: Date; last_used_at: Date | null; revoked_at: Date | null;
    }>(
      `SELECT id::text, name, key_prefix, created_at, last_used_at, revoked_at
       FROM api_keys WHERE clerk_user_id = $1 ORDER BY created_at DESC`,
      [clerkUserId],
    );
    return rows.map((r) => ({
      id: r.id, name: r.name, key_prefix: r.key_prefix,
      created_at: new Date(r.created_at).toISOString(),
      last_used_at: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
      revoked_at: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
    }));
  } catch {
    return []; // pre-migration deploy: render an empty list, creation still guarded
  }
}

async function foundingClaimedCount(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  try {
    const row = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n
       FROM user_subscriptions
       WHERE is_founding AND status IN ('active', 'past_due', 'trialing')`,
    );
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Faccount");

  const [{ welcome }, user, row, entitlements] = await Promise.all([
    searchParams,
    currentUser(),
    getAccountRow(userId),
    getEntitlementsForUser(userId),
  ]);
  const apiKeys = entitlements.canUseApi ? await getApiKeys(userId) : [];

  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;

  let state = deriveAccountState(row);
  if ((state.kind === "active" || state.kind === "past_due") && row?.stripe_subscription_id) {
    const renewsAt = await liveRenewalDate(row.stripe_subscription_id, state.renewsAt);
    state = { ...state, renewsAt };
  }

  const showWelcome = welcome === "1" && (state.kind === "active" || state.kind === "past_due");
  const welcomeText = showWelcome
    ? welcomeMessage(row?.is_founding ?? false, await foundingClaimedCount())
    : null;

  return (
    <div className="account-root min-h-screen bg-slate-950 text-slate-100 font-ui">
      <div className="w-full max-w-3xl mx-auto px-5 py-10 flex flex-col gap-6">
        {welcomeText && (
          <Panel padding="sm" className="border-emerald-500/40 bg-emerald-500/5">
            <div className="text-sm font-semibold text-emerald-400">{welcomeText}</div>
            <div className="text-xs text-slate-400 mt-1">
              Your subscription is live. Briefings, the full archive, and all theaters are unlocked.
            </div>
          </Panel>
        )}

        <div className="flex flex-col gap-1 pb-3 border-b border-slate-800/60">
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Account</h1>
          <p className="text-sm text-slate-400">Subscription, billing, and access.</p>
        </div>

        <Panel padding="md" className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <div className={LABEL}>Email</div>
              <div className="text-sm text-slate-200">{email ?? "—"}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className={LABEL}>Tier</div>
              <div><span className={TIER_CHIP}>{tierLabel(entitlements.tier)}</span></div>
            </div>
          </div>

          {/* Subscription state — every real state rendered honestly. */}
          {state.kind === "watch" && (
            <div className="flex flex-col gap-2 pt-4 border-t border-slate-800/60">
              <div className="text-sm text-slate-300">
                You&rsquo;re on the free tier — live dashboards across all active theaters, the last
                7 days of events, and the daily briefing.
              </div>
              <div className="text-sm text-slate-400">
                The founding window is open: the first {FOUNDING_CAP} Analyst subscribers lock in
                $5.99/mo for as long as their subscription stays active.
              </div>
              <div className="pt-2">
                <Link
                  href="/pricing"
                  className="inline-block px-4 py-2 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-sm font-semibold uppercase tracking-wider hover:bg-amber-500/20"
                >
                  Upgrade →
                </Link>
              </div>
            </div>
          )}

          {(state.kind === "active" || state.kind === "past_due") && (
            <div className="flex flex-col gap-2 pt-4 border-t border-slate-800/60">
              {state.kind === "past_due" && (
                <div className="text-sm font-semibold text-amber-400">
                  Payment past due — your card needs attention. Access continues while Stripe retries.
                </div>
              )}
              {state.isFounding && (
                <div className="text-sm text-amber-400/90">
                  Founding rate — $5.99/mo locked while active.
                </div>
              )}
              {state.renewsAt && (
                <div className="text-sm text-slate-300">
                  {state.kind === "past_due" ? "Current period ends" : "Renews"} {fmtDate(state.renewsAt)}
                </div>
              )}
            </div>
          )}

          {state.kind === "cancelled" && (
            <div className="flex flex-col gap-2 pt-4 border-t border-slate-800/60">
              <div className="text-sm text-slate-300">
                Subscription ended{state.endedAt ? ` ${fmtDate(state.endedAt)}` : ""}. You&rsquo;re on
                the free Watch tier.
              </div>
              <div className="text-sm text-slate-500">
                Resubscribing is one click — note the founding rate is forfeited on cancellation;
                the standard rate applies.
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-800/60">
            {row?.stripe_customer_id && (
              <ManageBillingButton className="px-4 py-2 rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold uppercase tracking-wider" />
            )}
            {(state.kind === "watch" || state.kind === "cancelled") && (
              <Link
                href="/pricing"
                className="inline-block px-4 py-2 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-sm font-semibold uppercase tracking-wider hover:bg-amber-500/20"
              >
                {state.kind === "cancelled" ? "Resubscribe →" : "Upgrade →"}
              </Link>
            )}
          </div>
        </Panel>

        <Panel padding="md" className="flex flex-col gap-3">
          <div className={LABEL}>API</div>
          {entitlements.canUseApi ? (
            <>
              <p className="text-sm text-slate-400">
                Read API — 1,000 calls/day on Analyst. Keys are shown once at creation; only a
                hash is stored. Docs: <Link className="text-amber-400 hover:text-amber-300" href="/docs/api">/docs/api</Link>
              </p>
              <p className="text-sm text-slate-400">
                Dashboard exports (CSV / JSON) — 20 per UTC day, 10,000 rows per file, metered
                separately from API calls.
              </p>
              <ApiKeyManager keys={apiKeys} />
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-400">
                The read API (events, briefings, analytics — 1,000 calls/day) is an Analyst
                feature.
              </p>
              <div>
                <Link
                  href="/pricing"
                  className="inline-block px-4 py-2 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-sm font-semibold uppercase tracking-wider hover:bg-amber-500/20"
                >
                  See Analyst pricing →
                </Link>
              </div>
            </div>
          )}
        </Panel>

        <div className="text-xs font-data text-slate-500">
          Questions or billing problems:{" "}
          <a className="text-slate-400 hover:text-slate-200" href="mailto:contact@thesentinelreview.com">
            contact@thesentinelreview.com
          </a>
        </div>
      </div>
    </div>
  );
}
