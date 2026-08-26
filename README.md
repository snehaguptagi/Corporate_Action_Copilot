# Corporate Actions Impact Copilot

An internal operations POC for moving a synthetic corporate-action notice from intake through evidence review, deterministic impact calculation, controlled elections, maker-checker approval, simulated instruction, settlement reconciliation, and audit history.

## Start locally

```bash
pnpm dev
```

This starts the API on port 3001 and the web application on port 5173. Open `http://localhost:5173`.

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