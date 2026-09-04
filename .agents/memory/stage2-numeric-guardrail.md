---
name: Stage 2 numeric guardrail
description: How the AI judgement layer is prevented from introducing numbers not computed by the deterministic stage
---

The AI judgement (Stage 2) may only cite figures from the deterministic engine (Stage 1). Enforcement is structural, not prompt-based:

- Build one canonical Stage 1 snapshot: labelled prose lines given to the model. After composing the lines, harvest EVERY numeric token from every line into the allow-list. The snapshot shown to the model IS the allow-list; anything else rejects.
- The validator extracts all numeric tokens from the model response (canonicalized: grouping commas stripped) and rejects the whole response if any token is absent from the allow-list. **No exceptions**: no small-integer or calendar-year whitelists. A tolerance range for counts or years is a hallucination bypass (an invented "11%" cap or "2028" deadline would pass).
- Dates and counts pass only because Stage 1 lines contain them (deadline strings, "Affected schemes: N of M"). Prompt tells the model to write any figure it cannot copy verbatim in words without digits.
- Stage 2 output must contain four complete labelled sections: recommendation, portfolio impact, risk and controls, and missing information. Validate the structure and lifecycle semantics server-side, not only in the prompt.
- Mandatory events must not be described as elective. Settlement-break recommendations must lead with discrepancy resolution and rematching; awaiting-settlement recommendations must lead with receipt monitoring or recording.
- Stage 2 output is stored on its own field and rendered as structured advisory cards; nothing downstream (calculations, elections, instructions, approvals) reads it.

**Why:** The POC requires AI to be structurally incapable of changing a number. Reviews also found that prompt-only formatting and lifecycle rules could produce dense or operationally wrong advice even when all figures were valid.

**How to apply:** Any new deterministic figure surfaced to the model must go through the snapshot-line builder, never a side channel. Tests must cover hallucinated figures, required sections, mandatory wording, and status-specific recommendations.
