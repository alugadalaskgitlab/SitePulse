ALTER TABLE dispatchpro_outbox
  DROP CONSTRAINT IF EXISTS dispatchpro_outbox_operation_check;

ALTER TABLE dispatchpro_outbox
  ADD CONSTRAINT dispatchpro_outbox_operation_check
  CHECK (operation IN ('create', 'patch', 'cancel', 'order'));
