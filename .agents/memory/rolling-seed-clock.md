---
name: Rolling seed clock
description: Rules that keep synthetic corporate-action timelines valid at every hour and across long-running processes.
---

Synthetic corporate-action fixtures must express time as offsets and resolve arrivals, deadlines, source evidence, and audit timestamps against the current instant when read. Dashboard recency means the last 24 hours, never the current calendar day.

**Why:** Absolute seeded timestamps and calendar-day counts repeatedly became stale as real time crossed deadlines and midnight.

**How to apply:** Preserve the source-level no-date-literal invariant, rebase persisted seed records on reads, and test the rolling arrival count at early, daytime, and late clock hours.