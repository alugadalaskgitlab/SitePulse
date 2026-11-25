-- SP-DP-LINK-02: optional PAN for contractor details.
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS pan_no text;
