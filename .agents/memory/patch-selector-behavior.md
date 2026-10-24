---
name: Patch selector behavior
description: Avoids repeated context mismatches when applying focused edits with the workspace patch tool.
---

Treat an `@@ selector` line as the location anchor, not as a line to repeat in the diff. Begin the replacement immediately after the selector. If a hunk must delete the selector line itself, anchor on the preceding line instead. Keep multiple hunks ordered from top to bottom in the file.

**Why:** Repeating the selector in the diff or ordering hunks incorrectly produces misleading context and line-order errors, even when the visible source text appears to match.

**How to apply:** For function edits, anchor on the signature and patch the body. For small standalone comment edits, use a minimal hunk; for deletions, anchor immediately before the block being removed.
