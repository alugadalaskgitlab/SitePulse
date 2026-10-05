-- Approved additive development migration. Production changes only on publish.
ALTER TABLE "public"."vendor_rate_cards" ADD COLUMN "lead_distance_km" real;
ALTER TABLE "public"."vendor_rate_cards" ADD COLUMN "payload_mt" real;
ALTER TABLE "public"."vendor_rate_cards" ADD COLUMN "rate_per_km" real;