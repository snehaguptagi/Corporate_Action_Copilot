---
name: Synthetic notice intake
description: The POC’s notice intake truthfulness and routing decision.
---

Synthetic notice intake must use an explicit, named sample identifier rather than infer an event type from an uploaded filename. The interface must state when a source preview is structured synthetic evidence rather than an extracted document.

**Why:** The POC does not implement arbitrary PDF parsing. Filename-based classification made the capability appear broader than it is and risked routing a notice into the wrong deterministic scenario.

**How to apply:** Add sample scenarios by registering their stable sample ID, preview disclosure, and server-side scenario mapping together. Only claim PDF evidence where the actual synthetic PDF asset is available.