# SitePulse: production-to-development clone readiness

**Investigation date:** 12 October 2026  
**Status:** Investigation only. No backup, restore, replacement, migration, secret change, workflow restart or publication was performed.

## 1. Database identity and separation

| Purpose | SQL database name | PostgreSQL version | Observed size | Public tables |
|---|---|---|---:|---:|
| Published production — managed production read-only query target | `neondb` | 16.15 | 26.6 MB | 141 |
| Actual Development/Preview runtime | `sitelog_dev` | 16.10 | 25.3 MB | 141 |
| Replit managed development / Publish comparison source | `heliumdb` | 16.10 | 24.2 MB | 141 |

These are distinct database targets, not different names for the same data. Production and local development report different server versions. This establishes separate PostgreSQL environments, not a claim about the provider's underlying physical hardware. The identifiers above are SQL database names, not platform database/branch UUIDs; those platform identifiers were not obtained.

The current application selects DEV_DATABASE_URL only when NODE_ENV is development; otherwise it uses DATABASE_URL. Production deployment metadata reports a successful Autoscale build. The source intended for this operation is managed production, NOT the workspace DATABASE_URL, which points at heliumdb.

**Replacement target: Preview's sitelog_dev role only.** Leave heliumdb and production unchanged. The safest cutover is to point Preview at a fresh isolated database after verification, retaining the previous sitelog_dev for rollback.

## 2. Compatibility findings

- All three databases have the same public table and column names. Production and Preview column types, precision, identity/generated attributes and nullability match.
- Three numeric-zero defaults differ only in SQL representation (`'0'::numeric` versus `0`). Other observed column differences are ordering differences.
- Production has 140 public sequences and 247 public indexes; Preview has 140 sequences and 248 indexes.
- Preview has four additional foreign keys: internal requisition → material requirement; progress entry → programme bar; PI item → store item; PI → material requirement. Its extra index is on the progress-entry programme-bar reference.
- **Production has three progress entries referencing absent programme bars.** The other three additional-FK relationships have zero observed orphans. Existing production constraints are validated and indexes valid. That does not establish integrity for relationships production does not constrain.
- **Material billing difference:** production's hire-statement uniqueness is unconditional on equipment/start/end. Preview's index excludes bill-linked daily statements. An exact production-schema clone retains the stricter production rule and may behave differently in current hire-billing tests.
- Both production and Preview have two application migration-marker rows. The repository contains numbered SQL migrations through 0046 and numerous startup ensure/backfill routines. There is no evidence that a single migration number represents the effective schema; catalog comparisons are the reliable baseline.
- The observed extension is plpgsql 1.0 in all targets. Production also has a platform `_system` schema that Preview lacks. Do not copy platform-owned metadata into the application's development database.
- PostgreSQL 16 client tools are installed. Matching-major logical dump/restore is feasible, but a trial restore—not version matching alone—must prove compatibility.

**Consequence:** do not import production data into the existing Preview schema. Restore production application schema and data together. Preserve the three historical orphan references without silently fixing or deleting them. Any subsequent development-only schema adjustment, including the hire index or extra foreign keys, requires an explicitly approved deviation from the exact snapshot.

## 3. Data and files outside PostgreSQL

Read-only production counts at investigation time: 349 DPRs, 735 Material Trips, 56 Vendor Bills, 56 equipment records and 8 Vendor Master rows. These are indicative, not a transaction-consistent clone manifest.

There are 60 attachment rows, 60 distinct relative `/objects/...` references and 31 attachment-link rows. Recorded attachment sizes total **177,298,090 bytes (about 177 MB)**. Object existence, actual sizes, checksums, generations and completeness have NOT been verified.

Private files resolve through PRIVATE_OBJECT_DIR; public files resolve through PUBLIC_OBJECT_SEARCH_PATHS. Copy referenced objects into a dedicated development bucket or isolated prefix with independently restricted credentials, preserving relative object keys so database references need not change. Preserve necessary content types and ACL metadata without granting public access to private documents. Do not point writable Preview storage at production storage.

