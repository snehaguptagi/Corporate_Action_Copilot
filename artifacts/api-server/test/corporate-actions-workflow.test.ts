import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTermUpdates,
  approveControlledEvent,
  calculateEventImpacts,
  reconcileEvent,
  recordElection,
  simulateInstruction,
} from "../src/lib/corporate-actions-v2.js";

const analyst = { id: "USR-004", name: "Rohan Iyer", role: "Fund Manager" };
const reviewer = { id: "USR-005", name: "Nisha Kapoor", role: "Compliance" };

function rightsEvent() {
  return {
    id: "test-rights",
    reference: "TEST-RIGHTS",
    status: "Validated",
    settlementStage: "Validated",
    eventType: "Rights issue",
    processingType: "Voluntary",
    currency: "EUR",
    requiredTermKeys: ["rightsRatio", "subscriptionPrice", "recordDate"],
    terms: [
      { key: "rightsRatio", label: "Rights ratio", value: "1 for 5", reviewStatus: "Validated" },
      { key: "subscriptionPrice", label: "Subscription price", value: "EUR 8.50", reviewStatus: "Validated" },
      { key: "recordDate", label: "Record date", value: "24 Aug 2026", reviewStatus: "Validated" },
    ],
    calculationInputs: { ratioNumerator: 1, ratioDenominator: 5, subscriptionPrice: 8.5, currency: "EUR", recordDate: "2026-08-24" },
    positions: [
      { id: "p-1", fund: "European Opportunities Fund", account: "CUST-6632", isin: "FR001400VRN5", securityId: "SEC-001", eligibleQuantity: 100000, positionDate: "2026-08-24", eligibilityStatus: "Eligible", dataQualityWarning: "" },
      { id: "p-2", fund: "Closed Fund", account: "CUST-0000", securityId: "SEC-001", eligibleQuantity: 1000, positionDate: "2026-08-25", eligibilityStatus: "Excluded", dataQualityWarning: "Closed" },
      { id: "p-3", fund: "Wrong Instrument Fund", account: "CUST-0003", isin: "OTHER-ISIN", securityId: "SEC-999", eligibleQuantity: 5000, positionDate: "2026-08-24", eligibilityStatus: "Eligible", dataQualityWarning: "" },
    ],
    securityMaster: { isin: "FR001400VRN5" },
    options: [{ id: "exercise", label: "Exercise rights" }, { id: "lapse", label: "Allow rights to lapse" }],
    schemeImpacts: [],
    tasks: [],
    audit: [],
    calculation: { rounding: "Round down", assumptions: "Test" },
    validation: { missingTerms: [], isReady: true },
    reconciliation: {
      expected: 170000, expectedCash: 170000, expectedSecurityQuantity: 20000, expectedCurrency: "EUR",
      expectedSettlementDate: "2026-09-05", expectedAccount: "CUST-6632", actual: 0, actualCash: 0,
      actualSecurityQuantity: 0, actualCurrency: "EUR", actualSettlementDate: "", actualAccount: "",
      tolerance: 0.01, status: "Not due", classification: "Not due", note: "", investigationSteps: [],
    },
    instruction: {},
  } as any;
}

function dividendEvent() {
  return {
    ...rightsEvent(),
    id: "test-dividend",
    reference: "TEST-DIVIDEND",
    eventType: "Cash dividend",
    processingType: "Mandatory",
    currency: "GBP",
    status: "Under review",
    settlementStage: "Under review",
    requiredTermKeys: ["rate", "withholding", "recordDate"],
    terms: [
      { key: "rate", label: "Cash rate", value: "GBP 0.4250", reviewStatus: "Validated" },
      { key: "withholding", label: "Withholding tax", value: "Rate required", reviewStatus: "Needs review" },
      { key: "recordDate", label: "Record date", value: "24 Aug 2026", reviewStatus: "Validated" },
    ],
    calculationInputs: { rate: 0.425, currency: "GBP", cashDecimals: 2, recordDate: "2026-08-24" },
    positions: [
      { id: "p-dividend", fund: "Income Fund", account: "CUST-4081", isin: "FR001400VRN5", securityId: "SEC-TEST", eligibleQuantity: 450000, positionDate: "2026-08-24", eligibilityStatus: "Eligible", dataQualityWarning: "" },
    ],
    schemeImpacts: [],
    tasks: [],
    audit: [],
    validation: { missingTerms: ["withholding"], isReady: false },
    reconciliation: {
      expected: 0, expectedCash: 0, expectedSecurityQuantity: 0, expectedCurrency: "GBP",
      expectedSettlementDate: "2026-09-05", expectedAccount: "CUST-4081", actual: 0, actualCash: 0,
      actualSecurityQuantity: 0, actualCurrency: "GBP", actualSettlementDate: "", actualAccount: "",
      tolerance: 0.01, status: "Not due", classification: "Not due", note: "", investigationSteps: [],
    },
  } as any;
}

