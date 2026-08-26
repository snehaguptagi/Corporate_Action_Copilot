import assert from "node:assert/strict";
import test from "node:test";
import { applyTermUpdates, approveControlledEvent, calculateEventImpacts, reconcileEvent, recordElection, } from "../src/lib/corporate-actions-v2.js";
const analyst = { id: "USR-001", name: "Aisha Mehta", role: "Operations Analyst" };
const reviewer = { id: "USR-002", name: "Daniel Reed", role: "Reviewer" };
function rightsEvent() {
    return {
        id: "test-rights",
        reference: "TEST-RIGHTS",
        status: "Validated",
        settlementStage: "Validated",
        eventType: "Rights issue",
        processingType: "Voluntary",
        risk: "High",
        currency: "EUR",
        requiredTermKeys: ["rightsRatio", "subscriptionPrice"],
        terms: [
            { key: "rightsRatio", label: "Rights ratio", value: "1 for 5", reviewStatus: "Validated" },
            { key: "subscriptionPrice", label: "Subscription price", value: "EUR 8.50", reviewStatus: "Validated" },
        ],
        calculationInputs: { ratioNumerator: 1, ratioDenominator: 5, subscriptionPrice: 8.5, currency: "EUR" },
        positions: [
            { id: "p-1", fund: "European Opportunities Fund", account: "CUST-6632", isin: "FR001400VRN5", securityId: "SEC-001", eligibleQuantity: 100000, positionDate: "2026-08-24", eligibilityStatus: "Eligible", dataQualityWarning: "" },
            { id: "p-2", fund: "Closed Fund", account: "CUST-0000", securityId: "SEC-001", eligibleQuantity: 1000, positionDate: "2026-08-25", eligibilityStatus: "Excluded", dataQualityWarning: "Closed" },
            { id: "p-3", fund: "Wrong Instrument Fund", account: "CUST-0003", isin: "OTHER-ISIN", securityId: "SEC-999", eligibleQuantity: 5000, positionDate: "2026-08-24", eligibilityStatus: "Eligible", dataQualityWarning: "" },
        ],
        securityMaster: { isin: "FR001400VRN5" },
        options: [{ id: "exercise", label: "Exercise rights" }, { id: "lapse", label: "Allow rights to lapse" }],
        impacts: [],
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
    };
}
test("rights calculation uses eligible positions and rounds deterministic entitlements", () => {
    const event = rightsEvent();
    calculateEventImpacts(event, analyst);
    assert.equal(event.impacts.length, 1);
    assert.equal(event.impacts[0].expectedSecurityQuantity, 20000);
    assert.equal(event.impacts[0].expectedCash, 170000);
    assert.equal(event.status, "Election required");
});
test("invalid analyst corrections cannot validate stale calculation inputs", () => {
    const event = rightsEvent();
    assert.throws(() => applyTermUpdates(event, [{ key: "subscriptionPrice", value: "not a price", reason: "Test invalid input" }], analyst, "Test invalid input"), /valid non-negative number/);
    assert.equal(event.terms.find((term) => term.key === "subscriptionPrice").reviewStatus, "Validated");
    assert.equal(event.calculationInputs.subscriptionPrice, 8.5);
});
test("election prevents quantity above entitlement and requires an independent reviewer", () => {
    const event = rightsEvent();
    calculateEventImpacts(event, analyst);
    assert.throws(() => recordElection(event, { impactId: event.impacts[0].id, optionId: "exercise", quantityElected: 20001, comment: "" }, analyst), /between 0 and 20,000/);
    recordElection(event, { impactId: event.impacts[0].id, optionId: "exercise", quantityElected: 20000, comment: "Exercise all" }, analyst);
    assert.equal(event.status, "Awaiting approval");
    assert.equal(event.reconciliation.expectedCash, 170000);
    assert.equal(event.reconciliation.expectedSecurityQuantity, 20000);
    assert.equal(event.audit[0].actorId, analyst.id);
    assert.equal(event.audit[0].actorRole, analyst.role);
    const samePersonAsReviewer = { ...analyst, role: "Reviewer" };
    assert.throws(() => approveControlledEvent(event, true, "Self approval", samePersonAsReviewer), /Maker-checker control failed/);
    approveControlledEvent(event, true, "Independent check complete", reviewer);
    assert.equal(event.status, "Approved");
    assert.equal(event.audit[0].actorId, reviewer.id);
    assert.equal(event.audit[0].actorRole, reviewer.role);
});
test("a term editor cannot approve the same event under a checker role", () => {
    const event = rightsEvent();
    applyTermUpdates(event, [{ key: "subscriptionPrice", value: "EUR 8.50" }], analyst, "");
    event.status = "Awaiting approval";
    const samePersonAsReviewer = { ...analyst, role: "Reviewer" };
    assert.throws(() => approveControlledEvent(event, true, "Self approval after term validation", samePersonAsReviewer), /Maker-checker control failed/);
});
test("under-settlement creates an investigation task instead of silently matching", () => {
    const event = rightsEvent();
    event.status = "Received";
    assert.throws(() => reconcileEvent(event, { actual: 0, actualSecurityQuantity: 0, actualCurrency: "EUR", actualSettlementDate: "2026-09-05", actualAccount: "CUST-6632", note: "Attempted bypass" }, analyst), /simulated instruction is required/);
    event.status = "Awaiting settlement";
    reconcileEvent(event, { actual: 169000, actualSecurityQuantity: 19800, actualCurrency: "EUR", actualSettlementDate: "2026-09-05", actualAccount: "CUST-6632", note: "Synthetic custodian feed" }, analyst);
    assert.equal(event.reconciliation.classification, "Under-settled");
    assert.equal(event.status, "Break identified");
    assert.equal(event.tasks.length, 1);
    assert.equal(event.tasks[0].category, "Reconciliation");
});
