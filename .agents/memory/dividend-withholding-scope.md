---
name: Dividend withholding scope
description: Defines the POC boundary and operational treatment for cash-dividend withholding tax.
---

Cash-dividend withholding is an event-level validated rate, not investor-specific tax advice. Store the rate as a fraction, while accepting either percentage input such as `15%` or fractional input such as `0.15`. Operational expected cash is net cash after withholding, while gross cash and the withholding amount remain explicit audit fields.

**Why:** The POC needs deterministic, reviewable calculations without implying personalized tax treatment. Settlement breaks must reflect the amount operations actually expects to receive after modeled tax.

**How to apply:** Require the withholding term for cash dividends, block calculation until it is validated, calculate and display gross, withholding, and net per account, and reconcile actual settlement against net cash.