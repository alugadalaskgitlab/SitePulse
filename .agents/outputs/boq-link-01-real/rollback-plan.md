# BOQ-LINK-01 production recovery plan — explanation only

No publish, production write, restore, or rollback has been performed.

## First choice: revert application behavior, retain the three nullable columns

For a defect in this feature, the least destructive recovery is to restore the previous application behavior while leaving the three additive columns and their saved data in place. Older application behavior can ignore these columns. Confirm compatibility before republishing.

Do not blindly publish an old development database schema: Publish compares the managed development database against production. Removing these columns from that development schema can propose production DROP COLUMN statements. Keep the columns in the development comparison schema and review the complete Publish diff again. Reverting source code alone is not a production database restore.

## If a production database restore is necessary

Before publishing:

1. Confirm the actual production database's restore window and available restore points in the Database tool.
2. Record the pre-publish timestamp (with timezone) and the matching application version/checkpoint.
3. Confirm a usable pre-publish restore point exists. This verification has not created or tested a backup.

If recovery is needed:

1. Stop production writes/traffic before recovery and preserve the post-incident state for reconciliation.
2. In Database, select **Production**, open its restore/scheduled-backup settings, select the required pre-publish point, review the consequences, and confirm the restore explicitly.
3. Restore matching application code separately. Database recovery does not roll back code.
4. Before any republish, re-check development→production schema changes so the unwanted migration is not immediately reapplied.
5. Verify login, old DPR details, draft saving, submission, and database integrity before reopening writes. Reconcile legitimate entries made after the restored timestamp.

A restored database presents the earlier state: later entries are not in that active state. The docs say the existing data is retained as the database switches to backup data, but this is not a promise that later writes are automatically merged back. Treat reconciliation as necessary.

Current documentation describes a 7-day recovery window on Core, with up to 28 days on Pro/Enterprise. Confirm the actual project's settings rather than relying on plan defaults.

## Not recommended

Do not drop the three columns as an emergency rollback. That discards any recorded General classifications. Do not overwrite production with development test data. No production-targeting SQL rollback script is provided or executed.

## Official references

- https://docs.replit.com/features/data-and-storage/data-recovery
- https://docs.replit.com/features/data-and-storage/development-and-production
- https://docs.replit.com/features/version-control/checkpoints-and-rollbacks