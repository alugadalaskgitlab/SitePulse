---
name: Permission System v2
description: Access-control compatibility decisions for the unified feature/action role system
---

## Unified feature/action access

**Rule:** The shared feature/action decision is the source of truth for both screens and server guards. Owners pass all feature actions. Before the Owner completes role setup, existing effective legacy grants remain in force; setup is explicit and preserves prior grants through role assignments and personal changes. Non-owner Admins keep their current access and site scope until the Owner chooses roles or Owner status. Site access remains a separate check.

**Why:** Replacing legacy checks without an explicit conversion can lock out existing users; Admin status must not become a permanent super-user grant.

**How to apply:** Do not add a second rollout flag or infer a role from Admin/Manager status. Keep role setup Owner-only and verify each client action against the matching API action.

## Reports and shared legacy aliases

**Rule:** A report requires Reports View and View on its source feature. A legacy operational section that also aliases Reports must not become a report gate for its operational actions.

**Why:** Treating every shared legacy alias as a report incorrectly denied operational grants that do not include Reports.

**How to apply:** Distinguish actual report-only surfaces from operational routes when translating legacy section access, and test both report-source restrictions and operational action parity.

## Personal permissions and management

**Rule:** Multiple roles combine by union; a personal untick overrides a role grant, and Reset to role clears personal changes. Non-owner permission managers can only grant actions they hold, cannot edit themselves or Owners, and cannot change the separate Owner-controlled unlock-record privilege.

**Why:** Personal exceptions and manager limits must remain auditable without allowing a user to escalate their own access.

**How to apply:** Keep role ticks, personal changes, site scope, and the unlock-record privilege distinct; do not silently rewrite user permissions during setup.
