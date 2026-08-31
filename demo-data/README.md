# Synthetic corporate-actions demo pack

This folder separates the source-of-truth inputs used by the POC:

- **notices** describe what an issuer or custodian announced.
- **masters** identify securities, funds, accounts, and demo users.
- **positions** determine eligibility.
- **workflow** contains the SOP-style control rules and task dependencies.
- **settlement** separates expected results from the synthetic custodian feed.
- Cash settlement rows separate announced gross cash, withholding, and expected or actual net cash.
- **expected-results** is the golden answer key for verification.

The running POC loads a versioned copy of these scenarios into its persisted event documents. This folder remains a readable and testable source pack; it never contains customer or market data.