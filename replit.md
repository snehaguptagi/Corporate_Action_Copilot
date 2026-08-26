# Corporate Actions Impact Copilot

An internal operations workbench for validating corporate-action notices, calculating account impacts, managing controlled elections, tracking simulated instructions, reconciling settlement, and preserving audit evidence.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for the API contract and generated clients.
- `artifacts/corporate-actions-copilot/` — analyst-facing React workbench.
- `artifacts/api-server/src/routes/corporate-actions.ts` — operations API routes.
- `artifacts/api-server/src/lib/corporate-actions.ts` — synthetic POC scenarios and workflow logic.
- `lib/db/src/schema/corporate-actions.ts` — persisted event records.

## Architecture decisions

- The POC stores each controlled event case as a persisted JSON document so evidence, impacts, tasks, elections, instructions, reconciliation, and audit entries change together.
- The UI operates only on synthetic data and every instruction state is explicitly simulated or marked as DRAFT.
- AI-style extracted terms are visible as evidence-led inputs, while business calculations and status transitions remain deterministic server-side logic.

## Product

- Dashboard and event inbox across mandatory and voluntary corporate actions.
- Evidence review, impact calculation, election, maker-checker approval, draft instruction simulation, reconciliation, tasks, and audit history.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec run codegen` before using generated client or Zod types.
- The frontend displays operational deadline strings with their market time zones rather than re-parsing them as browser-local dates.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
