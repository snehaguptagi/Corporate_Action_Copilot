---
name: Orval integer schema compatibility
description: Generated Zod validators need number fields in this workspace's current Orval and Zod combination.
---

Prefer OpenAPI `number` over `integer` for operational counters in this workspace until the generator/runtime versions are aligned.

**Why:** The current generator emits `zod.int()` for OpenAPI integers, but the installed Zod runtime does not export that helper, causing the generated library typecheck to fail.

**How to apply:** When adding numeric counters to the API contract, use `type: number`; rerun codegen and the library typecheck before starting frontend work.