---
name: Cross-event issuer exposure
description: How portfolio concentration should aggregate concurrent corporate actions for the same issuer.
---

For one scheme and issuer, use the highest shared current-exposure baseline across open events and add each event's incremental exposure change. Flag a combined-only breach only when the grouped result exceeds the cap while every event remains within the cap on its own.

**Why:** Repeating the same holding baseline for each notice overstates exposure, while assessing each notice independently can miss a real breach caused by concurrent actions.

**How to apply:** Any new server-side concentration view must group by scheme and issuer before applying the 10% cap, include mandatory events, and keep combined-only breaches visible as a separate explanation.