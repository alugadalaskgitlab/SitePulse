-- PI-LINK-01: retain the close-with-balance reason, per-item snapshot, actor and time.
-- Additive only; no existing purchase indent data is rewritten.
ALTER TABLE purchase_indents
  ADD COLUMN IF NOT EXISTS closed_balance_reason text,
  ADD COLUMN IF NOT EXISTS closed_balance_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS closed_balance_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_balance_at timestamp;
