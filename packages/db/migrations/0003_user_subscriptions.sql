-- =============================================================================
-- 0003_user_subscriptions.sql
-- User subscription records, synced from Stripe via webhook.
-- clerk_user_id is the primary identity key; Stripe IDs are set after checkout.
-- =============================================================================

BEGIN;

CREATE TABLE user_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id           TEXT        NOT NULL UNIQUE,
  stripe_customer_id      TEXT        UNIQUE,
  stripe_subscription_id  TEXT        UNIQUE,
  tier                    TEXT        NOT NULL DEFAULT 'watch'
                                      CHECK (tier IN ('watch', 'analyst', 'bureau')),
  is_founding             BOOLEAN     NOT NULL DEFAULT false,
  status                  TEXT        NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_subscriptions_clerk_idx
  ON user_subscriptions (clerk_user_id);

CREATE INDEX user_subscriptions_stripe_sub_idx
  ON user_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMIT;
