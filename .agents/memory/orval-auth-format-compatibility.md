---
name: OpenAPI format compatibility
description: Generator/runtime compatibility constraints for auth-related OpenAPI formats.
---

With the current Orval and Zod versions, OpenAPI `format: email` and `format: uri` generate `zod.email()` and `zod.url()` calls that are unavailable in the installed Zod runtime. Keep these auth fields typed as strings and enforce any stricter validation in the server/auth provider layer.

**Why:** Adding standard auth format annotations caused the generated library typecheck to fail even though the OpenAPI document was valid.

**How to apply:** Check generated Zod output after adding OpenAPI formats; use the compatible string schema when the generator/runtime pair has not been upgraded together.