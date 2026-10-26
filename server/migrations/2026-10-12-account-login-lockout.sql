-- Apply to the development database. Replit Publish propagates these columns
-- to the managed production database through its normal development→production
-- schema diff; application startup must not mutate the production schema.
ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
