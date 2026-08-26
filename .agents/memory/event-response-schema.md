---
name: Event response schema completeness
description: Contract rule for event payloads passed through generated Zod response validators.
---

When adding a field to the persisted corporate-action event payload, add it to the OpenAPI response schema and regenerate the API client and Zod package before returning it through a generated response parser.

**Why:** Generated Zod object schemas remove undeclared keys by default. A persisted field can exist in PostgreSQL but silently disappear from the UI response, causing missing-data failures that resemble frontend bugs.

**How to apply:** Treat the OpenAPI event detail schema as the response shape authority; regenerate immediately after response-shape edits and use the generated validator in the route rather than bypassing it.