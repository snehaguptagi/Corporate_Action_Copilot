---
name: Single scheme impact model
description: Why corporate-action impacts are derived once at scheme level instead of split across detail models.
---

Use one populated scheme-impact model for affected schemes, eligibility, amounts, exposures, elections, approvals, instructions, and reconciliation. Derive it when an event is seeded, created, or its terms change, not through a user-facing calculation step. When an approved instruction starts settlement, refresh the reconciliation expectation from those affected scheme impacts.

**Why:** Parallel event-impact and scheme-impact collections can contradict each other and leave the Fund Manager landing page empty even when scheme-level results already exist. Older seeded cases can also retain zero settlement expectations after valid impact calculations, which makes a correct receipt look missing.

**How to apply:** Any new event type or operational workflow must enrich and consume scheme impacts directly. Fund Manager views should present the derived result immediately; operational controls may validate or refresh it without introducing a second impact collection. Match receipts against the reconciliation snapshot's normalized currency, account, and expected date rather than earlier notice defaults.