Also inventory public assets/company logos, bill and trip evidence, draft-stoppage object paths, service-completion document URLs and any JSON-held references. The dedicated draft-stoppage/document-URL fields currently contain zero references, but this is not proof that every possible embedded or external file reference has been catalogued.

Database and object-store snapshots are not automatically atomic. Record object generations and verify that every object referenced by the database snapshot is available. If versioning or retention cannot provide this, agree a short production upload/delete freeze before capture; no such freeze has been requested or applied.

## 4. Isolation and access risks — prerequisites, not completed safeguards

- The current startup path performs schema ensures, backfills, permission/bootstrap operations and seeding. Starting Preview immediately after restore can alter the supposed exact copy. Before execution, prepare and approve development-only controls that suppress these during baseline verification.
- Push initialization uses VAPID credentials without an environment exclusion. There is an automatic stale-GRN notification timer. Production contains four push subscriptions. Database separation alone does not prevent real browser notifications.
- Production contains six users, 1,215 sessions and 57 device records. Cloning their authentication state is unsafe for a publicly accessible Preview.
- Confirm credential scope separately for database, object storage, bootstrap admin, session signing, VAPID and any external service. Do not assume similarly named secrets are isolated.
- The inspected code directly integrates web push and object storage. No payment-provider, email or SMS sender was found in the targeted scan; this is not a guarantee that no external business operation exists elsewhere or will be introduced.
- Before opening Preview, use a development-only database role with no production access; fail closed if DEV_DATABASE_URL is absent or resolves to the wrong target. Do not leave production write credentials in the Preview runtime.
- Disable outbound notifications/background business jobs, remove live service credentials from development scope, and use sandbox or deny-by-default outbound service controls. A source-export credential, if needed, must be read-only and absent from the running Preview app.
- Use a separate development session-signing secret. After baseline verification, invalidate cloned sessions, revoke cloned device approvals/tokens and disable/remove cloned push delivery endpoints **in the development copy only**. Never revoke production sessions or devices.
- Restrict Preview access and protect backups: the clone contains real personal, financial, password-hash and operational data.

An exact immutable snapshot and a safe writable testing copy are distinct things. Keep the backup exact. Document the explicitly approved development-only security/access changes in the working copy; do not call that copy byte-for-byte identical after those changes or after testing.

## 5. Existing development logins

A full replacement removes development-only users, password hashes, permissions, approved devices and sessions. Matching user counts do not imply matching accounts or IDs. The existing verification login is not guaranteed to survive.

Preserve the original development database and a verified backup for rollback. After restore, either authorize a copied user with a new development-only password/device approval, or create a clearly identified testing account with a new allocated ID and minimum required site/section grants. Do not transplant old user ID 16 or merge the old user table into production users. Use the secure secrets flow for testing credentials. This access overlay requires approval and is applied only after snapshot verification.

## 6. Exact execution sequence proposed for approval