test("cash dividend blocks calculation until withholding is corrected and validated", () => {
  const event = dividendEvent();
  assert.throws(() => calculateEventImpacts(event, analyst), /withholding/);
  assert.throws(() => applyTermUpdates(event, [{ key: "withholding", value: "15%" }], analyst, ""), /reason is required/);
  applyTermUpdates(event, [{ key: "withholding", value: "15%", reason: "Validated against market tax guidance" }], analyst, "");
  calculateEventImpacts(event, analyst);
  assert.equal(event.calculationInputs.withholdingRate, 0.15);
  assert.equal(event.schemeImpacts[0].grossCash, 191250);
  assert.equal(event.schemeImpacts[0].withholdingAmount, 28687.5);
  assert.equal(event.schemeImpacts[0].netCash, 162562.5);
  assert.equal(event.schemeImpacts[0].expectedCash, 162562.5);
  assert.equal(event.cashDirection, "Receivable");
  assert.equal(event.reconciliation.expectedGrossCash, 191250);
  assert.equal(event.reconciliation.expectedWithholdingAmount, 28687.5);
  assert.equal(event.reconciliation.expectedNetCash, 162562.5);
});

test("percentage and fractional withholding inputs normalize to the same rate", () => {
  const percentage = dividendEvent();
  const fraction = dividendEvent();
  applyTermUpdates(percentage, [{ key: "withholding", value: "15%", reason: "Validated percentage" }], analyst, "");
  applyTermUpdates(fraction, [{ key: "withholding", value: "0.15", reason: "Validated fraction" }], analyst, "");
  assert.equal(percentage.calculationInputs.withholdingRate, 0.15);
  assert.equal(fraction.calculationInputs.withholdingRate, 0.15);
});

test("cash reconciliation compares actual settlement with expected net cash", () => {
  const event = dividendEvent();
  applyTermUpdates(event, [{ key: "withholding", value: "15%", reason: "Validated tax guidance" }], analyst, "");
  calculateEventImpacts(event, analyst);
  event.status = "Awaiting settlement";
  reconcileEvent(event, { actual: 160562.5, actualCurrency: "GBP", actualSettlementDate: "2026-09-05", actualAccount: "CUST-4081", note: "Synthetic custodian feed" }, analyst);
  assert.equal(event.reconciliation.difference, -2000);
  assert.equal(event.reconciliation.classification, "Under-settled");
  assert.match(event.reconciliation.investigationSteps[2], /withholding rate/);
});

test("rights calculation uses eligible positions and rounds deterministic entitlements", () => {
  const event = rightsEvent();
  calculateEventImpacts(event, analyst);
  const affected = event.schemeImpacts.filter((impact: EventData) => impact.affected);
  assert.equal(affected.length, 1);
  assert.equal(affected[0].expectedSecurityQuantity, 20000);
  assert.equal(affected[0].expectedCash, 170000);
  assert.equal(event.cashDirection, "Payable");
  assert.equal(event.status, "Election required");
});

test("invalid analyst corrections cannot validate stale calculation inputs", () => {
  const event = rightsEvent();
  assert.throws(() => applyTermUpdates(event, [{ key: "subscriptionPrice", value: "not a price", reason: "Test invalid input" }], analyst, "Test invalid input"), /valid non-negative number/);
  assert.equal(event.terms.find((term: any) => term.key === "subscriptionPrice").reviewStatus, "Validated");
  assert.equal(event.calculationInputs.subscriptionPrice, 8.5);
});

