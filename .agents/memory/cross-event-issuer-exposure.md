---
name: Cross-event issuer exposure
description: How portfolio concentration should aggregate concurrent corporate actions for the same issuer.
---

For one scheme and issuer, use the highest shared current-exposure baseline across open events and add each event's incremental exposure change. Flag a combined-only breach only when the grouped result exceeds the cap while every event remains within the cap on its own.

**Why:** Repeating the same holding baseline for each notice overstates exposure, while assessing each notice independently can miss a real breach caused by concurrent actions.

**How to apply:** Any new server-side concentration view must group by scheme and issuer before applying the 10% cap, include mandatory events, and keep combined-only breaches visible as a separate explanation.

Displayed cap headroom must come only from the shared exposure function. When an issuer-scheme pair has no open exposure row, show headroom as null ("No open exposure"), never recompute it as 10 minus percent of NAV. Value issuer holdings at the market reference price first, then the security master price; action prices (offer, subscription) are last-resort fallbacks so a tender premium never revalues the whole house holding. Counts shown side by side (headline vs tiles) must be driven by the same server-side predicate.