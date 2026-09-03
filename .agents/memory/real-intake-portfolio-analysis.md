---
name: Real intake portfolio analysis
description: How real captured notices get the same indicative analysis as the retired samples, and the pitfalls around holding matching and custodian merge.
---

Real captured notices (public web or exchange text) are analysed against a static portfolio holdings master of widely held NSE/BSE issuers, not against seeded events.

**Why:** The seeded sample events carried hand-built positions and impacts. Once samples were removed, real captures arrived with no positions, so every case looked empty. A holdings master lets the shared scheme-impact derivation quantify real notices on arrival while staying indicative until custodian confirmation.

**How to apply:**
- Match ISIN first. A well-formed ISIN that is not in the master must NOT fall through to a name-alias match; it may be a different security or company. Name aliases apply only when no ISIN was extracted.
- Missing numeric terms yield affected-but-unquantified rows with an assumptions note, never invented numbers.
- A custodian merge must carry the earlier sighting's calculation inputs forward; the fresh custodian record has none, and dropping them zeroes every later recomputation.
- Not-held issuers still create a case, explicitly informational with zero impacts.
