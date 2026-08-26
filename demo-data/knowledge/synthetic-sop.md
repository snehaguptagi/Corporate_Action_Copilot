# Corporate actions operations SOP — synthetic POC

1. An Operations Analyst reviews every extracted term beside its notice evidence.
2. Internal deadlines are set at least 24 hours before the market deadline.
3. The system matches eligible holdings by ISIN and position date; closed, late, zero, and non-matching positions are excluded with a reason.
4. The server performs financial calculations and records the formula, assumptions, precision, rounding, and fractional-entitlement treatment.
5. Voluntary elections cannot exceed entitlement. The analyst preparing an election cannot approve it.
6. A simulated instruction is generated only after the required calculation and independent approval controls pass. It must remain labelled `SIMULATED — NOT SENT`.
7. Every settlement difference creates an exception task; the system classifies the difference but does not invent its cause.
8. Manual corrections require a reason and retain old/new values in the audit trail.