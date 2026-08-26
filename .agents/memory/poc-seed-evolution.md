---
name: POC seed evolution
description: How synthetic demonstration records should evolve in a persisted development database
---

Synthetic POC data is persisted, so adding a new demonstration case cannot rely on an empty database. Seed initialization should preserve existing records and add only missing canonical seed IDs.

**Why:** A one-time “seed only when empty” guard makes later scenario additions invisible in workspaces that have already been opened or tested.

**How to apply:** When expanding demo coverage, make initialization additive so established workspaces receive the new canonical cases without losing their existing data.