1. **Approve scope and exceptions.** Confirm production as source, Preview as the only replacement target, security/access overlay, object-copy destination and retention, startup isolation controls, and treatment of the hire-index difference/orphan references. Do not proceed while export access or storage isolation is unresolved.
2. **Establish read-only source access.** Identify the managed production endpoint/branch through platform tooling and an authorized read-only export mechanism. Confirm database name/environment and server identity before export. The current production query callback is a read-only query facility, not an established pg_dump connection.
3. **Prepare quarantine.** Keep normal app startup and workers off for the candidate database. Allocate a fresh development candidate database and separately writable development storage. Do not modify live deployment configuration or the Publish comparison database.
4. **Freeze development writes and back up development.** Stop only Preview and any jobs/test processes that can write its database. Create a custom-format logical dump of all application schema/data, sequences, constraints, indexes, functions and triggers; capture relevant storage/configuration metadata securely. Preserve the old database intact.
5. **Back up production read-only.** Take a consistent custom-format logical dump of application schemas—public in the current inventory—excluding platform-owned `_system`. Use an approved read-only connection and compatible PostgreSQL tooling. No migrations, source DDL or source data writes.
6. **Bind the manifest to the snapshot.** Use a held read-only repeatable-read exported snapshot for the dump and per-table count/hash manifest where supported. Capture schema definitions, foreign keys, indexes, sequence values and dependency ownership, including application audit/migration records. If the export tool cannot share the snapshot, validate against a restored immutable backup and disclose the measurement boundary; do not compare a stale dump against moving live counts and call it exact.
7. **Verify both backups before cutover.** Encrypt and store them outside Git/deployment bundles with restricted access. Compute archive checksums, inspect archive contents, and successfully restore each into an isolated scratch database with exit-on-error. Confirm schema, all-table counts, deterministic key-ordered row digests and sequence state. A checksum or archive listing alone is not a restore test.
8. **Copy and verify files.** Copy only to the development destination using source-read-only/destination-write-scoped access. Verify referenced object keys, generation/hash, actual size, metadata and private-access behavior. Report missing files; do not silently replace them.
9. **Restore the candidate from production backup.** Use a fresh empty target, no owner/ACL reassignment from production, a development owner and a single transactional restore with exit-on-error where supported. Let the archive restore tables, data, constraints, indexes and sequences in dependency order. Do not merge, upsert, reuse the old schema, disable constraints to hide failures, or run startup migrations.
10. **Verify exact baseline.** Compare every application table and schema object to the snapshot manifest. Verify constraints/indexes, all known cross-table relationships, parent/child counts, JSON/audit references and sequences. Sequence state must match the source; check separately for counters behind max IDs. Preserve and report pre-existing defects instead of silently repairing them. There must be no new orphan references.
11. **Apply approved development safety/access overlay.** Perform only the documented session/device/push/testing-access changes. Record their exact scope separately from the baseline manifest. If current-code compatibility requires a schema change, stop for the approved development-only change and record that this is no longer an exact production schema.
12. **Cut over Preview only.** Change the development-scoped connection/storage configuration to the verified candidate, ensure development mode and startup guards, then restart Preview. Test ordinary login, permitted historical trips, reviewed master links, bill reopen/calculation and attachment access. Confirm outbound business operations are blocked. Check the startup before/after manifest for unintended changes. Do not publish.

## 7. Downtime and rollback

- **Production:** no planned application/database downtime for a normal logical read-only export. It can add read load; abort or reschedule if disruptive. A file-capture freeze may be needed if object consistency cannot otherwise be achieved.
- **Development:** provisionally reserve 30–60 minutes of unavailability for write freeze, backup/restore verification, access preparation and smoke tests. Database sizes are small and recorded attachments total about 177 MB, but transfer throughput and access/setup delays are unmeasured. Isolation implementation/review is additional preparation time, not included in that estimate.
- **Rollback:** stop Preview/jobs, restore the prior development-scoped database and storage configuration, and restart the retained old database/application state. If the old database is unavailable, restore the separately verified development backup into a fresh target. Production is never a rollback destination. Candidate-only test changes will be discarded; do not merge them back. Retain or securely dispose of candidate/backups only under the agreed retention policy.

## 8. Limitations and approval gate

No source export connection has been verified, no backups have been created or test-restored, no storage bytes have been copied or verified, and no isolation controls have been implemented. Production queries use the platform's read-only replica path; replication freshness was not measured. Catalog comparisons and the targeted orphan checks are not a complete integrity audit. Object-store permission separation and external-service isolation remain unproven.

**Recommendation:** feasible, but not ready for execution until these gates are resolved. Restore a fresh candidate from a verified production snapshot, not into the old Preview schema. Preserve production and the old Preview database throughout.

**STOP: explicit approval is required before any clone preparation that changes configuration, creates backups/databases, copies files, restores data or replaces Preview.**
