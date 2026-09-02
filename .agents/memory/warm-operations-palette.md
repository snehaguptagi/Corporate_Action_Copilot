---
name: Warm operations palette
description: Durable color and numerical typography rules for the Impact Copilot.
---

Use one named warm palette: ink, muted ink, ground, surface, secondary surface, orange accent, soft accent, and good, attention, and breach status colors. Dark-surface text uses solid primary and secondary foreground tokens, never opacity modifiers. Semantic colors communicate status only.

**Why:** Near-identical translucent whites, pure black, and framework-default colors increased the rendered palette and caused a sidebar contrast failure.

**How to apply:** Add or change colors only in the central token definitions. Components consume tokens without raw color literals. Render currency, quantities, paise, percentages, ratios, and dates with the mono face and tabular numerals, right-aligned in numeric columns.