test("election prevents quantity above entitlement and requires an independent reviewer", () => {
  const event = rightsEvent();
  calculateEventImpacts(event, analyst);
  const affectedImpact = event.schemeImpacts.find((impact: EventData) => impact.affected);
  assert.ok(affectedImpact);
  assert.throws(() => recordElection(event, { impactId: affectedImpact.id, optionId: "exercise", quantityElected: 20001, comment: "" }, analyst), /between 0 and 20,000/);
  recordElection(event, { impactId: affectedImpact.id, optionId: "exercise", quantityElected: 20000, comment: "Exercise all" }, analyst);
  assert.equal(event.status, "Awaiting approval");
  assert.equal(event.reconciliation.expectedCash, 170000);
  assert.equal(event.reconciliation.expectedSecurityQuantity, 20000);
  assert.equal(event.audit[0].actorId, analyst.id);
  assert.equal(event.audit[0].actorRole, analyst.role);
  const samePersonAsReviewer = { ...analyst, role: "Compliance" as const };
  assert.throws(() => approveControlledEvent(event, true, "Self approval", samePersonAsReviewer), /Maker-checker control failed/);
  approveControlledEvent(event, true, "Independent check complete", reviewer);
  assert.equal(event.status, "Approved");
  assert.equal(event.audit[0].actorId, reviewer.id);
  assert.equal(event.audit[0].actorRole, reviewer.role);
});

test("approved instruction carries deterministic expectations into settlement and can complete the case", () => {
  const event = rightsEvent();
  calculateEventImpacts(event, analyst);
  const affectedImpact = event.schemeImpacts.find((impact: EventData) => impact.affected);
  recordElection(event, { impactId: affectedImpact.id, optionId: "exercise", quantityElected: 20000, comment: "Exercise all" }, analyst);
  approveControlledEvent(event, true, "Independent check complete", reviewer);

  event.reconciliation.expected = 0;
  event.reconciliation.expectedCash = 0;
  event.reconciliation.expectedSecurityQuantity = 0;
  simulateInstruction(event, "SIMULATED - NOT SENT", analyst);

  assert.equal(event.status, "Awaiting settlement");
  assert.equal(event.reconciliation.expectedCash, 170000);
  assert.equal(event.reconciliation.expectedSecurityQuantity, 20000);
  assert.equal(event.reconciliation.expectedAccount, "CUST-6632");

  reconcileEvent(event, {
    actual: 170000,
    actualSecurityQuantity: 20000,
    actualCurrency: event.reconciliation.expectedCurrency,
    actualSettlementDate: event.reconciliation.expectedSettlementDate,
    actualAccount: "CUST-6632",
    note: "Receipt matched",
  }, analyst);
  assert.equal(event.status, "Reconciled", JSON.stringify(event.reconciliation));
  assert.equal(event.reconciliation.classification, "Matched");
});

test("a term editor cannot approve the same event under a checker role", () => {
  const event = rightsEvent();
  applyTermUpdates(event, [{ key: "subscriptionPrice", value: "EUR 8.50" }], analyst, "");
  event.status = "Awaiting approval";
  const samePersonAsReviewer = { ...analyst, role: "Compliance" as const };
  assert.throws(() => approveControlledEvent(event, true, "Self approval after term validation", samePersonAsReviewer), /Maker-checker control failed/);
});

test("under-settlement creates an investigation task instead of silently matching", () => {
  const event = rightsEvent();
  event.status = "Received";
  assert.throws(() => reconcileEvent(event, { actual: 0, actualSecurityQuantity: 0, actualCurrency: "EUR", actualSettlementDate: "2026-09-05", actualAccount: "CUST-6632", note: "Attempted bypass" }, analyst), /must be ready for settlement/);
  event.status = "Awaiting settlement";
  reconcileEvent(event, { actual: 169000, actualSecurityQuantity: 19800, actualCurrency: "EUR", actualSettlementDate: "2026-09-05", actualAccount: "CUST-6632", note: "Synthetic custodian feed" }, analyst);
  assert.equal(event.reconciliation.classification, "Under-settled");
  assert.equal(event.status, "Break identified");
  assert.equal(event.tasks.length, 1);
  assert.equal(event.tasks[0].category, "Reconciliation");
});