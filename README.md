# Corporate Actions Impact Copilot

An internal operations POC for moving a synthetic corporate-action notice from intake through evidence review, deterministic impact calculation, controlled elections, maker-checker approval, simulated instruction, settlement reconciliation, and audit history.

## Prerequisites

- Node.js 24+
- pnpm 10+
- A PostgreSQL database available to the local process

## Start locally

```bash
pnpm dev
```

This starts the API on `API_PORT` (port 8080 by default) and the web application on `WEB_PORT` (port 25700 by default). The Vite `/api` proxy uses the same `API_PORT`, so the workbench and API stay aligned. Open `http://localhost:25700`.

## Demo users

- **Aisha Mehta — Operations Analyst:** upload a notice, validate terms, calculate, prepare elections, and simulate instructions.
- **Daniel Reed — Reviewer:** independently approve or return controlled elections. A reviewer cannot approve an election they prepared.
- **Maya Shah — Operations Manager:** monitor risk, tasks, and settlement exceptions.

Use the role selector in the left navigation to demonstrate the control boundaries.

## Hero demo

1. Open **Notice Intake** and use `rights-issue-notice.pdf`.
2. Open the newly created rights issue, validate each extracted term with its visible source evidence.
3. Run the deterministic calculation; only eligible holdings matched by ISIN and record date are included.
4. Record elections for each account within the displayed entitlement.
5. Switch to Daniel Reed to approve; switch back to Aisha to generate `SIMULATED — NOT SENT`.
6. Record the supplied settlement outcome and inspect the audit tab.

## Demo data and guardrails

- All companies, funds, accounts, notices, users, instructions, and settlements are synthetic.
- No external custodian or market instruction is available. Instructions can only be marked `SIMULATED — NOT SENT`.
- Financial calculations, validation gates, role controls, workflow transitions, and reconciliation classifications run on the server.
- The synthetic data pack and golden answer key are stored in `demo-data/`.
- The application uses PostgreSQL through Drizzle. The corporate-action table is seeded automatically on first access, and synthetic seed data is versioned.

## Database setup

1. Provision a PostgreSQL database and set `DATABASE_URL` to its connection
   string.
2. Push the development schema:

   ```bash
   pnpm --filter @workspace/db run push
   ```

3. The API seeds synthetic corporate-action scenarios on first read. Seed data
   is safe for the POC and is not connected to a custodian or market system.


## Tests and checks

Run the calculation unit tests and database-backed API workflow tests with:

```bash
pnpm test
```

The API tests use the seeded fixtures and restore their original JSON
documents after each test. The test database must already have the schema
from the database setup step.

For the complete workspace typecheck and build:

```bash
pnpm run build
```

The build script supplies the Vite-only `PORT` and `BASE_PATH` defaults, so no
additional environment variables are needed for this verification command.
## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | None | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | None | Signs application session cookies. The API refuses to start without it. |
| `API_PORT` | No | `8080` | Port used by the API and the Vite `/api` proxy in `pnpm dev` |
| `WEB_PORT` | No | `25700` | Port used by the Vite workbench in `pnpm dev` |
| `BASE_PATH` | No | `/` | Vite base path for the workbench |
| `NODE_ENV` | No | set by scripts | Runtime mode |
| `CORPORATE_ACTIONS_POC` | POC only | `false` | Set to `true` only in a non-production demo environment to enable signed demo operator sessions. Without a demo session or approved authenticated role, mutations return 401. |
| `CORPORATE_ACTIONS_ROLE_DIRECTORY` | Production | None | JSON role directory that maps exactly one authenticated OIDC user ID or normalized email to an operational role. Production mutations return 401 when no unique entry matches. |
| `CORS_ALLOWED_ORIGINS` | No | Same origin only | Comma-separated trusted origins allowed to call the API from a separate browser client |
| `OPENAI_API_KEY` | Notice extraction only | None | Enables OpenAI notice extraction. Other deterministic workflows can run without it. |


## Seeded demo roles

The POC does not require login. Its seeded audit trail represents these demo
personas:

| Persona | Demonstrates |
| --- | --- |
| Corporate Actions Analyst | Reviews extracted notice terms and evidence |
| Fund Manager | Records voluntary elections |
| Team Lead | Performs maker-checker approval or returns an event |
| Reconciliation | Records settlement results and breaks |
| System | Adds deterministic seed and calculation history |


## Run the complete local app

After setting `DATABASE_URL` and pushing the schema, start both the API and
workbench with one command:

```bash
pnpm dev
```

Open the workbench at `http://localhost:${WEB_PORT:-25700}`. The API health
check is available at `http://localhost:${API_PORT:-8080}/api/healthz`.
