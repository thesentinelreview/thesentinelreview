-- =============================================================================
-- 0009_stripe_webhook_idempotency.sql
-- Records the Stripe event IDs we have already processed so that duplicate /
-- replayed deliveries of the SAME event are no-ops (Stripe retries events and
-- may deliver one more than once). This does NOT reorder distinct events;
-- guarding against an older subscription.updated arriving after a newer one
-- would require tracking each event's created-at on user_subscriptions.
-- =============================================================================

BEGIN;

CREATE TABLE processed_stripe_events (
    event_id     TEXT        PRIMARY KEY,
    event_type   TEXT        NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
