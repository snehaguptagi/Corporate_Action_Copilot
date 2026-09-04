import { desc, eq } from "drizzle-orm";
import {
  calculateDividendWithholding,
  calculateMixedMerger,
  calculateRights,
  calculateSplit,
  calculateTender,
  roundCalculation,
} from "./calculations";
import { SEED_DATE_ANCHOR as sharedSeedDateAnchor } from "./seed-clock";
import { ARKA_SCHEME_SEED, ARKA_SCHEME_HOLDING_COUNTS, ARKA_EVENT, calculateArkaRightsTerms, calculateIssuerExposure, projectArkaBharatPositions } from "./arka-desk";

export type EventData = Record<string, any>;

export const SEED_DATE_ANCHOR = sharedSeedDateAnchor;
export const SEED_VERSION = "analysis-history-v16";
let seedPromise: Promise<void> | undefined;

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const seedAnchorUtc = new Date(Date.UTC(
  SEED_DATE_ANCHOR.getUTCFullYear(),
  SEED_DATE_ANCHOR.getUTCMonth(),
  SEED_DATE_ANCHOR.getUTCDate(),
));
const seedDate = (dayOffset: number) => new Date(seedAnchorUtc.getTime() + dayOffset * DAY_MS);
const isoDate = (dayOffset: number) => seedDate(dayOffset).toISOString().slice(0, 10);
const shortDate = (dayOffset: number) => {
  const date = seedDate(dayOffset);
  return `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};
const longDate = (dayOffset: number) => {
  const date = seedDate(dayOffset);
  return `${date.getUTCDate()} ${LONG_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};
const taskDate = (dayOffset: number) => {
  const date = seedDate(dayOffset);
  return `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]}`;
};
const seedTimestamp = (dayOffset: number, time: string) => `${isoDate(dayOffset)}T${time}.000Z`;
const istTimestamp = (dayOffset: number, time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  const date = seedDate(dayOffset);
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hours - 5,
    minutes - 30,
  )).toISOString();
};

const seedTimeline = {
  noticeReceived: 12,
  calculationRun: 12,
  aurora: { record: 11, internal: 12, market: 13, payment: 35, audit: 12 },
  delta: { record: 10, internal: 13, market: 14, settlement: 14, audit: 12 },
  nimbus: { record: 0, internal: 5, market: 6, settlement: 6, audit: 7 },
  meridian: { record: 10, internal: 15, market: 16, settlement: 23, audit: 12 },
  merger: { record: 10, internal: 16, market: 17, settlement: 29, audit: 12 },
  harbor: { record: -2, internal: 0, market: 1, settlement: 8, audit: 8 },
  rights: { record: 10, latePosition: 11, internal: 14, market: 15, settlement: 22 },
} as const;

export const demoUsers = [
  { id: "USR-004", name: "Rohan Iyer", role: "Fund Manager", desk: "Arka Mutual Fund" },
  { id: "USR-005", name: "Nisha Kapoor", role: "Compliance", desk: "Arka Mutual Fund" },
];

const indianSecurity = (isin: string, ticker: string, issuer: string) => ({
  securityId: `SEC-${ticker}`, isin, ticker, securityName: issuer, currency: "INR", market: "India", status: "Active",
});
const istDeadline = (offset: number, time = "15:30") => `${shortDate(offset)} · ${time} IST`;
const INDIAN_EVENT_META: Record<string, { deadlineDaysAhead: number; arrivalHoursAgo: number; recordDaysAhead?: number }> = {
  "evt-ind-dividend-review": { deadlineDaysAhead: 12, arrivalHoursAgo: 3 },
  "evt-ind-split": { deadlineDaysAhead: 14, arrivalHoursAgo: 8 },
  "evt-ind-bonus": { deadlineDaysAhead: 6, arrivalHoursAgo: 20 },
  "evt-ind-buyback": { deadlineDaysAhead: 16, arrivalHoursAgo: 26 },
  "evt-ind-scheme": { deadlineDaysAhead: 17, arrivalHoursAgo: 31 },
  "evt-ind-dividend-break": { deadlineDaysAhead: 3, arrivalHoursAgo: 35 },
  "evt-bharat-rights": { deadlineDaysAhead: 15, arrivalHoursAgo: 40 },
  "evt-looks-small": { deadlineDaysAhead: 18, arrivalHoursAgo: 46 },
  "evt-looks-big": { deadlineDaysAhead: 18, arrivalHoursAgo: 50 },
  "evt-concentration-creep": { deadlineDaysAhead: 20, arrivalHoursAgo: 55 },
  "evt-near-miss": { deadlineDaysAhead: 3, arrivalHoursAgo: 60 },
  "evt-overlap-dividend": { deadlineDaysAhead: 21, arrivalHoursAgo: 66 },
  "evt-routine-split-1": { deadlineDaysAhead: 24, arrivalHoursAgo: 72 },
  "evt-routine-dividend-2": { deadlineDaysAhead: 25, arrivalHoursAgo: 78 },
  "evt-routine-split-3": { deadlineDaysAhead: 26, arrivalHoursAgo: 84 },
  "evt-routine-dividend-4": { deadlineDaysAhead: 27, arrivalHoursAgo: 90 },
  "evt-early-sighting": { deadlineDaysAhead: 28, arrivalHoursAgo: 12, recordDaysAhead: 12 },
  "evt-combined-bonus": { deadlineDaysAhead: 19, arrivalHoursAgo: 32 },
  "evt-combined-rights": { deadlineDaysAhead: 23, arrivalHoursAgo: 44 },
  "evt-tapti-dividend": { deadlineDaysAhead: -70, arrivalHoursAgo: 1800 },
  "evt-tapti-bonus": { deadlineDaysAhead: -40, arrivalHoursAgo: 1080 },
  "evt-tapti-rights": { deadlineDaysAhead: 10, arrivalHoursAgo: 96 },
  "evt-history-01": { deadlineDaysAhead: -8, arrivalHoursAgo: 260 },
  "evt-history-02": { deadlineDaysAhead: -15, arrivalHoursAgo: 430 },
  "evt-history-03": { deadlineDaysAhead: -22, arrivalHoursAgo: 600 },
  "evt-history-04": { deadlineDaysAhead: -29, arrivalHoursAgo: 770 },
  "evt-history-05": { deadlineDaysAhead: -36, arrivalHoursAgo: 940 },
  "evt-history-06": { deadlineDaysAhead: -43, arrivalHoursAgo: 1110 },
  "evt-history-07": { deadlineDaysAhead: -50, arrivalHoursAgo: 1280 },
  "evt-history-08": { deadlineDaysAhead: -57, arrivalHoursAgo: 1450 },
  "evt-history-09": { deadlineDaysAhead: -64, arrivalHoursAgo: 1620 },
  "evt-history-10": { deadlineDaysAhead: -71, arrivalHoursAgo: 1790 },
  "evt-history-11": { deadlineDaysAhead: -78, arrivalHoursAgo: 1960 },
  "evt-settlement-break-02": { deadlineDaysAhead: -2, arrivalHoursAgo: 220 },
};

const relativeTimestamp = (hoursAgo: number, asOf = new Date()) =>
  new Date(asOf.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();

function sourceRecordsFor(input: EventData): EventData[] {
  const meta = INDIAN_EVENT_META[input.id] ?? { deadlineDaysAhead: 15, arrivalHoursAgo: 26 };
  const canonicalRecordDate = input.calculationInputs?.recordDate ?? isoDate(input.recordOffset ?? 10);
  const vendorRecordDate = input.id === "evt-ind-dividend-review"
    ? new Date(`${canonicalRecordDate}T00:00:00.000Z`).toISOString().slice(0, 10).replace(/(\d{4}-\d{2}-)(\d{2})/, (_, prefix, day) => `${prefix}${String(Number(day) + 1).padStart(2, "0")}`)
    : canonicalRecordDate;
  const receivedAt = relativeTimestamp(meta.arrivalHoursAgo);
  const asserted = (recordDate: string) => ({ recordDate });
  return [
    { id: `${input.id}-sbi`, channel: "Custodian", provider: "SBI-SG", messageType: "MT564", receivedAt, assertedFields: asserted(canonicalRecordDate), primary: true },
    { id: `${input.id}-nsdl`, channel: "Depository file", provider: "NSDL", messageType: "Corporate action file", receivedAt: relativeTimestamp(meta.arrivalHoursAgo + 1), assertedFields: asserted(canonicalRecordDate), primary: false },
    { id: `${input.id}-nse`, channel: "Exchange announcement", provider: "NSE", messageType: "SEBI LODR filing", receivedAt: relativeTimestamp(meta.arrivalHoursAgo + 8), assertedFields: asserted(canonicalRecordDate), primary: false },
    { id: `${input.id}-bse`, channel: "Exchange announcement", provider: "BSE", messageType: "SEBI LODR filing", receivedAt: relativeTimestamp(meta.arrivalHoursAgo + 8.1), assertedFields: asserted(canonicalRecordDate), primary: false },
    { id: `${input.id}-refinitiv`, channel: "Market data", provider: "Refinitiv", messageType: "Live vendor feed", receivedAt: relativeTimestamp(meta.arrivalHoursAgo + 8.2), assertedFields: asserted(vendorRecordDate), primary: false },
    { id: `${input.id}-kfin`, channel: "RTA notice", provider: "KFin", messageType: "Email", receivedAt: relativeTimestamp(meta.arrivalHoursAgo + 8.3), assertedFields: asserted(canonicalRecordDate), primary: false },
  ];
}

const indianEvent = (input: EventData): EventData => eventBase({
  currency: "INR",
  marketDeadline: istDeadline(INDIAN_EVENT_META[input.id]?.deadlineDaysAhead ?? 15),
  internalDeadline: istDeadline((INDIAN_EVENT_META[input.id]?.deadlineDaysAhead ?? 15) - 1, "15:00"),
  marketDeadlineAt: istTimestamp(INDIAN_EVENT_META[input.id]?.deadlineDaysAhead ?? 15, "15:30"),
  internalDeadlineAt: istTimestamp((INDIAN_EVENT_META[input.id]?.deadlineDaysAhead ?? 15) - 1, "15:00"),
  affectedAccounts: input.positions?.length ?? 1,
  receivedAt: relativeTimestamp(INDIAN_EVENT_META[input.id]?.arrivalHoursAgo ?? 26),
  source: "Custodian · SBI-SG",
  sourceRecords: sourceRecordsFor(input),
  sourceAgreement: input.id === "evt-ind-dividend-review"
    ? `3 of 4 sources agree. Refinitiv shows a record date of ${shortDate(11)}; the NSE filing says ${shortDate(10)} and wins.`
    : "The custodian MT564, NSE filing and NSDL file agree.",
  calculationInputs: { recordDate: isoDate(input.recordOffset ?? 10), currency: "INR", cashDecimals: 2, ...input.calculationInputs },
  reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Settlement pending.", expectedCash: 0, expectedGrossCash: 0, expectedWithholdingAmount: 0, expectedNetCash: 0, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "INR", actualCurrency: "INR", expectedSettlementDate: isoDate((input.deadlineOffset ?? 15) + 7), actualSettlementDate: "", expectedAccount: "Multiple accounts", actualAccount: "", investigationSteps: [] },
  instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory event. No market instruction is generated.", simulated: false, approvalActor: "" },
  options: [], tasks: [],
  audit: [{ id: `audit-${input.id}`, eventId: input.id, action: "Notice received", actor: "System", actorType: "system", timestamp: relativeTimestamp((INDIAN_EVENT_META[input.id]?.arrivalHoursAgo ?? 26) - 0.1), detail: "Synthetic NSE notice captured.", previousValue: "", newValue: input.status, reason: "", evidenceId: `EVD-${input.id}`, workflowStatus: input.status }],
  ...input,
});

function closedAnalysisEvent(input: {
  id: string;
  reference: string;
  issuer: string;
  ticker: string;
  isin: string;
  fund: string;
  account: string;
  quantity: number;
  capturedAmount: number;
  forfeitedAmount?: number;
  lapsed?: boolean;
}): EventData {
  const lapsed = Boolean(input.lapsed);
  const rate = lapsed ? 0 : Number((input.capturedAmount / input.quantity).toFixed(2));
  return indianEvent({
    id: input.id,
    reference: input.reference,
    issuer: input.issuer,
    security: `ISIN ${input.isin} · ${input.ticker}`,
    eventType: lapsed ? "Rights issue" : "Cash dividend",
    processingType: lapsed ? "Voluntary" : "Mandatory",
    status: "Closed",
    securityMaster: indianSecurity(input.isin, input.ticker, input.issuer),
    requiredTermKeys: lapsed ? ["rightsRatio", "subscriptionPrice", "recordDate"] : ["rate", "recordDate", "paymentDate", "currency"],
    calculationInputs: lapsed
      ? { ratioNumerator: 1, ratioDenominator: 10, subscriptionPrice: 75 }
      : { rate, withholdingRate: 0 },
    notice: notice(`${input.ticker.toLowerCase()}-closed-event.pdf`, lapsed ? "Closed rights entitlement." : `Cash dividend ₹${rate.toFixed(2)}.`, [lapsed ? "Rights entitlement closed after the instruction deadline." : `Dividend ₹${rate.toFixed(2)} per share settled.`]),
    terms: lapsed
      ? [term("rightsRatio", "Rights ratio", "1 for 10"), term("subscriptionPrice", "Subscription price", "₹75"), term("recordDate", "Record date", shortDate(-12))]
      : [term("rate", "Cash rate", `₹${rate.toFixed(2)}`), term("recordDate", "Record date", shortDate(-12)), term("paymentDate", "Payment date", shortDate(-5)), term("currency", "Currency", "INR")],
    positions: [position(`POS-${input.ticker}`, input.fund, input.account, input.isin, input.quantity, isoDate(-12))],
    historicalOutcome: {
      capturedAmount: input.capturedAmount,
      forfeitedAmount: input.forfeitedAmount ?? 0,
      lapsed,
      deadlineMet: !lapsed,
    },
    reconciliation: {
      expected: input.capturedAmount,
      actual: input.capturedAmount,
      difference: 0,
      tolerance: 0.01,
      status: "Matched",
      classification: "Matched",
      note: lapsed ? "The entitlement lapsed after no sale instruction was recorded." : "Expected and actual settlement matched.",
      expectedCash: input.capturedAmount,
      actualCash: input.capturedAmount,
      expectedSecurityQuantity: 0,
      actualSecurityQuantity: 0,
      expectedCurrency: "INR",
      actualCurrency: "INR",
      expectedSettlementDate: isoDate(-5),
      actualSettlementDate: isoDate(-5),
      expectedAccount: input.account,
      actualAccount: input.account,
      investigationSteps: [],
    },
  });
}

const preloadedEvents: EventData[] = [
  indianEvent({ id: "evt-ind-dividend-review", reference: "CA-IN-DIV-001", issuer: "Aarav Industries Ltd", security: "ISIN INE0AAR01011 · AARAV", eventType: "Cash dividend", processingType: "Mandatory", status: "Under review", amount: 0, securityMaster: indianSecurity("INE0AAR01011", "AARAV", "Aarav Industries Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency", "withholding"], calculationInputs: { rate: 4.25, withholdingRate: 0 }, notice: notice("aarav-dividend-notice.pdf", "Interim dividend of ₹4.25.", ["NSE CORPORATE ACTION: Interim dividend ₹4.25 per equity share."]), terms: [term("rate", "Cash rate", "₹4.25", 1, "₹4.25 per equity share."), term("recordDate", "Record date", shortDate(10), 1, "Record date."), term("paymentDate", "Payment date", shortDate(22), 1, "Payment date."), term("currency", "Payment currency", "INR", 1, "Indian rupees."), term("withholding", "TDS applicability", "Not applicable — mutual fund, s.196", 1, "Section 196 treatment.", "Needs review")], positions: [position("POS-AAR", "Arka Large Cap Fund", "ARKA-LC-001", "INE0AAR01011", 450000, isoDate(10))] }),
  indianEvent({ id: "evt-ind-split", reference: "CA-IN-SPLIT-001", issuer: "Deccan Grid Ltd", security: "ISIN INE0DEC01012 · DGL", eventType: "Stock split", processingType: "Mandatory", status: "Awaiting settlement", amount: 0, unit: "Shares", securityMaster: indianSecurity("INE0DEC01012", "DGL", "Deccan Grid Ltd"), requiredTermKeys: ["splitRatio", "effectiveDate", "recordDate"], calculationInputs: { splitFactor: 5 }, notice: notice("deccan-split-notice.pdf", "Stock split 1:5.", ["Face value ₹10 split into five ₹2 shares."]), terms: [term("splitRatio", "Split ratio", "5 for 1", 1, "1:5 split."), term("effectiveDate", "Effective date", shortDate(15), 1, "Effective date."), term("recordDate", "Record date", shortDate(10), 1, "Record date.")], positions: [position("POS-DEC", "Arka Flexi Cap Fund", "ARKA-FC-001", "INE0DEC01012", 80000, isoDate(10))] }),
  indianEvent({ id: "evt-ind-bonus", reference: "CA-IN-BONUS-001", issuer: "Narmada Logistics Ltd", security: "ISIN INE0NAR01013 · NARMADA", eventType: "Bonus issue", processingType: "Mandatory", status: "Closed", amount: 5000, unit: "Shares", securityMaster: indianSecurity("INE0NAR01013", "NARMADA", "Narmada Logistics Ltd"), requiredTermKeys: ["bonusRatio", "paymentDate", "recordDate"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 10 }, notice: notice("narmada-bonus-notice.pdf", "Bonus issue 1:10.", ["One bonus share for every ten equity shares."]), terms: [term("bonusRatio", "Bonus ratio", "1 for 10", 1, "1:10."), term("paymentDate", "Settlement date", shortDate(17), 1, "Settlement."), term("recordDate", "Record date", shortDate(10), 1, "Record date.")], positions: [position("POS-NAR", "Arka Small Cap Fund", "ARKA-SC-001", "INE0NAR01013", 50000, isoDate(10))] }),
  indianEvent({ id: "evt-ind-buyback", reference: "CA-IN-BUYBACK-001", issuer: "Meridian Infrastructure India Ltd", security: "ISIN INE0MER01014 · MII", eventType: "Tender offer", processingType: "Voluntary", status: "Awaiting approval", amount: 6800000, securityMaster: indianSecurity("INE0MER01014", "MII", "Meridian Infrastructure India Ltd"), requiredTermKeys: ["offerPrice", "maximumAcceptance", "marketDeadline"], calculationInputs: { offerPrice: 850, maximumPercentage: .2 }, notice: notice("meridian-buyback-notice.pdf", "Buyback at ₹850 with 20% acceptance.", ["Tender offer / buyback: ₹850 per share; 20% maximum acceptance."]), terms: [term("offerPrice", "Offer price", "₹850", 1, "₹850."), term("maximumAcceptance", "Maximum acceptance", "20%", 1, "20%."), term("marketDeadline", "Market deadline", istDeadline(15), 1, "IST deadline.")], positions: [position("POS-MER", "Arka Focused 25 Fund", "ARKA-F25-001", "INE0MER01014", 40000, isoDate(10))], options: [{ id: "tender", label: "Tender maximum", description: "Tender up to 20% of the eligible holding at the offer price.", result: "Cash proceeds of ₹850 per accepted share.", default: false, fundingFormula: "Quantity × price" }, { id: "decline", label: "Do not tender", description: "Retain the full holding and skip the buyback.", result: "No cash movement.", default: true, fundingFormula: "No funding" }], audit: [
    { id: "audit-evt-ind-buyback-1", eventId: "evt-ind-buyback", action: "Notice received", actor: "System", actorType: "system", timestamp: relativeTimestamp(25.9), detail: "NSE LODR filing captured for the Meridian Infrastructure buyback.", previousValue: "", newValue: "New", reason: "", evidenceId: "EVD-evt-ind-buyback", workflowStatus: "New" },
    { id: "audit-evt-ind-buyback-2", eventId: "evt-ind-buyback", action: "Custodian MT564 matched", actor: "System", actorType: "system", timestamp: relativeTimestamp(24.5), detail: "SBI-SG MT564 agreed with the NSE filing on price, acceptance and deadline.", previousValue: "New", newValue: "Validated", reason: "", evidenceId: "EVD-evt-ind-buyback", workflowStatus: "Validated" },
    { id: "audit-evt-ind-buyback-3", eventId: "evt-ind-buyback", action: "Terms validated", actor: "Priya Sharma", actorType: "user", timestamp: relativeTimestamp(23), detail: "Offer price ₹850, 20% maximum acceptance and market deadline confirmed against six sources.", previousValue: "", newValue: "", reason: "", evidenceId: "EVD-evt-ind-buyback", workflowStatus: "Validated" },
    { id: "audit-evt-ind-buyback-4", eventId: "evt-ind-buyback", action: "Eligibility computed", actor: "System", actorType: "system", timestamp: relativeTimestamp(22), detail: "3 schemes eligible on the record date; entitlements set at 20% of settled positions.", previousValue: "", newValue: "", reason: "", evidenceId: "EVD-evt-ind-buyback", workflowStatus: "Validated" },
    { id: "audit-evt-ind-buyback-5", eventId: "evt-ind-buyback", action: "Funding check passed", actor: "System", actorType: "system", timestamp: relativeTimestamp(21), detail: "Cash-receivable event. No funding is required for any scheme.", previousValue: "", newValue: "", reason: "", evidenceId: "EVD-evt-ind-buyback", workflowStatus: "Awaiting approval" },
    { id: "audit-evt-ind-buyback-6", eventId: "evt-ind-buyback", action: "Sent to Fund Manager desk", actor: "System", actorType: "system", timestamp: relativeTimestamp(20.5), detail: "Election window opened for Rohan Iyer with the do-not-tender default.", previousValue: "", newValue: "", reason: "", evidenceId: "EVD-evt-ind-buyback", workflowStatus: "Awaiting approval" },
  ] }),
  indianEvent({ id: "evt-ind-scheme", reference: "CA-IN-SCHEME-001", issuer: "Vindhya Mobility Ltd", security: "ISIN INE0VIN01015 · VINDHYA", eventType: "Merger / demerger", processingType: "Mandatory with options", status: "Election required", amount: 0, securityMaster: indianSecurity("INE0VIN01015", "VINDHYA", "Vindhya Mobility Ltd"), requiredTermKeys: ["cashRate", "shareExchangeRatio", "marketDeadline", "recordDate"], calculationInputs: { cashRate: 425, shareExchangeRatio: .333 }, notice: notice("vindhya-scheme-notice.pdf", "Scheme of arrangement.", ["₹425 cash and 0.333 successor shares."]), terms: [term("cashRate", "Cash consideration", "₹425", 1, "Cash."), term("shareExchangeRatio", "Share exchange ratio", "0.333", 1, "Shares."), term("recordDate", "Record date", shortDate(10), 1, "Record date."), term("marketDeadline", "Market deadline", istDeadline(15), 1, "IST.")], positions: [position("POS-VIN", "Arka Infrastructure Fund", "ARKA-INF-001", "INE0VIN01015", 13005, isoDate(10))], options: [{ id: "default-consideration", label: "Accept default consideration", description: "Cash and shares.", result: "Cash plus shares.", default: true, fundingFormula: "No funding" }] }),
  indianEvent({ id: "evt-ind-dividend-break", reference: "CA-IN-DIV-002", issuer: "Harit Utilities Ltd", security: "ISIN INE0HAR01016 · HARIT", eventType: "Cash dividend", processingType: "Mandatory", status: "Break identified", amount: 1912500, securityMaster: indianSecurity("INE0HAR01016", "HARIT", "Harit Utilities Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency", "withholding"], calculationInputs: { rate: 4.25, withholdingRate: 0 }, notice: notice("harit-dividend-notice.pdf", "Interim dividend ₹4.25.", ["₹4.25 dividend. TDS not applicable to Arka Mutual Fund under s.196."]), terms: [term("rate", "Cash rate", "₹4.25", 1, "Rate."), term("recordDate", "Record date", shortDate(10), 1, "Record."), term("paymentDate", "Payment date", shortDate(17), 1, "Payment."), term("currency", "Payment currency", "INR", 1, "INR."), term("withholding", "TDS applicability", "Not applicable — mutual fund, s.196", 1, "s.196.")], positions: [position("POS-HAR", "Arka Large Cap Fund", "ARKA-LC-001", "INE0HAR01016", 450000, isoDate(10))], reconciliation: { expected: 1912500, actual: 1870000, difference: -42500, tolerance: .01, status: "Under-settled", classification: "Under-settled", note: "Custodian paid 4,40,000 shares against 4,50,000 entitled.", expectedCash: 1912500, expectedGrossCash: 1912500, expectedWithholdingAmount: 0, expectedNetCash: 1912500, actualCash: 1870000, expectedSecurityQuantity: 450000, actualSecurityQuantity: 440000, expectedCurrency: "INR", actualCurrency: "INR", expectedSettlementDate: isoDate(17), actualSettlementDate: isoDate(17), expectedAccount: "ARKA-LC-001", actualAccount: "ARKA-LC-001", investigationSteps: ["Verify entitled quantity of 4,50,000 shares.", "Confirm custodian paid on only 4,40,000 shares.", "Recover ₹42,500 for the 10,000-share shortfall."] } }),
  indianEvent({ id: "evt-bharat-rights", reference: ARKA_EVENT.reference, issuer: ARKA_EVENT.issuer, security: `ISIN ${ARKA_EVENT.isin} · ${ARKA_EVENT.ticker}`, eventType: "Rights issue", processingType: "Voluntary", status: "Validated", amount: 0, referencePrice: 120, discountPercentage: 29.2, securityMaster: indianSecurity(ARKA_EVENT.isin, ARKA_EVENT.ticker, ARKA_EVENT.issuer), requiredTermKeys: ["rightsRatio", "subscriptionPrice", "recordDate", "marketDeadline"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 5, subscriptionPrice: 85 }, notice: notice("bharat-rights-issue-notice.pdf", "Rights issue 1:5 at ₹85.", ["Bharat Renewables rights issue: 1 for 5 at ₹85."]), terms: [term("rightsRatio", "Rights ratio", "1 for 5", 1, "Ratio."), term("subscriptionPrice", "Subscription price", "₹85", 1, "Price."), term("recordDate", "Record date", ARKA_EVENT.recordDate, 1, "Record."), term("marketDeadline", "Market deadline", ARKA_EVENT.marketDeadline, 1, "IST.")], positions: projectArkaBharatPositions(), options: [{ id: "exercise", label: "Exercise", description: "Subscribe at ₹85 and keep the holding whole.", result: "Pay cash and receive new shares.", default: true, fundingFormula: "Rights × ₹85" }, { id: "sell", label: "Sell entitlement", description: "Sell the RE on NSE/BSE before the RE window closes.", result: "Recover value without funding.", default: false, fundingFormula: "No funding" }, { id: "lapse", label: "Let lapse", description: "Do nothing and allow the entitlement to expire.", result: "Forfeit the entitlement value.", default: false, fundingFormula: "No funding" }] }),
  indianEvent({ id: "evt-looks-small", reference: "CA-IN-DIV-003", issuer: "Kaveri Consumer Ltd", security: "ISIN INE0KAV01021 · KAVERI", eventType: "Cash dividend", processingType: "Mandatory", status: "Monitoring", teachingScenario: "Looks small, is not", amount: 3_000_000, securityMaster: indianSecurity("INE0KAV01021", "KAVERI", "Kaveri Consumer Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency"], calculationInputs: { rate: 2, withholdingRate: 0 }, notice: notice("kaveri-dividend.pdf", "Dividend ₹2.00.", ["₹2.00 per share."]), terms: [term("rate", "Cash rate", "₹2.00"), term("recordDate", "Record date", shortDate(10)), term("paymentDate", "Payment date", shortDate(18)), term("currency", "Currency", "INR")], positions: [position("POS-KAV", "Arka Small Cap Fund", "ARKA-SC-001", "INE0KAV01021", 1_500_000, isoDate(10))] }),
  indianEvent({ id: "evt-looks-big", reference: "CA-IN-DIV-004", issuer: "Satpura Industries Ltd", security: "ISIN INE0SAT01022 · SATPURA", eventType: "Cash dividend", processingType: "Mandatory", status: "Monitoring", teachingScenario: "Looks big, is not", amount: 10_000_000, securityMaster: indianSecurity("INE0SAT01022", "SATPURA", "Satpura Industries Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency"], calculationInputs: { rate: 10, withholdingRate: 0 }, notice: notice("satpura-dividend.pdf", "Dividend ₹10.00.", ["₹10.00 per share."]), terms: [term("rate", "Cash rate", "₹10.00"), term("recordDate", "Record date", shortDate(10)), term("paymentDate", "Payment date", shortDate(18)), term("currency", "Currency", "INR")], positions: [position("POS-SAT", "Arka Large Cap Fund", "ARKA-LC-001", "INE0SAT01022", 1_000_000, isoDate(10))] }),
  indianEvent({ id: "evt-concentration-creep", reference: "CA-IN-BONUS-002", issuer: "Saffron Digital Ltd", security: "ISIN INE0SAF01023 · SAFFRON", eventType: "Bonus issue", processingType: "Mandatory", status: "Monitoring", teachingScenario: "Concentration creep", amount: 2_250_000, unit: "Shares", securityMaster: indianSecurity("INE0SAF01023", "SAFFRON", "Saffron Digital Ltd"), requiredTermKeys: ["bonusRatio", "recordDate"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 4 }, notice: notice("saffron-bonus.pdf", "Bonus issue 1:4.", ["One bonus share for four."]), terms: [term("bonusRatio", "Bonus ratio", "1 for 4"), term("recordDate", "Record date", shortDate(10))], positions: [position("POS-SAF", "Arka Focused 25 Fund", "ARKA-F25-001", "INE0SAF01023", 9_000_000, isoDate(10))] }),
  indianEvent({ id: "evt-near-miss", reference: "CA-IN-TENDER-002", issuer: "Konkan Ports Ltd", security: "ISIN INE0KON01024 · KONKAN", eventType: "Tender offer", processingType: "Voluntary", status: "Election required", teachingScenario: "Near miss", amount: 7_200_000, securityMaster: indianSecurity("INE0KON01024", "KONKAN", "Konkan Ports Ltd"), requiredTermKeys: ["offerPrice", "maximumAcceptance", "marketDeadline"], calculationInputs: { offerPrice: 600, maximumPercentage: .2 }, notice: notice("konkan-tender.pdf", "Tender at ₹600.", ["Tender at ₹600, 20% maximum."]), terms: [term("offerPrice", "Offer price", "₹600"), term("maximumAcceptance", "Maximum acceptance", "20%"), term("marketDeadline", "Market deadline", istDeadline(3))], positions: [position("POS-KON", "Arka Infrastructure Fund", "ARKA-INF-001", "INE0KON01024", 60_000, isoDate(10))], options: [{ id: "tender", label: "Tender maximum", description: "Tender up to 20%.", result: "Cash proceeds.", default: false, fundingFormula: "Quantity × price" }, { id: "retain", label: "Retain", description: "Keep the holding.", result: "No cash.", default: true, fundingFormula: "No funding" }] }),
  indianEvent({ id: "evt-overlap-dividend", reference: "CA-IN-DIV-005", issuer: "Ganga Telecom Ltd", security: "ISIN INE0GAN01025 · GANGA", eventType: "Cash dividend", processingType: "Mandatory", status: "Monitoring", teachingScenario: "Overlap", amount: 0, securityMaster: indianSecurity("INE0GAN01025", "GANGA", "Ganga Telecom Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency"], calculationInputs: { rate: 3.5, withholdingRate: 0 }, notice: notice("ganga-dividend.pdf", "Dividend ₹3.50.", ["₹3.50 per share."]), terms: [term("rate", "Cash rate", "₹3.50"), term("recordDate", "Record date", shortDate(10)), term("paymentDate", "Payment date", shortDate(21)), term("currency", "Currency", "INR")], positions: [position("POS-GAN-LC", "Arka Large Cap Fund", "ARKA-LC-001", "INE0GAN01025", 1_200_000, isoDate(10)), position("POS-GAN-FC", "Arka Flexi Cap Fund", "ARKA-FC-001", "INE0GAN01025", 900_000, isoDate(10)), position("POS-GAN-SC", "Arka Small Cap Fund", "ARKA-SC-001", "INE0GAN01025", 500_000, isoDate(10)), position("POS-GAN-F25", "Arka Focused 25 Fund", "ARKA-F25-001", "INE0GAN01025", 350_000, isoDate(10)), position("POS-GAN-N50", "Arka Nifty 50 Index Fund", "ARKA-N50-001", "INE0GAN01025", 1_500_000, isoDate(10))] }),
  indianEvent({ id: "evt-routine-split-1", reference: "CA-IN-SPLIT-002", issuer: "Malabar Foods Ltd", security: "ISIN INE0MAL01026 · MALABAR", eventType: "Stock split", processingType: "Mandatory", status: "Closed", amount: 0, unit: "Shares", securityMaster: indianSecurity("INE0MAL01026", "MALABAR", "Malabar Foods Ltd"), requiredTermKeys: ["splitRatio", "recordDate"], calculationInputs: { splitFactor: 2 }, notice: notice("malabar-split.pdf", "Stock split 1:2.", ["One share becomes two."]), terms: [term("splitRatio", "Split ratio", "2 for 1"), term("recordDate", "Record date", shortDate(10))], positions: [position("POS-MAL", "Arka Flexi Cap Fund", "ARKA-FC-001", "INE0MAL01026", 220_000, isoDate(10))], historicalOutcome: { capturedAmount: 0, forfeitedAmount: 0, lapsed: false, deadlineMet: true } }),
  indianEvent({ id: "evt-routine-dividend-2", reference: "CA-IN-DIV-006", issuer: "Cauvery Textiles Ltd", security: "ISIN INE0CAU01027 · CAUVERY", eventType: "Cash dividend", processingType: "Mandatory", status: "Closed", amount: 0, securityMaster: indianSecurity("INE0CAU01027", "CAUVERY", "Cauvery Textiles Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency"], calculationInputs: { rate: 1.25, withholdingRate: 0 }, notice: notice("cauvery-dividend.pdf", "Dividend ₹1.25.", ["₹1.25 per share."]), terms: [term("rate", "Cash rate", "₹1.25"), term("recordDate", "Record date", shortDate(10)), term("paymentDate", "Payment date", shortDate(25)), term("currency", "Currency", "INR")], positions: [position("POS-CAU", "Arka Large Cap Fund", "ARKA-LC-001", "INE0CAU01027", 700_000, isoDate(10))], historicalOutcome: { capturedAmount: 875_000, forfeitedAmount: 0, lapsed: false, deadlineMet: true } }),
  indianEvent({ id: "evt-routine-split-3", reference: "CA-IN-SPLIT-003", issuer: "Nilgiri Cements Ltd", security: "ISIN INE0NIL01028 · NILGIRI", eventType: "Stock split", processingType: "Mandatory", status: "Closed", amount: 0, unit: "Shares", securityMaster: indianSecurity("INE0NIL01028", "NILGIRI", "Nilgiri Cements Ltd"), requiredTermKeys: ["splitRatio", "recordDate"], calculationInputs: { splitFactor: 5 }, notice: notice("nilgiri-split.pdf", "Stock split 1:5.", ["One share becomes five."]), terms: [term("splitRatio", "Split ratio", "5 for 1"), term("recordDate", "Record date", shortDate(10))], positions: [position("POS-NIL", "Arka Flexi Cap Fund", "ARKA-FC-001", "INE0NIL01028", 130_000, isoDate(10))], historicalOutcome: { capturedAmount: 0, forfeitedAmount: 0, lapsed: false, deadlineMet: true } }),
  indianEvent({ id: "evt-routine-dividend-4", reference: "CA-IN-DIV-007", issuer: "Utkal Healthcare Ltd", security: "ISIN INE0UTK01029 · UTKAL", eventType: "Cash dividend", processingType: "Mandatory", status: "Closed", amount: 0, securityMaster: indianSecurity("INE0UTK01029", "UTKAL", "Utkal Healthcare Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency"], calculationInputs: { rate: 2.5, withholdingRate: 0 }, notice: notice("utkal-dividend.pdf", "Dividend ₹2.50.", ["₹2.50 per share."]), terms: [term("rate", "Cash rate", "₹2.50"), term("recordDate", "Record date", shortDate(10)), term("paymentDate", "Payment date", shortDate(27)), term("currency", "Currency", "INR")], positions: [position("POS-UTK", "Arka Nifty 50 Index Fund", "ARKA-N50-001", "INE0UTK01029", 300_000, isoDate(10))], historicalOutcome: { capturedAmount: 750_000, forfeitedAmount: 0, lapsed: false, deadlineMet: true } }),
  indianEvent({ id: "evt-early-sighting", reference: "SIGHTING-NSE-001", issuer: "Veda Consumer Products Ltd", security: "ISIN INE0VED01030 · VEDA", eventType: "Cash dividend", processingType: "Mandatory", status: "Early sighting", settlementStage: "Early sighting", isEarlySighting: true, impactBasis: "Indicative", decisionBlockedReason: "Awaiting custodian notification. You can review the likely impact now, but an instruction cannot be sent until SBI-SG confirms this action.", teachingScenario: "Early sighting", amount: 0, securityMaster: indianSecurity("INE0VED01030", "VEDA", "Veda Consumer Products Ltd"), requiredTermKeys: ["rate", "recordDate"], calculationInputs: { rate: 3, withholdingRate: 0 }, source: "Exchange filing · NSE", sourceRecords: [{ id: "evt-early-sighting-nse", channel: "Exchange announcement", provider: "NSE", messageType: "SEBI LODR filing", receivedAt: seedTimestamp(0, "07:50:00"), assertedFields: { recordDate: isoDate(12), rate: "₹3.00" }, primary: true }], sourceAgreement: "Awaiting SBI-SG MT564 confirmation.", notice: notice("veda-nse-filing.pdf", "Indicative dividend sighting from NSE.", ["NSE filing: proposed dividend ₹3.00 per share."], "NSE"), terms: [term("rate", "Cash rate", "₹3.00"), term("recordDate", "Record date", shortDate(12))], positions: [position("POS-VED", "Arka Nifty 50 Index Fund", "ARKA-N50-001", "INE0VED01030", 900_000, isoDate(10))], options: [], instruction: { status: "Unavailable", destination: "SBI-SG", reference: "", generatedAt: "", content: "No MT565 can be sent until SBI-SG supplies its corporate action reference in an MT564.", simulated: false, approvalActor: "" } }),
  indianEvent({ id: "evt-combined-bonus", reference: "CA-IN-BONUS-003", issuer: "Western Circuits Ltd", security: "ISIN INE0WES01031 · WESTERN", eventType: "Bonus issue", processingType: "Mandatory", status: "Monitoring", teachingScenario: "Combined-only concentration breach", analysisCurrentExposurePercent: 8.85, analysisExposureChangePercent: 0.65, securityMaster: indianSecurity("INE0WES01031", "WESTERN", "Western Circuits Ltd"), requiredTermKeys: ["bonusRatio", "recordDate"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 20 }, notice: notice("western-bonus.pdf", "Bonus issue 1:20.", ["One bonus share for every twenty shares."]), terms: [term("bonusRatio", "Bonus ratio", "1 for 20"), term("recordDate", "Record date", shortDate(10))], positions: [position("POS-WES-BONUS", "Arka Flexi Cap Fund", "ARKA-FC-001", "INE0WES01031", 4_500_000, isoDate(10))] }),
  indianEvent({ id: "evt-combined-rights", reference: "CA-IN-RIGHTS-004", issuer: "Western Circuits Ltd", security: "ISIN INE0WES01031 · WESTERN", eventType: "Rights issue", processingType: "Voluntary", status: "Validated", teachingScenario: "Combined-only concentration breach", analysisCurrentExposurePercent: 8.85, analysisExposureChangePercent: 0.70, securityMaster: indianSecurity("INE0WES01031", "WESTERN", "Western Circuits Ltd"), requiredTermKeys: ["rightsRatio", "subscriptionPrice", "recordDate", "marketDeadline"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 25, subscriptionPrice: 90 }, notice: notice("western-rights.pdf", "Rights issue 1:25 at ₹90.", ["One rights share for every twenty-five shares at ₹90."]), terms: [term("rightsRatio", "Rights ratio", "1 for 25"), term("subscriptionPrice", "Subscription price", "₹90"), term("recordDate", "Record date", shortDate(10)), term("marketDeadline", "Market deadline", istDeadline(23))], positions: [position("POS-WES-RIGHTS", "Arka Flexi Cap Fund", "ARKA-FC-001", "INE0WES01031", 4_500_000, isoDate(10))], options: [{ id: "exercise", label: "Exercise", description: "Subscribe to the rights.", result: "Cash funding is required.", default: true, fundingFormula: "Rights × ₹90" }, { id: "sell", label: "Sell entitlement", description: "Sell the rights entitlement.", result: "No funding required.", default: false, fundingFormula: "No funding" }] }),
  // One issuer, three actions in one quarter. Everywhere else these show as three
  // unrelated rows; the issuer page shows their cumulative effect on the same holding:
  // dividend cash banked, bonus shares added, and the open rights decision sits on the
  // enlarged post-bonus holding.
  indianEvent({ id: "evt-tapti-dividend", reference: "CA-IN-DIV-009", issuer: "Tapti Cements Ltd", security: "ISIN INE0TAP01061 · TAPTI", eventType: "Cash dividend", processingType: "Mandatory", status: "Reconciled", amount: 0, referencePrice: 1240, securityMaster: indianSecurity("INE0TAP01061", "TAPTI", "Tapti Cements Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency"], calculationInputs: { rate: 9, withholdingRate: 0, recordDate: isoDate(-77) }, notice: notice("tapti-dividend-notice.pdf", "Final dividend of ₹9.00.", ["Final dividend of ₹9.00 per equity share."]), terms: [term("rate", "Cash rate", "₹9.00", 1, "₹9.00 per equity share."), term("recordDate", "Record date", shortDate(-77)), term("paymentDate", "Payment date", shortDate(-65)), term("currency", "Payment currency", "INR")], positions: [position("POS-TAP-DIV", "Arka Large Cap Fund", "ARKA-LC-001", "INE0TAP01061", 400_000, isoDate(-77))], historicalOutcome: { capturedAmount: 3_600_000, forfeitedAmount: 0, lapsed: false, deadlineMet: true }, reconciliation: { expected: 3_600_000, actual: 3_600_000, difference: 0, tolerance: 0.01, status: "Matched", classification: "Matched", note: "Expected and actual settlement matched.", expectedCash: 3_600_000, expectedGrossCash: 3_600_000, expectedWithholdingAmount: 0, expectedNetCash: 3_600_000, actualCash: 3_600_000, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "INR", actualCurrency: "INR", expectedSettlementDate: isoDate(-65), actualSettlementDate: isoDate(-65), expectedAccount: "ARKA-LC-001", actualAccount: "ARKA-LC-001", investigationSteps: [] } }),
  indianEvent({ id: "evt-tapti-bonus", reference: "CA-IN-BONUS-004", issuer: "Tapti Cements Ltd", security: "ISIN INE0TAP01061 · TAPTI", eventType: "Bonus issue", processingType: "Mandatory", status: "Closed", amount: 0, unit: "Shares", referencePrice: 1240, securityMaster: indianSecurity("INE0TAP01061", "TAPTI", "Tapti Cements Ltd"), requiredTermKeys: ["bonusRatio", "recordDate"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 4, recordDate: isoDate(-47) }, notice: notice("tapti-bonus-notice.pdf", "Bonus issue 1:4.", ["One bonus share for every four equity shares held."]), terms: [term("bonusRatio", "Bonus ratio", "1 for 4", 1, "1:4 bonus issue."), term("recordDate", "Record date", shortDate(-47)), term("paymentDate", "Credit date", shortDate(-40))], positions: [position("POS-TAP-BON", "Arka Large Cap Fund", "ARKA-LC-001", "INE0TAP01061", 400_000, isoDate(-47))], historicalOutcome: { capturedAmount: 0, forfeitedAmount: 0, lapsed: false, deadlineMet: true }, reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 0.01, status: "Matched", classification: "Matched", note: "100,000 bonus shares credited as announced.", expectedCash: 0, expectedGrossCash: 0, expectedWithholdingAmount: 0, expectedNetCash: 0, actualCash: 0, expectedSecurityQuantity: 100_000, actualSecurityQuantity: 100_000, expectedCurrency: "INR", actualCurrency: "INR", expectedSettlementDate: isoDate(-40), actualSettlementDate: isoDate(-40), expectedAccount: "ARKA-LC-001", actualAccount: "ARKA-LC-001", investigationSteps: [] } }),
  indianEvent({ id: "evt-tapti-rights", reference: "CA-IN-RIGHTS-005", issuer: "Tapti Cements Ltd", security: "ISIN INE0TAP01061 · TAPTI", eventType: "Rights issue", processingType: "Voluntary", status: "Election required", amount: 0, referencePrice: 1240, securityMaster: indianSecurity("INE0TAP01061", "TAPTI", "Tapti Cements Ltd"), requiredTermKeys: ["rightsRatio", "subscriptionPrice", "recordDate", "marketDeadline"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 5, subscriptionPrice: 1050 }, notice: notice("tapti-rights-notice.pdf", "Rights issue 1:5 at ₹1,050.", ["One rights share for every five equity shares held, at ₹1,050 per share."]), terms: [term("rightsRatio", "Rights ratio", "1 for 5"), term("subscriptionPrice", "Subscription price", "₹1,050"), term("recordDate", "Record date", shortDate(5)), term("marketDeadline", "Market deadline", istDeadline(10))], positions: [position("POS-TAP-RIGHTS", "Arka Large Cap Fund", "ARKA-LC-001", "INE0TAP01061", 500_000, isoDate(5))], options: [{ id: "exercise", label: "Exercise", description: "Subscribe to the rights.", result: "Cash funding is required.", default: true, fundingFormula: "Rights × ₹1,050" }, { id: "sell", label: "Sell entitlement", description: "Sell the rights entitlement.", result: "No funding required.", default: false, fundingFormula: "No funding" }] }),
  closedAnalysisEvent({ id: "evt-history-01", reference: "CA-IN-HIST-001", issuer: "Ajanta Consumer Ltd", ticker: "AJANTA", isin: "INE0AJN01041", fund: "Arka Large Cap Fund", account: "ARKA-LC-001", quantity: 1_000_000, capturedAmount: 8_500_000 }),
  closedAnalysisEvent({ id: "evt-history-02", reference: "CA-IN-HIST-002", issuer: "Godavari Banks Ltd", ticker: "GODAVARI", isin: "INE0GOD01042", fund: "Arka Nifty 50 Index Fund", account: "ARKA-N50-001", quantity: 1_200_000, capturedAmount: 7_200_000 }),
  closedAnalysisEvent({ id: "evt-history-03", reference: "CA-IN-HIST-003", issuer: "Coromandel Pharma Ltd", ticker: "COROM", isin: "INE0COR01043", fund: "Arka Flexi Cap Fund", account: "ARKA-FC-001", quantity: 700_000, capturedAmount: 6_300_000 }),
  closedAnalysisEvent({ id: "evt-history-04", reference: "CA-IN-HIST-004", issuer: "Himalaya Bearings Ltd", ticker: "HIMALAYA", isin: "INE0HIM01044", fund: "Arka Small Cap Fund", account: "ARKA-SC-001", quantity: 450_000, capturedAmount: 3_600_000 }),
  closedAnalysisEvent({ id: "evt-history-05", reference: "CA-IN-HIST-005", issuer: "Saraswati Motors Ltd", ticker: "SARAS", isin: "INE0SAR01045", fund: "Arka Focused 25 Fund", account: "ARKA-F25-001", quantity: 500_000, capturedAmount: 5_000_000 }),
  closedAnalysisEvent({ id: "evt-history-06", reference: "CA-IN-HIST-006", issuer: "Kutch Minerals Ltd", ticker: "KUTCH", isin: "INE0KUT01046", fund: "Arka Infrastructure Fund", account: "ARKA-INF-001", quantity: 240_000, capturedAmount: 2_400_000 }),
  closedAnalysisEvent({ id: "evt-history-07", reference: "CA-IN-HIST-007", issuer: "Mysore Retail Ltd", ticker: "MYSORE", isin: "INE0MYS01047", fund: "Arka Mid Cap Fund", account: "ARKA-MC-001", quantity: 600_000, capturedAmount: 4_200_000 }),
  closedAnalysisEvent({ id: "evt-history-08", reference: "CA-IN-HIST-008", issuer: "Rajasthan Cables Ltd", ticker: "RAJCAB", isin: "INE0RAJ01048", fund: "Arka Value Fund", account: "ARKA-VALUE-001", quantity: 300_000, capturedAmount: 2_100_000 }),
  closedAnalysisEvent({ id: "evt-history-09", reference: "CA-IN-HIST-009", issuer: "Eastern Agri Ltd", ticker: "EASTAG", isin: "INE0EAS01049", fund: "Arka ELSS Tax Saver", account: "ARKA-ELSS-001", quantity: 250_000, capturedAmount: 1_500_000 }),
  closedAnalysisEvent({ id: "evt-history-10", reference: "CA-IN-HIST-010", issuer: "Malwa Technologies Ltd", ticker: "MALWATECH", isin: "INE0MAW01050", fund: "Arka Flexi Cap Fund", account: "ARKA-FC-001", quantity: 80_000, capturedAmount: 0, forfeitedAmount: 1_050_000, lapsed: true }),
  closedAnalysisEvent({ id: "evt-history-11", reference: "CA-IN-HIST-011", issuer: "Coastal Energy Ltd", ticker: "COASTAL", isin: "INE0COA01051", fund: "Arka Small Cap Fund", account: "ARKA-SC-001", quantity: 65_000, capturedAmount: 0, forfeitedAmount: 750_000, lapsed: true }),
  indianEvent({ id: "evt-settlement-break-02", reference: "CA-IN-DIV-008", issuer: "Bundelkhand Power Ltd", security: "ISIN INE0BUN01052 · BUNDPOWER", eventType: "Cash dividend", processingType: "Mandatory", status: "Break identified", securityMaster: indianSecurity("INE0BUN01052", "BUNDPOWER", "Bundelkhand Power Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency"], calculationInputs: { rate: 3.2, withholdingRate: 0 }, notice: notice("bundelkhand-dividend.pdf", "Dividend ₹3.20.", ["₹3.20 per share."]), terms: [term("rate", "Cash rate", "₹3.20"), term("recordDate", "Record date", shortDate(-7)), term("paymentDate", "Payment date", shortDate(-2)), term("currency", "Currency", "INR")], positions: [position("POS-BUN", "Arka Banking & Financial", "ARKA-BF-001", "INE0BUN01052", 500_000, isoDate(-7))], reconciliation: { expected: 1_600_000, actual: 1_560_000, difference: -40_000, tolerance: 0.01, status: "Under-settled", classification: "Under-settled", note: "Custodian payment is ₹40,000 below expected cash.", expectedCash: 1_600_000, actualCash: 1_560_000, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "INR", actualCurrency: "INR", expectedSettlementDate: isoDate(-2), actualSettlementDate: isoDate(-2), expectedAccount: "ARKA-BF-001", actualAccount: "ARKA-BF-001", investigationSteps: ["Verify eligible quantity.", "Recover the ₹40,000 shortfall."] } }),
];

const concentrationCreepEvent = preloadedEvents.find((event) => event.id === "evt-concentration-creep");
if (concentrationCreepEvent) {
  concentrationCreepEvent.analysisCurrentExposurePercent = 7.83;
  concentrationCreepEvent.analysisExposureChangePercent = 1.96;
}

const konkanPocScenario = preloadedEvents.find((event) => event.id === "evt-near-miss");
if (konkanPocScenario) {
  konkanPocScenario.source = "Simulated POC source";
  konkanPocScenario.sourceRecords = [{
    id: "evt-near-miss-simulated",
    channel: "Simulated scenario",
    provider: "Arka Mutual Fund POC",
    messageType: "Training fixture",
    receivedAt: konkanPocScenario.receivedAt,
    assertedFields: {},
    primary: true,
  }];
  konkanPocScenario.sourceAgreement = "No live source evidence is attached. All notice, holding and election values are simulated for workflow training.";
}

const OVERLAP_SCHEMES: Record<string, string[]> = {
  "evt-ind-dividend-review": ["arka-flexi-cap", "arka-nifty-50"],
  "evt-ind-split": ["arka-large-cap"],
  "evt-ind-bonus": ["arka-flexi-cap"],
  "evt-ind-buyback": ["arka-infrastructure", "arka-large-cap"],
  "evt-looks-small": ["arka-focused-25"],
  "evt-looks-big": ["arka-flexi-cap", "arka-nifty-50"],
  "evt-routine-split-1": ["arka-large-cap", "arka-focused-25", "arka-nifty-50"],
  "evt-routine-dividend-2": ["arka-flexi-cap", "arka-nifty-50"],
  "evt-routine-split-3": ["arka-large-cap", "arka-small-cap", "arka-focused-25"],
  "evt-routine-dividend-4": ["arka-large-cap"],
  "evt-early-sighting": ["arka-flexi-cap"],
  "evt-history-01": ["arka-flexi-cap", "arka-nifty-50"],
  "evt-history-02": ["arka-large-cap"],
  "evt-history-03": ["arka-large-cap", "arka-focused-25"],
  "evt-history-04": ["arka-flexi-cap"],
  "evt-history-05": ["arka-large-cap"],
  "evt-history-06": ["arka-focused-25"],
  "evt-history-07": ["arka-flexi-cap"],
  "evt-history-08": ["arka-mid-cap"],
  "evt-history-09": ["arka-nifty-50"],
  "evt-history-10": ["arka-large-cap"],
  "evt-history-11": ["arka-infrastructure"],
  "evt-settlement-break-02": ["arka-value"],
};

for (const event of preloadedEvents) {
  const basePosition = event.positions?.[0];
  for (const [index, schemeId] of (OVERLAP_SCHEMES[event.id] ?? []).entries()) {
    const scheme = ARKA_SCHEME_SEED.find((candidate) => candidate.id === schemeId);
    if (!scheme || !basePosition || event.positions.some((candidate: EventData) => candidate.fund === scheme.schemeName)) continue;
    event.positions.push(position(
      `${basePosition.id}-${schemeId}`,
      scheme.schemeName,
      scheme.schemeCode,
      event.securityMaster.isin,
      Math.max(1, Math.floor(Number(basePosition.eligibleQuantity) * (0.7 - index * 0.1))),
      basePosition.positionDate,
    ));
  }
}

const recordDateDisagreement = {
  field: "Record date",
  sightingValue: shortDate(11),
  confirmedValue: shortDate(10),
  winner: "NSE filing wins because dates are controlled by the exchange filing.",
};
const ratioDisagreement = {
  field: "Rights ratio",
  sightingValue: "1 for 6",
  confirmedValue: "1 for 5",
  winner: "NSE filing wins because ratios are controlled by the exchange filing.",
};
const reviewEvent = preloadedEvents.find((event) => event.id === "evt-ind-dividend-review");
if (reviewEvent) reviewEvent.sourceDisagreements = [recordDateDisagreement];
const rightsEvent = preloadedEvents.find((event) => event.id === "evt-bharat-rights");
if (rightsEvent) {
  rightsEvent.sourceDisagreements = [ratioDisagreement];
  rightsEvent.sourceAgreement = "3 of 4 sources agree. The early NSE announcement showed 1 for 6; the replacement filing and SBI-SG MT564 show 1 for 5, and the exchange filing wins.";
  const nse = rightsEvent.sourceRecords.find((record: EventData) => record.provider === "NSE");
  if (nse) Object.assign(nse, { messageType: "SEBI LODR filing · REPL", assertedFields: { ...nse.assertedFields, rightsRatio: "1 for 5", previousRightsRatio: "1 for 6" } });
}

export function buildSchemeImpacts(event: EventData): EventData[] {
  const positions = event.positions ?? [];
  const arkaNames = new Set(ARKA_SCHEME_SEED.map((scheme) => scheme.schemeName));
  const isArkaEvent = positions.some((position: EventData) => arkaNames.has(position.fund));
  const schemes: EventData[] = isArkaEvent
    ? ARKA_SCHEME_SEED
    : positions.map((position: EventData) => ({
        id: position.account,
        schemeName: position.fund,
        schemeCode: position.account,
        aumPaise: null,
        navPaise: null,
      }));
  const previousById = new Map<string, EventData>(
    (event.schemeImpacts ?? []).map((impact: EventData): [string, EventData] => [String(impact.id), impact]),
  );
  return schemes.map((scheme) => {
    const position = positions.find((current: EventData) => (
      isArkaEvent ? current.fund === scheme.schemeName : current.account === scheme.schemeCode
    ));
    const expectedIsin = event.securityMaster?.isin;
    const recordDate = event.calculationInputs?.recordDate;
    const accountClosed = /closed|inactive/i.test(position?.accountStatus ?? "") || /account closed|closed/i.test(position?.dataQualityWarning ?? "");
    const eligible = Boolean(position)
      && position.eligibilityStatus !== "Excluded"
      && (!expectedIsin || position.isin === expectedIsin)
      && (!recordDate || position.positionDate <= recordDate)
      && !accountClosed;
    const quantity = eligible ? Number(position?.eligibleQuantity ?? position?.settledQuantity ?? 0) : 0;
    let cashAmount = 0;
    let direction = "Neutral";
    let quantityResult: number | null = null;
    let navImpactPaise: number | null = null;
    let formula = "";
    let grossCash = 0;
    let withholdingAmount = 0;
    let netCash = 0;
    let securityMovement = "No movement";

    if (event.eventType === "Cash dividend") {
      grossCash = quantity * Number(event.calculationInputs?.rate ?? 0);
      const withholdingRate = Number(event.calculationInputs?.withholdingRate ?? 0);
      withholdingAmount = grossCash * withholdingRate;
      netCash = grossCash - withholdingAmount;
      cashAmount = netCash;
      direction = cashAmount > 0 ? "Receivable" : "Neutral";
      formula = `${quantity.toLocaleString("en-IN")} × ₹${Number(event.calculationInputs?.rate ?? 0).toFixed(2)}`;
      securityMovement = "Cash receipt";
      if (quantity > 0 && scheme.aumPaise != null && scheme.navPaise != null) {
        const unitsOutstanding = Number(scheme.aumPaise) / Number(scheme.navPaise);
        navImpactPaise = Number((netCash / unitsOutstanding * 100).toFixed(2));
      }
    } else if (event.eventType === "Stock split") {
      quantityResult = quantity * Number(event.calculationInputs?.splitFactor ?? 1);
      formula = `${quantity.toLocaleString("en-IN")} × ${Number(event.calculationInputs?.splitFactor ?? 1)}`;
      securityMovement = `${quantityResult.toLocaleString("en-IN")} shares after split`;
    } else if (event.eventType === "Bonus issue") {
      quantityResult = Math.floor(
        quantity
        * Number(event.calculationInputs?.ratioNumerator ?? 0)
        / Number(event.calculationInputs?.ratioDenominator ?? 1),
      );
      formula = `floor(${quantity.toLocaleString("en-IN")} × ${Number(event.calculationInputs?.ratioNumerator ?? 0)} ÷ ${Number(event.calculationInputs?.ratioDenominator ?? 1)})`;
      securityMovement = `${quantityResult.toLocaleString("en-IN")} bonus shares`;
    } else if (event.eventType === "Rights issue") {
      const rights = Math.floor(
        quantity
        * Number(event.calculationInputs?.ratioNumerator ?? 0)
        / Number(event.calculationInputs?.ratioDenominator ?? 1),
      );
      cashAmount = rights * Number(event.calculationInputs?.subscriptionPrice ?? 0);
      direction = cashAmount > 0 ? "Funding" : "Neutral";
      quantityResult = rights;
      formula = `${rights.toLocaleString("en-IN")} × ₹${Number(event.calculationInputs?.subscriptionPrice ?? 0).toFixed(2)}`;
      securityMovement = `${rights.toLocaleString("en-IN")} subscription rights`;
      if (quantity > 0 && scheme.aumPaise != null && scheme.navPaise != null) {
        const unitsOutstanding = Number(scheme.aumPaise) / Number(scheme.navPaise);
        navImpactPaise = Number(((quantity * (120 - 685 / 6)) / unitsOutstanding * 100).toFixed(2));
      }
    } else if (event.eventType === "Tender offer") {
      const accepted = Math.floor(quantity * Number(event.calculationInputs?.maximumPercentage ?? 0));
      cashAmount = accepted * Number(event.calculationInputs?.offerPrice ?? 0);
      direction = cashAmount > 0 ? "Receivable" : "Neutral";
      quantityResult = accepted;
      formula = `${accepted.toLocaleString("en-IN")} × ₹${Number(event.calculationInputs?.offerPrice ?? 0).toFixed(2)}`;
      securityMovement = `Tender up to ${accepted.toLocaleString("en-IN")} shares`;
    } else if (event.eventType === "Merger / demerger") {
      cashAmount = quantity * Number(event.calculationInputs?.cashRate ?? 0);
      direction = cashAmount > 0 ? "Receivable" : "Neutral";
      quantityResult = Math.floor(quantity * Number(event.calculationInputs?.shareExchangeRatio ?? 0));
      formula = `${quantity.toLocaleString("en-IN")} × ₹${Number(event.calculationInputs?.cashRate ?? 0).toFixed(2)}`;
      securityMovement = `${quantityResult.toLocaleString("en-IN")} successor shares`;
    }

    const affected = quantity > 0;
    const id = `imp-${event.id}-${scheme.id}`;
    const previous = previousById.get(id);
    return {
      id,
      schemeId: scheme.id,
      schemeName: scheme.schemeName,
      account: position?.account ?? scheme.schemeCode,
      affected,
      eligibleQuantity: quantity,
      direction,
      cashDirection: direction === "Funding" ? "Payable" : direction,
      cashAmount: Number(cashAmount.toFixed(2)),
      quantityResult,
      navImpactPaise,
      navImpactTreatment: event.eventType === "Rights issue" ? "Dilution" : "Neutral",
      formula,
      expected: Number((cashAmount || quantityResult || 0).toFixed(2)),
      expectedCash: Number(cashAmount.toFixed(2)),
      grossCash: Number(grossCash.toFixed(2)),
      withholdingRate: Number(event.calculationInputs?.withholdingRate ?? 0),
      withholdingAmount: Number(withholdingAmount.toFixed(2)),
      netCash: Number(netCash.toFixed(2)),
      expectedSecurityQuantity: quantityResult ?? 0,
      securityMovement,
      positionDate: position?.positionDate ?? "",
      securityId: position?.securityId ?? event.securityMaster?.securityId ?? "",
      eligibilityStatus: position?.eligibilityStatus ?? "Not held",
      dataQualityWarning: position?.dataQualityWarning ?? "",
      status: previous?.status ?? "Computed on arrival",
      election: previous?.election ?? null,
      electionDecision: previous?.electionDecision ?? null,
      approval: previous?.approval ?? (event.processingType === "Mandatory" ? "Not required" : "Pending"),
      entitlement: quantityResult ?? quantity,
       flag: event.id === "evt-concentration-creep" && scheme.id === "arka-focused-25"
         ? "SEBI 10% headroom"
         : event.eventType === "Rights issue" && scheme.id === "arka-focused-25"
        ? "SEBI 10% headroom"
        : event.eventType === "Rights issue" && scheme.id === "arka-small-cap"
          ? "Cash short"
          : direction === "Funding" && scheme.cashBudgetPaise != null && cashAmount * 100 > Number(scheme.cashBudgetPaise)
            ? "Cash short"
            : null,
    };
  });
}

function refreshSchemeImpacts(event: EventData): void {
  event.schemeImpacts = buildSchemeImpacts(event);
  const affected = event.schemeImpacts.filter((impact: EventData) => impact.affected);
  event.affectedAccounts = affected.length;
  event.amount = affected.reduce((total: number, impact: EventData) => total + Number(impact.cashAmount ?? 0), 0);
}

for (const event of preloadedEvents) {
  refreshSchemeImpacts(event);
}

/** Read-only deterministic fixture snapshot for coherence/control regression tests. */
export function getSeededEventSnapshot(asOf = new Date()): EventData[] {
  return preloadedEvents.map((event) => resolveSeedEvent(event, asOf));
}

function resolveSeedEvent(source: EventData, asOf = new Date()): EventData {
  const event = clone(source);
  const meta = INDIAN_EVENT_META[event.id];
  if (!meta) return event;
  event.receivedAt = relativeTimestamp(meta.arrivalHoursAgo, asOf);
  event.marketDeadlineAt = new Date(asOf.getTime() + meta.deadlineDaysAhead * DAY_MS).toISOString();
  event.internalDeadlineAt = new Date(asOf.getTime() + (meta.deadlineDaysAhead - 1) * DAY_MS).toISOString();
  const deadlineDate = new Date(event.marketDeadlineAt);
  const internalDate = new Date(event.internalDeadlineAt);
  const display = (value: Date, time: string) => `${value.getUTCDate()} ${SHORT_MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()} · ${time} IST`;
  event.marketDeadline = display(deadlineDate, "15:30");
  event.internalDeadline = display(internalDate, "15:00");
  event.sourceRecords = (event.sourceRecords ?? []).map((record: EventData, index: number) => ({
    ...record,
    receivedAt: relativeTimestamp(meta.arrivalHoursAgo + index, asOf),
  }));
  event.audit = (event.audit ?? []).map((entry: EventData, index: number) => ({
    ...entry,
    timestamp: relativeTimestamp(meta.arrivalHoursAgo + index + 0.1, asOf),
  }));
  if (event.notice) event.notice.receivedAt = event.receivedAt;
  return event;
}

export function countArrivalsInLast24Hours(events: EventData[], asOf = new Date()): number {
  const lowerBound = asOf.getTime() - DAY_MS;
  return events.filter((event) => {
    const received = Date.parse(event.receivedAt);
    return Number.isFinite(received) && received > lowerBound && received <= asOf.getTime();
  }).length;
}

function operationalDeadline(value: string): number {
  const match = value.match(/(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})/);
  if (!match) return Number.POSITIVE_INFINITY;
  const month = SHORT_MONTHS.indexOf(match[2]);
  return month < 0 ? Number.POSITIVE_INFINITY : Date.UTC(Number(match[3]), month, Number(match[1]));
}

export function deriveEventSignals(event: EventData, asOf: Date = new Date()): {
  materialityPaise: number | null;
  cashImpactAmount: number | null;
  attention: string | null;
} {
  const navImpacts = (event.schemeImpacts ?? [])
    .filter((impact: EventData) => impact.affected && typeof impact.navImpactPaise === "number")
    .map((impact: EventData) => Number(impact.navImpactPaise));
  const materialityPaise = navImpacts.length > 0 ? Math.max(...navImpacts) : null;
  const cashTotal = (event.schemeImpacts ?? [])
    .filter((impact: EventData) => impact.affected)
    .reduce((total: number, impact: EventData) => total + Number(impact.cashAmount ?? 0), 0);
  const cashImpactAmount = materialityPaise === null && cashTotal > 0
    ? Number(cashTotal.toFixed(2))
    : null;

  let attention: string | null = null;
  if (event.status === "Election required") {
    const deadline = operationalDeadline(event.internalDeadline ?? "");
    const asOfDate = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
    const days = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - asOfDate) / DAY_MS)) : null;
    attention = days === null ? "Decision due" : `Decision due in ${days} day${days === 1 ? "" : "s"}`;
  } else if ((event.schemeImpacts ?? []).some((impact: EventData) => impact.flag === "SEBI 10% headroom")) {
    attention = "SEBI 10% headroom";
  } else if ((event.schemeImpacts ?? []).some((impact: EventData) => impact.flag === "Cash short")) {
    attention = "Cash short";
  } else if (
    event.status === "Break identified"
    || (event.reconciliation?.classification
      && !["Matched", "Not due"].includes(event.reconciliation.classification))
  ) {
    attention = "Settlement break";
  }

  return { materialityPaise, cashImpactAmount, attention };
}

export function sortCorporateActionEvents(events: EventData[], asOf: Date = SEED_DATE_ANCHOR): EventData[] {
  const group = (event: EventData) => {
    if (event.status === "Election required") return 0;
    if (deriveEventSignals(event, asOf).attention) return 1;
    return 2;
  };
  return [...events].sort((left, right) => {
    const groupDifference = group(left) - group(right);
    if (groupDifference !== 0) return groupDifference;
    if (group(left) === 0) return operationalDeadline(left.internalDeadline ?? "") - operationalDeadline(right.internalDeadline ?? "");
    const teachingOrder = (event: EventData) => event.teachingScenario === "Looks small, is not" ? 0 : event.teachingScenario === "Looks big, is not" ? 1 : 2;
    const teachingDifference = teachingOrder(left) - teachingOrder(right);
    if (teachingDifference !== 0) return teachingDifference;
    const leftMateriality = deriveEventSignals(left, asOf).materialityPaise ?? 0;
    const rightMateriality = deriveEventSignals(right, asOf).materialityPaise ?? 0;
    return rightMateriality - leftMateriality;
  });
}

function now() { return new Date().toISOString(); }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const rupeesToPaise = (value: number): bigint => {
  if (!Number.isFinite(value)) throw new Error("Cash amount must be finite.");
  return BigInt(Math.round(value * 100));
};
const paiseToRupees = (value: bigint): number => Number(value) / 100;
const sumMoneyPaise = (items: any[], key: string): number =>
  paiseToRupees(items.reduce((total, item) => total + rupeesToPaise(Number(item[key] ?? 0)), 0n));

function notice(documentName: string, excerpt: string, pages: string[], source = "Synthetic custodian portal") {
  return {
  documentName,
  source,
  receivedAt: seedTimestamp(seedTimeline.noticeReceived, "04:06:00"),
  version: "v1 · synthetic",
  role: "New",
  uploadState: "Synthetic document",
  sourceDocumentId: `doc-${documentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  excerpt,
  pages: pages.map((text, index) => ({ page: index + 1, text })),
  };
}

function term(
  key: string,
  label: string,
  value: string,
  page = 1,
  evidence = value,
  reviewStatus = "Validated",
  confidence = 0.97,
) {
  return {
  key,
  label,
  value,
  page: `p. ${page}`,
  evidence,
  confidence,
  reviewStatus,
  sourceType: "AI extracted",
  manuallyCorrected: false,
  oldValue: "",
  correctionReason: "",
  };
}

function position(
  id: string,
  fund: string,
  account: string,
  isin: string,
  eligibleQuantity: number,
  positionDate: string,
  eligibilityStatus = "Eligible",
  dataQualityWarning = "",
) {
  return {
  id,
  fund,
  account,
  isin,
  securityId: `SEC-${isin.slice(-4)}`,
  settledQuantity: eligibleQuantity,
  unsettledQuantity: 0,
  eligibleQuantity,
  positionDate,
  eligibilityStatus,
  dataQualityWarning,
  };
}

const audit = (
  eventId: string,
  action: string,
  detail: string,
  actor: string,
  workflowStatus: string,
  extras: Record<string, string> = {},
) => ({
  id: `audit-${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  eventId,
  action,
  actor,
  actorType: actor === "System" ? "system" : "user",
  timestamp: now(),
  detail,
  previousValue: extras.previousValue ?? "",
  newValue: extras.newValue ?? "",
  reason: extras.reason ?? "",
  evidenceId: extras.evidenceId ?? "",
  actorId: extras.actorId ?? "",
  actorRole: extras.actorRole ?? "",
  workflowStatus,
});

const task = (
  id: string,
  eventId: string,
  eventReference: string,
  title: string,
  owner: string,
  due: string,
  priority: "High" | "Medium" | "Low",
  category: string,
  detail: string,
  status = "Open",
  dependency = "",
  sourceRule = "CA-CONTROL-001",
) => ({
  id,
  eventId,
  eventReference,
  title,
  detail,
  priority,
  owner,
  due,
  status,
  category,
  dependency,
  sourceRule,
  escalationPath: "Escalate to Compliance",
});

function eventCashDirection(eventType: string): "Receivable" | "Payable" | undefined {
  if (eventType === "Rights issue") return "Payable";
  if (["Cash dividend", "Tender offer", "Merger / acquisition"].includes(eventType)) return "Receivable";
  return undefined;
}

function eventBase(input: Record<string, any>): EventData {
  const event: EventData = {
    seedVersion: SEED_VERSION,
    isHero: false,
    receivedAt: input.notice?.receivedAt ?? seedTimestamp(seedTimeline.noticeReceived, "04:06:00"),
    source: "Manual upload",
    marketDeadlineAt: input.marketDeadlineAt ?? istTimestamp(15, "15:30"),
    internalDeadlineAt: input.internalDeadlineAt ?? istTimestamp(14, "15:00"),
    sourceRecords: input.sourceRecords ?? [{
      id: `${input.id ?? "manual"}-manual`,
      channel: "Manual upload",
      provider: "Arka Mutual Fund",
      messageType: "PDF",
      receivedAt: input.notice?.receivedAt ?? seedTimestamp(seedTimeline.noticeReceived, "04:06:00"),
      assertedFields: {},
      primary: true,
    }],
    sourceAgreement: input.sourceAgreement ?? "No second source has been received yet.",
    schemeImpacts: [],
    noticeReference: input.reference,
    settlementStage: input.status,
    users: demoUsers,
    validation: { missingTerms: [], isReady: false },
    calculation: {
      calculationRunAt: input.calculationRunAt,
      rounding: "Round down fractional securities; round cash to 2 decimal places.",
      assumptions: "Eligibility uses settled position on or before the record date.",
      sourceRule: "CA-CONTROL-003",
    },
    ...input,
  };
  if (!event.cashDirection) event.cashDirection = eventCashDirection(event.eventType);
  return event;
}

// Retained only as source-history while the India-only fixtures below are active.
const legacyPreloadedEvents: EventData[] = [
  eventBase({
    id: "evt-aurora-review",
    reference: "CA-2026-0814-AX",
    issuer: "Aurora Global plc",
    security: "ISIN GB00AUR00018 · AUR",
    eventType: "Cash dividend",
    processingType: "Mandatory",
    status: "Under review",
    marketDeadline: `${shortDate(seedTimeline.aurora.market)} · 16:00 BST`,
    internalDeadline: `${shortDate(seedTimeline.aurora.internal)} · 16:00 BST`,
    affectedAccounts: 2,
    amount: 0,
    currency: "GBP",
    securityMaster: { securityId: "SEC-002", isin: "GB00AUR00018", ticker: "AUR", securityName: "Aurora Global plc", currency: "GBP", market: "United Kingdom", status: "Active" },
    requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency", "withholding"],
    calculationInputs: { rate: 0.425, currency: "GBP", cashDecimals: 2, recordDate: isoDate(seedTimeline.aurora.record) },
    notice: notice(
      "cash-dividend-notice.pdf",
      "The Board has declared an interim cash dividend. The payment currency is defined in the settlement section.",
      [
        `CORPORATE ACTION NOTIFICATION\nNotice Reference: CA-2026-0814-AX\nIssuer: Aurora Global plc\nEvent: Mandatory cash dividend\nRecord date: ${longDate(seedTimeline.aurora.record)}\nGross rate: GBP 0.425 per ordinary share.`,
        `Settlement terms\nPayment date: ${longDate(seedTimeline.aurora.payment)}.\nAll payments will be made in pound sterling (GBP).\nWithholding treatment remains subject to market documentation.`,
      ],
    ),
    terms: [
      term("rate", "Cash rate", "GBP 0.4250", 1, "“Gross rate: GBP 0.425 per ordinary share.”"),
      term("recordDate", "Record date", shortDate(seedTimeline.aurora.record), 1, `“Record date: ${longDate(seedTimeline.aurora.record)}.”`),
      term("paymentDate", "Payment date", shortDate(seedTimeline.aurora.payment), 2, `“Payment date: ${longDate(seedTimeline.aurora.payment)}.”`),
      term("currency", "Payment currency", "GBP", 2, "“All payments will be made in pound sterling (GBP).”", "Needs review", 0.71),
      term("withholding", "Withholding tax", "Rate required from market documentation", 2, "“Withholding treatment remains subject to market documentation.”", "Needs review", 0.42),
    ],
    positions: [
      position("POS-AUR-1", "Northbridge Income Fund", "CUST-8101", "GB00AUR00018", 300000, isoDate(seedTimeline.aurora.record)),
      position("POS-AUR-2", "Northbridge Balanced Fund", "CUST-9227", "GB00AUR00018", 150000, isoDate(seedTimeline.aurora.record)),
      position("POS-AUR-X", "Northbridge Income Fund", "CUST-8102", "GB00AUR00099", 25000, isoDate(seedTimeline.aurora.record), "Not matched", "Same issuer but different ISIN"),
    ],
    historicalRows: [],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory event. No market instruction is generated.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Expected net cash is pending withholding-rate validation.", expectedCash: 0, expectedGrossCash: 0, expectedWithholdingAmount: 0, expectedNetCash: 0, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "GBP", actualCurrency: "GBP", expectedSettlementDate: isoDate(seedTimeline.aurora.payment), actualSettlementDate: "", expectedAccount: "Multiple accounts", actualAccount: "", investigationSteps: [] },
    tasks: [
      task("task-aur-1", "evt-aurora-review", "CA-2026-0814-AX", "Check payment currency", "Rohan Iyer", "Today · 11:00 BST", "High", "Term check", "Confirm the currency evidence before calculation can be released."),
      task("task-aur-2", "evt-aurora-review", "CA-2026-0814-AX", "Supply withholding rate", "Tax Operations", `${taskDate(seedTimeline.aurora.market)} · 09:00 BST`, "High", "Term validation", "Provide the event-level withholding rate from market documentation. The analyst must record the correction reason before calculation.", "Open", "Validate payment currency", "CA-CONTROL-008"),
    ],
    audit: [
      { id: "audit-aur-1", eventId: "evt-aurora-review", action: "Notice extracted", actor: "System", actorType: "system", timestamp: seedTimestamp(seedTimeline.aurora.audit, "05:44:00"), detail: "Terms extracted with evidence; payment currency remains unvalidated.", previousValue: "", newValue: "Under review", reason: "", evidenceId: "EVD-AUR-04", workflowStatus: "Under review" },
    ],
  }),
  eventBase({
    id: "evt-delta-split",
    reference: "CA-2026-0809-DL",
    issuer: "Delta Grid Technologies",
    security: "ISIN US24703D1072 · DGT",
    eventType: "Stock split",
    processingType: "Mandatory",
    status: "Awaiting settlement",
    marketDeadline: `${shortDate(seedTimeline.delta.market)} · EOD`,
    internalDeadline: `${shortDate(seedTimeline.delta.internal)} · 15:00 ET`,
    affectedAccounts: 2,
    amount: 420000,
    currency: "Shares",
    securityMaster: { securityId: "SEC-003", isin: "US24703D1072", ticker: "DGT", securityName: "Delta Grid Technologies", currency: "USD", market: "United States", status: "Active" },
    requiredTermKeys: ["splitRatio", "effectiveDate", "recordDate"],
    calculationInputs: { splitFactor: 4, recordDate: isoDate(seedTimeline.delta.record), fractionalTreatment: "Round down" },
    notice: notice("stock-split-notice.pdf", "Four new shares replace each existing share at the effective date.", [`NOTICE CA-2026-0809-DL\nDelta Grid Technologies\nMandatory 4-for-1 forward split.\nRecord date: ${longDate(seedTimeline.delta.record)}.\nEach holder receives four new shares for each existing share.`, `Effective before market open on ${longDate(seedTimeline.delta.market)}. Fractional share entitlements are rounded down.`]),
    terms: [
      term("splitRatio", "Split ratio", "4 for 1", 1, "“Each holder receives four new shares for each existing share.”"),
      term("recordDate", "Record date", shortDate(seedTimeline.delta.record), 1, `“Record date: ${longDate(seedTimeline.delta.record)}.”`, "Needs review"),
      term("effectiveDate", "Effective date", shortDate(seedTimeline.delta.market), 2, `“Effective before market open on ${longDate(seedTimeline.delta.market)}.”`),
    ],
    positions: [
      position("POS-DGT-1", "Northbridge Growth Fund", "CUST-4410", "US24703D1072", 80000, isoDate(seedTimeline.delta.record)),
      position("POS-DGT-2", "Sovereign Select Mandate", "CUST-1138", "US24703D1072", 25000, isoDate(seedTimeline.delta.record)),
    ],
    historicalRows: [
      { id: "imp-dgt-1", fund: "Northbridge Growth Fund", account: "CUST-4410", eligibleQuantity: 80000, positionDate: isoDate(seedTimeline.delta.record), securityId: "SEC-003", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "80,000 × 4", expected: 320000, expectedCash: 0, expectedSecurityQuantity: 320000, securityMovement: "240,000 additional shares", currency: "Shares", status: "Calculated", election: null, approval: "Not required" },
      { id: "imp-dgt-2", fund: "Sovereign Select Mandate", account: "CUST-1138", eligibleQuantity: 25000, positionDate: isoDate(seedTimeline.delta.record), securityId: "SEC-003", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "25,000 × 4", expected: 100000, expectedCash: 0, expectedSecurityQuantity: 100000, securityMovement: "75,000 additional shares", currency: "Shares", status: "Calculated", election: null, approval: "Not required" },
    ],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory position adjustment. No instruction is submitted.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 420000, actual: 0, difference: -420000, tolerance: 1, status: "Not due", classification: "Not due", note: "Awaiting custodian movement confirmation.", expectedCash: 0, actualCash: 0, expectedSecurityQuantity: 420000, actualSecurityQuantity: 0, expectedCurrency: "Shares", actualCurrency: "Shares", expectedSettlementDate: isoDate(seedTimeline.delta.settlement), actualSettlementDate: "", expectedAccount: "Multiple accounts", actualAccount: "", investigationSteps: [] },
    tasks: [task("task-dgt-1", "evt-delta-split", "CA-2026-0809-DL", "Check security receipt", "Rohan Iyer", `${taskDate(seedTimeline.delta.market)} · EOD ET`, "Medium", "Settlement", "Reconcile post-split quantities once custodian movement arrives.")],
    audit: [{ id: "audit-dgt-1", eventId: "evt-delta-split", action: "Calculation approved", actor: "Nisha Kapoor", actorType: "user", timestamp: seedTimestamp(seedTimeline.delta.audit, "06:45:00"), detail: "Split calculation and position eligibility approved.", previousValue: "Impact calculated", newValue: "Awaiting settlement", reason: "Mandatory event", evidenceId: "EVD-DGT-01", workflowStatus: "Awaiting settlement" }],
  }),
  eventBase({
    id: "evt-nimbus-bonus",
    reference: "CA-2026-0812-NB",
    issuer: "Nimbus Logistics SA",
    security: "ISIN NL000NIMB001 · NMB",
    eventType: "Stock dividend / bonus issue",
    processingType: "Mandatory",
    status: "Closed",
    marketDeadline: `${shortDate(seedTimeline.nimbus.market)} · EOD CET`,
    internalDeadline: `${shortDate(seedTimeline.nimbus.internal)} · EOD CET`,
    affectedAccounts: 1,
    amount: 5000,
    currency: "Shares",
    securityMaster: { securityId: "SEC-004", isin: "NL000NIMB001", ticker: "NMB", securityName: "Nimbus Logistics SA", currency: "EUR", market: "Netherlands", status: "Active" },
    requiredTermKeys: ["bonusRatio", "paymentDate", "recordDate"],
    calculationInputs: { ratioNumerator: 1, ratioDenominator: 10, recordDate: isoDate(seedTimeline.nimbus.record), fractionalTreatment: "Round down" },
    notice: notice("nimbus-bonus-issue.pdf", "One bonus share is issued for every ten ordinary shares held.", [`BONUS ISSUE\nNimbus Logistics SA\nMandatory bonus issue of one new ordinary share for every ten existing shares.\nRecord date: ${longDate(seedTimeline.nimbus.record)}.`, `Payment date: ${longDate(seedTimeline.nimbus.settlement)}. Fractions are paid in cash at the agent's determination.`]),
    terms: [term("bonusRatio", "Bonus ratio", "1 for 10", 1, "“One new ordinary share for every ten existing shares.”"), term("paymentDate", "Settlement date", shortDate(seedTimeline.nimbus.settlement), 2, `“Payment date: ${longDate(seedTimeline.nimbus.settlement)}.”`), term("recordDate", "Record date", shortDate(seedTimeline.nimbus.record), 1, `“Record date: ${longDate(seedTimeline.nimbus.record)}.”`, "Needs review")],
    positions: [position("POS-NMB-1", "European Opportunities Fund", "CUST-6632", "NL000NIMB001", 50000, isoDate(seedTimeline.nimbus.record))],
    historicalRows: [{ id: "imp-nmb-1", fund: "European Opportunities Fund", account: "CUST-6632", eligibleQuantity: 50000, positionDate: isoDate(seedTimeline.nimbus.record), securityId: "SEC-004", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "floor(50,000 × 1 ÷ 10)", expected: 5000, expectedCash: 0, expectedSecurityQuantity: 5000, securityMovement: "5,000 bonus shares", currency: "Shares", status: "Reconciled", election: null, approval: "Not required" }],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory bonus issue processed without instruction.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 5000, actual: 5000, difference: 0, tolerance: 1, status: "Matched", classification: "Matched", note: "Custodian security movement matches expected entitlement.", expectedCash: 0, actualCash: 0, expectedSecurityQuantity: 5000, actualSecurityQuantity: 5000, expectedCurrency: "Shares", actualCurrency: "Shares", expectedSettlementDate: isoDate(seedTimeline.nimbus.settlement), actualSettlementDate: isoDate(seedTimeline.nimbus.settlement), expectedAccount: "CUST-6632", actualAccount: "CUST-6632", investigationSteps: [] },
    tasks: [],
    audit: [{ id: "audit-nmb-1", eventId: "evt-nimbus-bonus", action: "Event closed", actor: "Nisha Kapoor", actorType: "user", timestamp: seedTimestamp(seedTimeline.nimbus.audit, "09:15:00"), detail: "Settlement matched and closure control completed.", previousValue: "Reconciled", newValue: "Closed", reason: "All mandatory controls complete", evidenceId: "SET-NMB-01", workflowStatus: "Closed" }],
  }),
  eventBase({
    id: "evt-meridian-tender",
    reference: "CA-2026-0818-MT",
    issuer: "Meridian Infrastructure Ltd",
    security: "ISIN AU0000MERID2 · MRL",
    eventType: "Tender offer",
    processingType: "Voluntary",
    status: "Awaiting approval",
    marketDeadline: `${shortDate(seedTimeline.meridian.market)} · 19:00 AEST`,
    internalDeadline: `${shortDate(seedTimeline.meridian.internal)} · 19:00 AEST`,
    affectedAccounts: 1,
    amount: 68000,
    currency: "AUD",
    securityMaster: { securityId: "SEC-005", isin: "AU0000MERID2", ticker: "MRL", securityName: "Meridian Infrastructure Ltd", currency: "AUD", market: "Australia", status: "Active" },
    requiredTermKeys: ["offerPrice", "maximumAcceptance", "marketDeadline"],
    calculationInputs: { offerPrice: 8.5, maximumPercentage: 0.2, recordDate: isoDate(seedTimeline.meridian.record) },
    notice: notice("meridian-tender-offer.pdf", "The company offers to acquire up to twenty per cent of each eligible holding at AUD 8.50 per share.", ["OFF-MARKET TENDER OFFER\nMaximum acceptance: 20% of each eligible holding.\nOffer price: AUD 8.50 per share.", `Market deadline: ${longDate(seedTimeline.meridian.market)}, 19:00 AEST. Default option: do not tender.`]),
    terms: [term("offerPrice", "Offer price", "AUD 8.50", 1, "“Offer price: AUD 8.50 per share.”"), term("maximumAcceptance", "Maximum acceptance", "20%", 1, "“Up to twenty per cent of each eligible holding.”"), term("marketDeadline", "Market deadline", `${shortDate(seedTimeline.meridian.market)} · 19:00 AEST`, 2, `“Market deadline: ${longDate(seedTimeline.meridian.market)}, 19:00 AEST.”`)],
    positions: [position("POS-MRL-1", "Sovereign Select Mandate", "CUST-1138", "AU0000MERID2", 40000, isoDate(seedTimeline.meridian.record))],
    historicalRows: [{ id: "imp-mrl-1", fund: "Sovereign Select Mandate", account: "CUST-1138", eligibleQuantity: 40000, positionDate: isoDate(seedTimeline.meridian.record), securityId: "SEC-005", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "8,000 × AUD 8.50", expected: 68000, expectedCash: 68000, cashDirection: "Receivable", expectedSecurityQuantity: 0, securityMovement: "Tender 8,000 shares", currency: "AUD", status: "Election submitted", election: "tender", electionDecision: { optionId: "tender", quantityElected: 8000, requiredFunding: 0, analystId: "USR-004", analyst: "Rohan Iyer", comment: "Portfolio decision received.", status: "Submitted" }, approval: "Pending" }],
    options: [{ id: "tender", label: "Tender maximum", description: "Tender up to 20% of the eligible position.", result: "Expected cash proceeds at the offer price.", default: false, fundingFormula: "Quantity elected × offer price" }, { id: "decline", label: "Do not tender", description: "Retain the current holding.", result: "No cash proceeds.", default: true, fundingFormula: "No funding" }],
    instruction: { status: "DRAFT", destination: "Synthetic custodian gateway", reference: "DRAFT-MRL-0818", generatedAt: seedTimestamp(seedTimeline.meridian.audit, "06:40:00"), content: "DRAFT ONLY - awaiting reviewer approval.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 68000, actual: 0, difference: -68000, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Tender outcome pending.", expectedCash: 68000, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "AUD", actualCurrency: "AUD", expectedSettlementDate: isoDate(seedTimeline.meridian.settlement), actualSettlementDate: "", expectedAccount: "CUST-1138", actualAccount: "", investigationSteps: [] },
    tasks: [task("task-mrl-1", "evt-meridian-tender", "CA-2026-0818-MT", "Complete Compliance approval", "Nisha Kapoor", `${taskDate(seedTimeline.meridian.internal)} · 19:00 AEST`, "High", "Approval", "Compliance must independently approve the tender.", "Open", "Obtain election decision", "CA-CONTROL-004")],
    audit: [{ id: "audit-mrl-1", eventId: "evt-meridian-tender", action: "Election submitted", actor: "Rohan Iyer", actorType: "user", timestamp: seedTimestamp(seedTimeline.meridian.audit, "06:35:00"), detail: "Tender election for 8,000 shares submitted for independent review.", previousValue: "Election required", newValue: "Awaiting approval", reason: "Portfolio decision received", evidenceId: "EVD-MRL-02", workflowStatus: "Awaiting approval" }],
  }),
  eventBase({
    id: "evt-verdant-merger",
    reference: "CA-2026-0820-VM",
    issuer: "Verdant Mobility Holdings",
    security: "ISIN FR001400VMH4 · VMH",
    eventType: "Merger / acquisition",
    processingType: "Mandatory with options",
    status: "Election required",
    marketDeadline: `${shortDate(seedTimeline.merger.market)} · 10:00 CEST`,
    internalDeadline: `${shortDate(seedTimeline.merger.internal)} · 10:00 CEST`,
    affectedAccounts: 1,
    amount: 55271.25,
    currency: "EUR",
    securityMaster: { securityId: "SEC-006", isin: "FR001400VMH4", ticker: "VMH", securityName: "Verdant Mobility Holdings", currency: "EUR", market: "France", status: "Active" },
    requiredTermKeys: ["cashRate", "shareExchangeRatio", "marketDeadline", "recordDate"],
    calculationInputs: { cashRate: 4.25, shareExchangeRatio: 0.333, recordDate: isoDate(seedTimeline.merger.record), fractionalTreatment: "Cash in lieu at EUR 3.00" },
    notice: notice("verdant-mobility-merger.pdf", "Holders receive EUR 4.25 cash and 0.333 New Horizon shares for each share. Fractions are settled in cash.", [`MERGER CONSIDERATION\nEach Verdant Mobility share receives EUR 4.25 in cash and 0.333 New Horizon shares.\nRecord date: ${longDate(seedTimeline.merger.record)}.`, `Market deadline: ${longDate(seedTimeline.merger.market)} 10:00 CEST. Fractional New Horizon shares will be paid in cash in lieu at EUR 3.00.`]),
    terms: [term("cashRate", "Cash consideration", "EUR 4.25", 1, "“Receives EUR 4.25 in cash.”"), term("shareExchangeRatio", "Share exchange ratio", "0.333", 1, "“0.333 New Horizon shares for each share.”"), term("recordDate", "Record date", shortDate(seedTimeline.merger.record), 1, `“Record date: ${longDate(seedTimeline.merger.record)}.”`, "Needs review"), term("marketDeadline", "Market deadline", `${shortDate(seedTimeline.merger.market)} · 10:00 CEST`, 2, `“Market deadline: ${longDate(seedTimeline.merger.market)} 10:00 CEST.”`)],
    positions: [
      position("POS-VMH-1", "European Opportunities Fund", "CUST-6632", "FR001400VMH4", 13005, isoDate(seedTimeline.merger.record)),
      position("POS-VMH-X", "Closed Legacy Fund", "CUST-0000", "FR001400VMH4", 100, isoDate(seedTimeline.merger.record), "Excluded", "Account closed"),
    ],
    historicalRows: [{ id: "imp-vmh-1", fund: "European Opportunities Fund", account: "CUST-6632", eligibleQuantity: 13005, positionDate: isoDate(seedTimeline.merger.record), securityId: "SEC-006", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "(13,005 × EUR 4.25) + floor(13,005 × 0.333) shares + cash in lieu", expected: 55271.25, expectedCash: 55271.25, cashDirection: "Receivable", expectedSecurityQuantity: 4330, securityMovement: "4,330 New Horizon shares; fraction paid in cash", currency: "EUR", status: "Calculated", election: null, approval: "Pending" }],
    options: [{ id: "default-consideration", label: "Accept default consideration", description: "Receive the announced cash and share consideration.", result: "Cash plus shares; fractional share settled in cash.", default: true, fundingFormula: "No funding" }, { id: "cash-only", label: "Cash alternative", description: "Elect the optional all-cash consideration.", result: "Cash consideration subject to offer terms.", default: false, fundingFormula: "No funding" }],
    instruction: { status: "DRAFT", destination: "Synthetic Euroclear gateway", reference: "DRAFT-VMH-0820", generatedAt: seedTimestamp(seedTimeline.merger.audit, "07:00:00"), content: "DRAFT ONLY - election required before any simulated instruction.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 55271.25, actual: 0, difference: -55271.25, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Settlement follows election deadline.", expectedCash: 55271.25, actualCash: 0, expectedSecurityQuantity: 4330, actualSecurityQuantity: 0, expectedCurrency: "EUR", actualCurrency: "EUR", expectedSettlementDate: isoDate(seedTimeline.merger.settlement), actualSettlementDate: "", expectedAccount: "CUST-6632", actualAccount: "", investigationSteps: [] },
    tasks: [task("task-vmh-1", "evt-verdant-merger", "CA-2026-0820-VM", "Obtain merger election", "Fund Manager", `${taskDate(seedTimeline.merger.internal)} · 10:00 CEST`, "High", "Election", "Confirm the account's optional consideration election before the internal deadline.")],
    audit: [{ id: "audit-vmh-1", eventId: "evt-verdant-merger", action: "Fractional entitlement flagged", actor: "System", actorType: "system", timestamp: seedTimestamp(seedTimeline.merger.audit, "07:05:00"), detail: "Fractional share treatment requires analyst review.", previousValue: "", newValue: "Election required", reason: "Fractional consideration", evidenceId: "EVD-VMH-02", workflowStatus: "Election required" }],
  }),
  eventBase({
    id: "evt-harbor-break",
    reference: "CA-2026-0804-HB",
    issuer: "Harbor Utilities plc",
    security: "ISIN GB00HARB0007 · HBR",
    eventType: "Cash dividend",
    processingType: "Mandatory",
    status: "Break identified",
    marketDeadline: `${shortDate(seedTimeline.harbor.market)} · EOD BST`,
    internalDeadline: `${shortDate(seedTimeline.harbor.internal)} · EOD BST`,
    affectedAccounts: 1,
    amount: 162562.5,
    currency: "GBP",
    securityMaster: { securityId: "SEC-007", isin: "GB00HARB0007", ticker: "HBR", securityName: "Harbor Utilities plc", currency: "GBP", market: "United Kingdom", status: "Active" },
    requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency", "withholding"],
    calculationInputs: { rate: 0.425, withholdingRate: 0.15, currency: "GBP", cashDecimals: 2, recordDate: isoDate(seedTimeline.harbor.record) },
    notice: notice("harbor-dividend-notice.pdf", "A mandatory cash dividend is payable in GBP after withholding tax.", [`CASH DIVIDEND\nRate: GBP 0.425 per ordinary share.\nRecord date: ${longDate(seedTimeline.harbor.record)}.`, `Payment date: ${longDate(seedTimeline.harbor.settlement)}.\nCurrency: GBP.\nWithholding rate: 15% of gross dividend.`]),
    terms: [term("rate", "Cash rate", "GBP 0.4250", 1, "“Rate: GBP 0.425 per ordinary share.”"), term("recordDate", "Record date", shortDate(seedTimeline.harbor.record), 1, `“Record date: ${longDate(seedTimeline.harbor.record)}.”`), term("paymentDate", "Payment date", shortDate(seedTimeline.harbor.settlement), 2, `“Payment date: ${longDate(seedTimeline.harbor.settlement)}.”`), term("currency", "Payment currency", "GBP", 2, "“Currency: GBP.”"), term("withholding", "Withholding tax", "15%", 2, "“Withholding rate: 15% of gross dividend.”")],
    positions: [position("POS-HBR-1", "Northbridge Income Fund", "CUST-4081", "GB00HARB0007", 450000, isoDate(seedTimeline.harbor.record))],
    historicalRows: [{ id: "imp-hbr-1", fund: "Northbridge Income Fund", account: "CUST-4081", eligibleQuantity: 450000, positionDate: isoDate(seedTimeline.harbor.record), securityId: "SEC-007", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "Gross GBP 191,250.00; withholding 15% = GBP 28,687.50; net GBP 162,562.50", expected: 162562.5, expectedCash: 162562.5, cashDirection: "Receivable", grossCash: 191250, withholdingRate: 0.15, withholdingAmount: 28687.5, netCash: 162562.5, expectedSecurityQuantity: 0, securityMovement: "Net cash receipt after withholding", currency: "GBP", status: "Break identified", election: null, approval: "Not required" }],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory cash event. No instruction is submitted.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 162562.5, actual: 160562.5, difference: -2000, tolerance: 0.01, status: "Under-settled", classification: "Under-settled", note: "Custodian payment is GBP 2,000 below the expected net cash after 15% withholding.", expectedCash: 162562.5, expectedGrossCash: 191250, expectedWithholdingAmount: 28687.5, expectedNetCash: 162562.5, actualCash: 160562.5, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "GBP", actualCurrency: "GBP", expectedSettlementDate: isoDate(seedTimeline.harbor.settlement), actualSettlementDate: isoDate(seedTimeline.harbor.settlement), expectedAccount: "CUST-4081", actualAccount: "CUST-4081", investigationSteps: ["Verify the eligible quantity and record date.", "Confirm the GBP 0.425 gross dividend rate.", "Confirm the validated 15% withholding rate and GBP 28,687.50 tax amount.", "Compare the expected net GBP 162,562.50 with the custodian's GBP 160,562.50 payment.", "Contact the synthetic custodian about the remaining GBP 2,000 shortfall."] },
    tasks: [task("task-hbr-1", "evt-harbor-break", "CA-2026-0804-HB", "Investigate post-tax payment shortfall", "Rohan Iyer", "Today · 14:00 BST", "High", "Reconciliation", "Expected net GBP 162,562.50 after GBP 28,687.50 withholding; actual GBP 160,562.50. Investigate the remaining GBP 2,000 shortfall.", "Open", "", "CA-CONTROL-007")],
    audit: [{ id: "audit-hbr-1", eventId: "evt-harbor-break", action: "Settlement break identified", actor: "System", actorType: "system", timestamp: seedTimestamp(seedTimeline.harbor.audit, "10:00:00"), detail: "Under-settlement of GBP 2,000 detected; exception task generated.", previousValue: "Awaiting settlement", newValue: "Break identified", reason: "Actual cash below expected", evidenceId: "SET-HBR-01", workflowStatus: "Break identified" }],
  }),
];

function heroRightsEvent(documentName: string, source: string, actor: WorkflowActor): EventData {
  const eventId = `evt-verdant-rights-${Date.now()}`;
  return eventBase({
    id: eventId,
    isHero: true,
    reference: "CA-2026-0821-VR",
    issuer: "Verdant Renewables SA",
    security: "ISIN FR001400VRN5 · VRN",
    eventType: "Rights issue",
    processingType: "Voluntary",
    status: "Received",
    marketDeadline: `${shortDate(seedTimeline.rights.market)} · 10:00 CEST`,
    internalDeadline: `${shortDate(seedTimeline.rights.internal)} · 10:00 CEST`,
    affectedAccounts: 0,
    amount: 0,
    currency: "EUR",
    securityMaster: { securityId: "SEC-001", isin: "FR001400VRN5", ticker: "VRN", securityName: "Verdant Renewables SA", issuer: "Verdant Renewables SA", currency: "EUR", market: "France", status: "Active", aliases: ["Verdant Renewables S.A."] },
    requiredTermKeys: ["rightsRatio", "subscriptionPrice", "marketDeadline", "recordDate", "defaultOption"],
    calculationInputs: { ratioNumerator: 1, ratioDenominator: 5, subscriptionPrice: 8.5, currency: "EUR", recordDate: isoDate(seedTimeline.rights.record), fractionalTreatment: "Round down" },
    notice: {
      ...notice(
        documentName,
        "The uploaded synthetic notice is classified as a voluntary rights issue. Key terms remain unvalidated until an analyst reviews the evidence.",
        [
          `CORPORATE ACTION NOTIFICATION\nNotice Reference: CA-2026-0821-VR\nIssuer: Verdant Renewables S.A.\nSecurity: Verdant Renewables Ordinary Shares\nISIN: FR001400VRN5\nEvent Type: Rights Issue\nClassification: Voluntary\nRecord Date: ${longDate(seedTimeline.rights.record)}.`,
          "ENTITLEMENT\nOne new share for every five existing shares.\nEligible holders may subscribe at a price of EUR 8.50 per new share.\nOptions: exercise, sell rights, or allow rights to lapse.",
          `DEADLINE AND CONDITIONS\nInstructions must be received by ${longDate(seedTimeline.rights.market)} at 10:00 CEST.\nDefault option: rights lapse if no instruction is received.\nFractional entitlements will be rounded down.`,
        ],
        source,
      ),
      uploadState: "Uploaded: deterministic seeded extraction",
    },
    terms: [
      term("rightsRatio", "Rights ratio", "1 for 5", 2, "“One new share for every five existing shares.”", "Needs review", 0.96),
      term("subscriptionPrice", "Subscription price", "EUR 8.50", 2, "“Eligible holders may subscribe at a price of EUR 8.50 per new share.”", "Needs review", 0.99),
      term("recordDate", "Record date", shortDate(seedTimeline.rights.record), 1, `“Record Date: ${longDate(seedTimeline.rights.record)}.”`, "Needs review", 0.97),
      term("marketDeadline", "Market deadline", `${shortDate(seedTimeline.rights.market)} · 10:00 CEST`, 3, `“Instructions must be received by ${longDate(seedTimeline.rights.market)} at 10:00 CEST.”`, "Needs review", 0.94),
      term("defaultOption", "Default option", "Lapse", 3, "“Rights lapse if no instruction is received.”", "Needs review", 0.92),
    ],
    positions: [
      position("POS-VRN-1", "European Opportunities Fund", "CUST-6632", "FR001400VRN5", 100000, isoDate(seedTimeline.rights.record)),
      position("POS-VRN-2", "Sustainable Growth Fund", "CUST-7741", "FR001400VRN5", 50000, isoDate(seedTimeline.rights.record)),
      position("POS-VRN-X1", "European Opportunities Fund", "CUST-6633", "FR001400VRN8", 40000, isoDate(seedTimeline.rights.record), "Not matched", "Same issuer but different ISIN"),
      position("POS-VRN-X2", "Closed Strategy Fund", "CUST-0000", "FR001400VRN5", 10000, isoDate(seedTimeline.rights.latePosition), "Excluded", "Position date after record date; account closed"),
      position("POS-VRN-X3", "Sustainable Growth Fund", "CUST-7742", "FR001400VRN5", 0, isoDate(seedTimeline.rights.record), "Excluded", "Zero position"),
    ],
    historicalRows: [],
    options: [
      { id: "exercise", label: "Exercise rights", description: "Subscribe for new shares using all or part of the eligible entitlement.", result: "Cash funding is required.", default: false, fundingFormula: "Quantity elected × EUR 8.50" },
      { id: "sell", label: "Sell rights", description: "Submit the rights for sale; no subscription funding is required.", result: "Sale proceeds depend on market execution.", default: false, fundingFormula: "No funding" },
      { id: "lapse", label: "Allow rights to lapse", description: "Take no action; rights expire at the deadline.", result: "No funding; potential value loss.", default: true, fundingFormula: "No funding" },
    ],
    instruction: { status: "DRAFT", destination: "Synthetic Euroclear gateway", reference: "DRAFT-VRN-0821", generatedAt: "", content: "DRAFT ONLY - generated after independent reviewer approval.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Settlement follows an approved election.", expectedCash: 0, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "EUR", actualCurrency: "EUR", expectedSettlementDate: isoDate(seedTimeline.rights.settlement), actualSettlementDate: "", expectedAccount: "Multiple accounts", actualAccount: "", investigationSteps: [] },
    tasks: [task("task-vrn-1", eventId, "CA-2026-0821-VR", "Check notice terms", "Rohan Iyer", "Today · 12:00 CEST", "High", "Term check", "Review all extracted terms against the uploaded notice.", "Open", "", "CA-CONTROL-001")],
    audit: [audit(eventId, "Notice uploaded", `${documentName} accepted as a synthetic notice; deterministic extraction prepared for analyst review.`, actor.name, "Received", { evidenceId: "DOC-VRN-01", actorId: actor.id, actorRole: actor.role })],
  });
}

export type WorkflowActor = {
  id: string;
  name: string;
  role: "Fund Manager" | "Compliance";
};

export function appendAudit(event: EventData, action: string, detail: string, actor: WorkflowActor | string = "System", extras: Record<string, string> = {}): void {
  const actorName = typeof actor === "string" ? actor : actor.name;
  const actorExtras = typeof actor === "string" ? extras : { ...extras, actorId: actor.id, actorRole: actor.role };
  event.audit = [audit(event.id, action, detail, actorName, event.status, actorExtras), ...(event.audit ?? [])];
}

function numeric(value: string): number {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function ratio(value: string): [number, number] | null {
  const matches = value.match(/(\d+(?:\.\d+)?)\s*(?:for|:|\/)\s*(\d+(?:\.\d+)?)/i);
  return matches ? [Number(matches[1]), Number(matches[2])] : null;
}

export function syncCalculationInput(event: EventData, key: string, value: string): void {
  event.calculationInputs ??= {};
  if (["rightsRatio", "bonusRatio", "splitRatio"].includes(key)) {
    const parsed = ratio(value);
    if (!parsed || parsed[0] <= 0 || parsed[1] <= 0) throw new Error(`${key} must use a positive ratio such as “1 for 5”.`);
    if (key === "splitRatio") event.calculationInputs.splitFactor = parsed[0] / parsed[1];
    else {
      event.calculationInputs.ratioNumerator = parsed[0];
      event.calculationInputs.ratioDenominator = parsed[1];
    }
  }
  const valueMap: Record<string, string> = { subscriptionPrice: "subscriptionPrice", rate: "rate", offerPrice: "offerPrice", cashRate: "cashRate", shareExchangeRatio: "shareExchangeRatio", maximumAcceptance: "maximumPercentage" };
  if (valueMap[key]) {
    const parsed = numeric(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${key} must contain a valid non-negative number.`);
    event.calculationInputs[valueMap[key]] = key === "maximumAcceptance" && parsed > 1 ? parsed / 100 : parsed;
  }
  if (key === "withholding") {
    if (/not applicable|s\.?\s*196/i.test(value)) {
      event.calculationInputs.withholdingRate = 0;
      return;
    }
    const parsed = numeric(value);
    const withholdingRate = value.includes("%") ? parsed / 100 : parsed;
    if (!Number.isFinite(withholdingRate) || withholdingRate < 0 || withholdingRate > 1) {
      throw new Error("withholding must be a rate between 0 and 1, or a percentage such as 15%.");
    }
    event.calculationInputs.withholdingRate = withholdingRate;
  }
  if (["recordDate", "paymentDate", "settlementDate", "marketDeadline"].includes(key)) {
    const normalized = value.replace(/·/g, " ").replace(/\s+/g, " ").replace(/\s+[A-Z]{2,5}\s*$/i, "").trim();
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) throw new Error(`${key} must contain a valid date or date-time.`);
    if (key === "recordDate") event.calculationInputs.recordDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
}

export function missingRequiredTerms(event: EventData): string[] {
  return (event.requiredTermKeys ?? []).filter((key: string) => {
    const found = event.terms?.find((candidate: any) => candidate.key === key);
    return !found || !found.value?.trim() || found.reviewStatus !== "Validated";
  });
}

export function refreshValidation(event: EventData): void {
  const missingTerms = missingRequiredTerms(event);
  event.validation = { missingTerms, isReady: missingTerms.length === 0 };
  refreshSchemeImpacts(event);
  Object.assign(event, deriveEventSignals(event));
}

export function applyTermUpdates(event: EventData, updates: any[], actor: any, reason: string): void {
  if (actor.role !== "Fund Manager") throw new Error("Only the Fund Manager can update a corporate action.");
  for (const update of updates) {
    const current = event.terms?.find((candidate: any) => candidate.key === update.key);
    if (!current) throw new Error(`Unknown extracted term: ${update.key}`);
    const oldValue = current.value;
    const changed = oldValue !== update.value;
    const correctionReason = update.reason ?? reason ?? "";
    if (changed && !correctionReason.trim()) throw new Error(`A correction reason is required for ${current.label}.`);
    current.value = update.value;
    current.reviewStatus = "Validated";
    current.sourceType = changed ? "Manually corrected" : "AI extracted / analyst validated";
    current.manuallyCorrected = changed;
    current.oldValue = changed ? oldValue : "";
    current.correctionReason = changed ? correctionReason : "";
    syncCalculationInput(event, update.key, update.value);
    appendAudit(event, changed ? "Extracted term corrected" : "Extracted term validated", `${current.label} ${changed ? "corrected" : "validated"} against source evidence.`, actor, { previousValue: oldValue, newValue: update.value, reason: correctionReason, evidenceId: `EVD-${event.id}-${update.key}` });
  }
  refreshValidation(event);
  event.status = event.validation.isReady ? "Validated" : "Under review";
  event.settlementStage = event.status;
}

function eligiblePositions(event: EventData): any[] {
  const expectedIsin = event.securityMaster?.isin;
  const recordDate = event.calculationInputs?.recordDate;
  return (event.positions ?? []).filter((item: any) => {
    const accountClosed = /closed|inactive/i.test(item.accountStatus ?? "") || /account closed/i.test(item.dataQualityWarning ?? "");
    const afterRecordDate = item.positionDate > recordDate;
    return item.eligibilityStatus === "Eligible"
      && item.eligibleQuantity > 0
      && (!expectedIsin || item.isin === expectedIsin)
      && !afterRecordDate
      && !accountClosed;
  });
}

export function calculateEventImpacts(event: EventData, actor: any): void {
  if (actor.role !== "Fund Manager") throw new Error("Only the Fund Manager can refresh a corporate action.");
  if (event.schemeImpacts?.some((impact: any) => impact.electionDecision)) throw new Error("Calculation cannot be re-run after elections are submitted. Return the event for analyst review first.");
  if (["Approved", "Awaiting settlement", "Reconciled", "Break identified", "Closed"].includes(event.status)) throw new Error(`Calculation cannot be re-run while the event is ${event.status}.`);
  refreshValidation(event);
  if (!event.validation.isReady) throw new Error(`Calculation is blocked until these terms are validated: ${event.validation.missingTerms.join(", ")}.`);

  const inputs = event.calculationInputs ?? {};
  event.cashDirection = eventCashDirection(event.eventType);
  if (typeof inputs.recordDate !== "string" || !inputs.recordDate.trim()) {
    throw new Error("Calculation is blocked because the record date is required to determine eligibility.");
  }
  const positions = eligiblePositions(event);
  if (positions.length === 0) throw new Error("Calculation is blocked because no eligible positions were found.");

  const requireTermValue = (key: string, label: string): string => {
    const matched = event.terms?.find((term: any) => term.key === key);
    if (!matched?.value) throw new Error(`Calculation is blocked because the ${label} term ("${key}") is missing from this ${event.eventType} event. Capture and validate it before calculating.`);
    return matched.value;
  };
  const requireInput = (key: string, label: string): number => {
    const value = (inputs as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Calculation is blocked because the ${label} input ("${key}") is missing for this ${event.eventType} event. Validate the term so the calculation input is populated.`);
    return value;
  };

  const calculatedSchemeImpacts = positions.map((item: any) => {
    const common = {
      id: `imp-${event.id}-${item.account}`,
      fund: item.fund,
      account: item.account,
      eligibleQuantity: item.eligibleQuantity,
      positionDate: item.positionDate,
      securityId: item.securityId,
      eligibilityStatus: item.eligibilityStatus,
      dataQualityWarning: item.dataQualityWarning,
      election: null,
      approval: event.processingType === "Mandatory" ? "Not required" : "Pending",
      status: "Calculated",
        cashDirection: eventCashDirection(event.eventType),
    };

    if (event.eventType === "Cash dividend") {
      const rateTermValue = requireTermValue("rate", "cash rate");
      const rate = requireInput("rate", "cash rate");
      const withholdingRate = requireInput("withholdingRate", "withholding rate");
      if (withholdingRate < 0 || withholdingRate > 1) throw new Error("Calculation is blocked because the withholding rate must be between 0 and 1.");
      const currency = inputs.currency ?? event.currency;
      const { grossCash, withholdingAmount, netCash } = calculateDividendWithholding(
        item.eligibleQuantity,
        rate,
        withholdingRate,
        inputs.cashDecimals ?? 2,
      );
      const withholdingPercent = withholdingRate * 100;
      const formula = `${item.eligibleQuantity.toLocaleString()} × ${rateTermValue} = ${currency} ${grossCash.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}; withholding ${withholdingPercent.toLocaleString("en-GB", { maximumFractionDigits: 4 })}% = ${currency} ${withholdingAmount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}; net = ${currency} ${netCash.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return { ...common, formula, expected: netCash, expectedCash: netCash, grossCash, withholdingRate, withholdingAmount, netCash, expectedSecurityQuantity: 0, securityMovement: "Net cash receipt after withholding", currency };
    }
    if (event.eventType === "Stock split") {
      const splitFactor = requireInput("splitFactor", "split factor");
      const expectedSecurityQuantity = calculateSplit(item.eligibleQuantity, splitFactor, 1);
      return { ...common, formula: `${item.eligibleQuantity.toLocaleString()} × ${splitFactor}`, expected: expectedSecurityQuantity, expectedCash: 0, expectedSecurityQuantity, securityMovement: `${expectedSecurityQuantity - item.eligibleQuantity} additional shares`, currency: "INR", unit: "Shares" };
    }
    if (event.eventType === "Bonus issue") {
      const ratioNumerator = requireInput("ratioNumerator", "bonus ratio numerator");
      const ratioDenominator = requireInput("ratioDenominator", "bonus ratio denominator");
      const expectedSecurityQuantity = calculateSplit(item.eligibleQuantity, ratioNumerator, ratioDenominator);
      return { ...common, formula: `floor(${item.eligibleQuantity.toLocaleString()} × ${ratioNumerator} ÷ ${ratioDenominator})`, expected: expectedSecurityQuantity, expectedCash: 0, expectedSecurityQuantity, securityMovement: `${expectedSecurityQuantity} bonus shares`, currency: "INR", unit: "Shares" };
    }
    if (event.eventType === "Rights issue") {
      const ratioNumerator = requireInput("ratioNumerator", "rights ratio numerator");
      const ratioDenominator = requireInput("ratioDenominator", "rights ratio denominator");
      const subscriptionPrice = requireInput("subscriptionPrice", "subscription price");
      const rightsCalculation = calculateRights(
        item.eligibleQuantity,
        ratioNumerator,
        ratioDenominator,
        subscriptionPrice,
      );
      const entitlement = rightsCalculation.rights;
      const expectedCash = rightsCalculation.funding;
      return { ...common, formula: `floor(${item.eligibleQuantity.toLocaleString()} × ${ratioNumerator} ÷ ${ratioDenominator}) × INR ${subscriptionPrice.toFixed(2)}`, expected: expectedCash, expectedCash, cashDirection: "Payable", expectedSecurityQuantity: entitlement, securityMovement: `${entitlement.toLocaleString()} subscription rights`, currency: inputs.currency ?? "INR", entitlement };
    }
    if (event.eventType === "Tender offer") {
      const maximumPercentage = requireInput("maximumPercentage", "maximum acceptance percentage");
      const offerPrice = requireInput("offerPrice", "offer price");
      const tenderable = Math.floor(item.eligibleQuantity * maximumPercentage);
      const expectedCash = calculateTender(item.eligibleQuantity, maximumPercentage, offerPrice);
      return { ...common, formula: `${tenderable.toLocaleString()} × INR ${offerPrice.toFixed(2)}`, expected: expectedCash, expectedCash, expectedSecurityQuantity: 0, securityMovement: `Tender up to ${tenderable.toLocaleString()} shares`, currency: "INR", entitlement: tenderable };
    }
    if (event.eventType === "Merger / demerger") {
      const shareExchangeRatio = requireInput("shareExchangeRatio", "share exchange ratio");
      const cashRate = requireInput("cashRate", "cash consideration rate");
      const mergerCalculation = calculateMixedMerger(
        item.eligibleQuantity,
        shareExchangeRatio,
        cashRate,
      );
      const securityQuantity = Math.floor(mergerCalculation.shares);
      const fractional = roundCalculation(mergerCalculation.shares - securityQuantity, 3);
      const expectedCash = roundCalculation(mergerCalculation.cash + fractional * 3, 2);
      return { ...common, formula: `(${item.eligibleQuantity.toLocaleString()} × INR ${cashRate.toFixed(2)})`, expected: mergerCalculation.cash, expectedCash: mergerCalculation.cash, expectedSecurityQuantity: securityQuantity, securityMovement: `${securityQuantity.toLocaleString()} successor shares; fractional entitlement lapses`, currency: "INR", unit: "Shares" };
    }
    throw new Error(`Calculation is not supported for event type "${event.eventType}". Supported event types: Cash dividend, Stock split, Stock dividend / bonus issue, Rights issue, Tender offer, Merger / acquisition.`);
  });

  event.schemeImpacts = buildSchemeImpacts(event).map((schemeImpact: EventData) => {
    const calculated = calculatedSchemeImpacts.find((candidate: EventData) => candidate.account === schemeImpact.account);
    if (!calculated) return schemeImpact;
    return {
      ...schemeImpact,
      ...calculated,
      id: schemeImpact.id,
      schemeId: schemeImpact.schemeId,
      schemeName: schemeImpact.schemeName,
      affected: true,
      direction: calculated.cashDirection === "Payable" ? "Funding" : calculated.expectedCash > 0 ? "Receivable" : "Neutral",
      cashAmount: calculated.expectedCash ?? 0,
      quantityResult: calculated.expectedSecurityQuantity ?? null,
    };
  });
  event.affectedAccounts = event.schemeImpacts.filter((impact: EventData) => impact.affected).length;
  event.amount = sumMoneyPaise(event.schemeImpacts, "expectedCash") || event.schemeImpacts.reduce((total: number, item: any) => total + Number(item.expectedSecurityQuantity ?? 0), 0);
  if (event.eventType === "Cash dividend") {
    const expectedGrossCash = sumMoneyPaise(event.schemeImpacts, "grossCash");
    const expectedWithholdingAmount = sumMoneyPaise(event.schemeImpacts, "withholdingAmount");
    const expectedNetCash = sumMoneyPaise(event.schemeImpacts, "netCash");
    Object.assign(event.reconciliation, {
      expected: expectedNetCash,
      expectedCash: expectedNetCash,
      expectedGrossCash,
      expectedWithholdingAmount,
      expectedNetCash,
    });
  }
  event.currency = "INR";
  if (event.eventType === "Stock split" || event.eventType === "Bonus issue") event.unit = "Shares";
  event.calculation.calculationRunAt = now();
  event.calculation.assumptions = `${event.calculation.assumptions} ${positions.length} eligible positions matched by ISIN and record date.`;
  event.status = event.processingType === "Mandatory" ? "Awaiting settlement" : "Election required";
  event.settlementStage = event.status;
  appendAudit(event, "Impact calculation run", `Deterministic calculation completed for ${positions.length} eligible positions.`, actor, { previousValue: "Validated", newValue: event.status, reason: event.calculation.rounding });
}

export function recordElection(event: EventData, body: any, actor: any): void {
  if (event.isEarlySighting) throw new Error(event.decisionBlockedReason || "An early sighting cannot progress to a decision.");
  if (actor.role !== "Fund Manager") throw new Error("Only the Fund Manager can submit a decision.");
  if (event.processingType === "Mandatory") throw new Error("Mandatory events do not have an election workflow.");
  if (!["Election required", "Awaiting approval"].includes(event.status)) throw new Error(`Election cannot be saved while the event is ${event.status}.`);
  const impact = event.schemeImpacts?.find((candidate: any) => candidate.id === body.impactId);
  const option = event.options?.find((candidate: any) => candidate.id === body.optionId);
  if (!impact || !option) throw new Error("Impact or election option is invalid.");
  const maximum = Number(impact.entitlement ?? impact.eligibleQuantity);
  if (!Number.isFinite(body.quantityElected) || body.quantityElected < 0 || body.quantityElected > maximum) throw new Error(`Election quantity must be between 0 and ${maximum.toLocaleString()}.`);
  const funding = option.id === "exercise" ? paiseToRupees(BigInt(body.quantityElected) * rupeesToPaise(Number(event.calculationInputs.subscriptionPrice ?? 0))) : 0;
  impact.election = option.id;
  impact.electionDecision = { optionId: option.id, optionLabel: option.label, quantityElected: body.quantityElected, requiredFunding: funding, analystId: actor.id, analyst: actor.name, comment: body.comment ?? "", status: "Submitted" };
  impact.status = "Election submitted";
  impact.approval = "Pending";
  event.reconciliation.expectedCash = sumMoneyPaise(event.schemeImpacts.map((current: any) => ({ funding: current.electionDecision?.requiredFunding ?? 0 })), "funding");
  event.reconciliation.expected = event.reconciliation.expectedCash;
  event.reconciliation.expectedSecurityQuantity = event.schemeImpacts.reduce((total: number, current: any) => total + (current.election === "exercise" ? Number(current.electionDecision?.quantityElected ?? 0) : 0), 0);
  event.reconciliation.note = "Expected settlement is derived from the recorded election quantities and funding.";
  event.status = event.schemeImpacts.filter((candidate: any) => candidate.affected).every((candidate: any) => candidate.election) ? "Awaiting approval" : "Election required";
  event.settlementStage = event.status;
  for (const currentTask of event.tasks ?? []) if (currentTask.category === "Election") currentTask.status = "Resolved";
  appendAudit(event, "Election submitted", `${impact.account} selected ${option.label} for ${body.quantityElected.toLocaleString()} entitlement units.`, actor, { previousValue: "", newValue: option.label, reason: body.comment ?? "" });
}

export function approveControlledEvent(event: EventData, approved: boolean, note: string, actor: any): void {
  if (event.isEarlySighting) throw new Error(event.decisionBlockedReason || "An early sighting cannot be approved.");
  if (actor.role !== "Compliance") throw new Error("Only Compliance can approve or return a decision.");
  if (event.processingType !== "Mandatory" && event.status !== "Awaiting approval") throw new Error(`Approval is blocked while the event is ${event.status}.`);
  if (approved) {
    const makerActions = new Set(["Election submitted", "Extracted term corrected", "Extracted term validated"]);
    const makerConflict = (event.audit ?? []).some((entry: any) => makerActions.has(entry.action) && entry.actorId === actor.id)
      || event.schemeImpacts.some((impact: any) => impact.electionDecision?.analystId === actor.id);
    if (makerConflict) throw new Error("Maker-checker control failed: the person who prepared an election cannot approve it.");
  }
  event.schemeImpacts.forEach((impact: any) => {
    impact.approval = approved ? "Approved" : "Returned";
    if (impact.electionDecision) impact.electionDecision.status = approved ? "Approved" : "Returned";
  });
  event.status = approved ? "Approved" : "Election required";
  event.settlementStage = event.status;
  appendAudit(event, approved ? "Checker approval recorded" : "Checker returned event", note, actor, { previousValue: "Awaiting approval", newValue: event.status, reason: note });
}

export function simulateInstruction(event: EventData, status: string, actor: any): void {
  if (event.isEarlySighting) throw new Error(event.decisionBlockedReason || "An instruction cannot be produced from an early sighting.");
  if (actor.role !== "Fund Manager") throw new Error("Only the Fund Manager can prepare a simulated instruction.");
  if (event.processingType === "Mandatory") throw new Error("Mandatory events do not require an outbound instruction; proceed directly to settlement monitoring.");
  const canIssue = event.status === "Approved";
  if (!canIssue) throw new Error(`Instruction is blocked while the event is ${event.status}. Approval and calculation controls must complete first.`);
  if (status !== "SIMULATED - NOT SENT") throw new Error("The POC only supports the explicit status SIMULATED - NOT SENT.");
  const electionLines = event.schemeImpacts.filter((impact: any) => impact.affected).map((impact: any) => `${impact.account}: ${impact.electionDecision?.optionLabel ?? "Mandatory processing"}; quantity ${impact.electionDecision?.quantityElected ?? impact.expectedSecurityQuantity ?? 0}`).join("\n");
  const affectedImpacts = event.schemeImpacts.filter((impact: any) => impact.affected);
  const expectedCash = affectedImpacts.reduce((total: number, impact: any) => total + Number(impact.expectedCash ?? impact.cashAmount ?? 0), 0);
  const expectedSecurityQuantity = affectedImpacts.reduce((total: number, impact: any) => total + Number(impact.expectedSecurityQuantity ?? 0), 0);
  const settlementAccounts = [...new Set(affectedImpacts.map((impact: any) => impact.account).filter(Boolean))];
  Object.assign(event.reconciliation, {
    expected: expectedCash || expectedSecurityQuantity,
    expectedCash,
    expectedSecurityQuantity,
    expectedCurrency: event.currency,
    actualCurrency: event.currency,
    expectedAccount: settlementAccounts.length === 1 ? settlementAccounts[0] : "Multiple accounts",
    status: "Not due",
    classification: "Not due",
    note: "Approved instruction prepared. Settlement receipt is now pending.",
  });
  event.instruction = {
    status,
    destination: "Synthetic custodian instruction gateway",
    reference: `SIM-${event.reference}`,
    generatedAt: now(),
    simulated: true,
    approvalActor: event.audit?.find((entry: any) => entry.action === "Checker approval recorded")?.actor ?? "",
    content: `SIMULATED - NOT SENT\nEvent: ${event.reference}\nSecurity: ${event.security}\nInternal deadline: ${event.internalDeadline}\n${electionLines}\nNo external market instruction has been sent.`,
  };
  event.status = "Awaiting settlement";
  event.settlementStage = event.status;
  appendAudit(event, "Simulated instruction created", "Structured draft instruction generated and marked SIMULATED - NOT SENT.", actor, { previousValue: "Approved", newValue: "Awaiting settlement" });
}

export function reconcileEvent(event: EventData, body: any, actor: any): void {
  if (actor.role !== "Fund Manager") throw new Error("Only the Fund Manager can record settlement results.");
  if (!["Awaiting settlement", "Break identified"].includes(event.status)) throw new Error(`Settlement reconciliation is blocked while the event is ${event.status}. The case must be ready for settlement first.`);
  const recon = event.reconciliation;
  const actualCash = body.actual;
  const actualSecurityQuantity = body.actualSecurityQuantity ?? recon.actualSecurityQuantity ?? 0;
  const actualCurrency = body.actualCurrency ?? recon.expectedCurrency;
  const actualAccount = body.actualAccount ?? recon.expectedAccount;
  const actualSettlementDate = body.actualSettlementDate ?? recon.expectedSettlementDate;
  const cashDifferencePaise = rupeesToPaise(actualCash) - rupeesToPaise(Number(recon.expectedCash ?? recon.expected));
  const cashDifference = paiseToRupees(cashDifferencePaise);
  const securityDifference = actualSecurityQuantity - Number(recon.expectedSecurityQuantity ?? 0);
  let classification = "Matched";
  if (actualCurrency !== recon.expectedCurrency) classification = "Wrong currency";
  else if (recon.expectedAccount !== "Multiple accounts" && actualAccount !== recon.expectedAccount) classification = "Wrong account";
  else if (actualCash === 0 && actualSecurityQuantity === 0) classification = "Missing";
  else if (cashDifferencePaise < -rupeesToPaise(recon.tolerance) || securityDifference < -recon.tolerance) classification = "Under-settled";
  else if (cashDifferencePaise > rupeesToPaise(recon.tolerance) || securityDifference > recon.tolerance) classification = "Over-settled";
  else if (actualSettlementDate !== recon.expectedSettlementDate) classification = "Partially matched";

  Object.assign(recon, {
    actual: actualCash,
    actualCash,
    actualSecurityQuantity,
    actualCurrency,
    actualAccount,
    actualSettlementDate,
    difference: Math.abs(securityDifference) > recon.tolerance ? securityDifference : cashDifference,
    status: classification,
    classification,
    note: body.note,
    investigationSteps: classification === "Matched"
      ? []
      : event.eventType === "Cash dividend"
        ? ["Verify the eligible quantity and record date.", "Confirm the announced gross dividend rate.", "Confirm the validated withholding rate and tax amount.", "Compare expected net cash with the custodian payment.", "Contact the synthetic custodian if the post-tax difference remains unexplained."]
        : ["Verify the eligible quantity and position date.", "Confirm the announced rate or ratio.", "Check currency, account, and settlement date.", "Check whether a separate transaction settled.", "Contact the synthetic custodian if unexplained."],
  });
  if (classification === "Matched") {
    event.status = "Reconciled";
  } else {
    event.status = "Break identified";
    const exists = event.tasks?.some((current: any) => current.category === "Reconciliation" && current.status === "Open");
    if (!exists) event.tasks.push(task(`task-${event.id}-break`, event.id, event.reference, "Investigate settlement difference", "Rohan Iyer", "Today · 16:00", "High", "Reconciliation", `${classification}: expected and actual settlement results differ.`, "Open", "", "CA-CONTROL-007"));
  }
  event.settlementStage = event.status;
  appendAudit(event, "Settlement reconciled", body.note, actor, { previousValue: "Awaiting settlement", newValue: event.status, reason: classification });
}

export async function ensureCorporateActionSeedData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const { corporateActionEventsTable, db } = await import("@workspace/db");
      // Demo walkthrough cases stay seeded so every pipeline stage is visible
      // in the product, alongside live captured cases. Existing rows are never
      // overwritten, so progress made on a demo case survives restarts.
      await db.insert(corporateActionEventsTable)
        .values(preloadedEvents.map((event) => ({ id: event.id, data: event })))
        .onConflictDoNothing();
    })().catch((error) => {
      seedPromise = undefined;
      throw error;
    });
  }
  await seedPromise;
}

export async function getCorporateActionEvents(): Promise<EventData[]> {
  await ensureCorporateActionSeedData();
  const { corporateActionEventsTable, db } = await import("@workspace/db");
  const rows = await db.select().from(corporateActionEventsTable).orderBy(desc(corporateActionEventsTable.updatedAt));
  return rows.map((row) => {
    const stored = row.data as EventData;
    const corrected = stored.id === "evt-near-miss"
      ? { ...stored, source: konkanPocScenario?.source, sourceRecords: konkanPocScenario?.sourceRecords, sourceAgreement: konkanPocScenario?.sourceAgreement }
      : stored;
    const event = INDIAN_EVENT_META[stored.id] ? resolveSeedEvent(corrected) : clone(corrected);
    refreshValidation(event);
    return event;
  });
}

export async function getCorporateActionEvent(id: string): Promise<EventData | null> {
  await ensureCorporateActionSeedData();
  const { corporateActionEventsTable, db } = await import("@workspace/db");
  const [row] = await db.select().from(corporateActionEventsTable).where(eq(corporateActionEventsTable.id, id));
  if (!row) return null;
  const stored = row.data as EventData;
  const corrected = stored.id === "evt-near-miss"
    ? { ...stored, source: konkanPocScenario?.source, sourceRecords: konkanPocScenario?.sourceRecords, sourceAgreement: konkanPocScenario?.sourceAgreement }
    : stored;
  const event = INDIAN_EVENT_META[stored.id] ? resolveSeedEvent(corrected) : clone(corrected);
  refreshValidation(event);
  return event;
}

export async function saveCorporateActionEvent(event: EventData): Promise<EventData> {
  const { corporateActionEventsTable, db } = await import("@workspace/db");
  await db.update(corporateActionEventsTable).set({ data: event }).where(eq(corporateActionEventsTable.id, event.id));
  return clone(event);
}

const sampleEventIds: Record<string, string> = {
  "cash-dividend": "evt-aurora-review",
  "rights-issue": "evt-verdant-rights",
  "stock-split": "evt-delta-split",
  "bonus-issue": "evt-nimbus-bonus",
  "tender-offer": "evt-meridian-tender",
  merger: "evt-verdant-merger",
};

function sampleCaseFromSeed(sampleId: string, fileName: string, source: string, actor: WorkflowActor): EventData {
  if (sampleId === "rights-issue") return heroRightsEvent(fileName, source, actor);

  const sourceEventId = sampleEventIds[sampleId];
  const sourceEvent = preloadedEvents.find((candidate) => candidate.id === sourceEventId);
  if (!sourceEvent) throw new Error("Choose one of the supplied synthetic sample notices.");

  const eventId = `evt-${sampleId}-${Date.now()}`;
  const event = clone(sourceEvent);
  event.id = eventId;
  event.reference = `${sourceEvent.reference}-DEMO`;
  event.noticeReference = event.reference;
  event.isHero = false;
  event.notice = {
    ...event.notice,
    documentName: fileName,
    source,
    receivedAt: now(),
    uploadState: "Synthetic sample selected for review",
  };
  event.tasks = (event.tasks ?? []).map((current: any, index: number) => ({
    ...current,
    id: `${current.id}-${Date.now()}-${index}`,
    eventId,
    eventReference: event.reference,
    status: current.status === "Resolved" ? "Resolved" : "Open",
  }));
  event.audit = [
    audit(
      eventId,
      "Sample notice processed",
      `${event.notice.documentName} selected from the synthetic sample library and opened for analyst review.`,
      actor.name,
      event.status,
      { actorId: actor.id, actorRole: actor.role, evidenceId: event.notice.sourceDocumentId },
    ),
  ];
  return event;
}

export async function createIntakeEvent(sampleId: string, fileName: string, source: string, actor: WorkflowActor): Promise<EventData> {
  await ensureCorporateActionSeedData();
  const event = sampleCaseFromSeed(sampleId, fileName, source, actor);
  refreshValidation(event);
  const { corporateActionEventsTable, db } = await import("@workspace/db");
  await db.insert(corporateActionEventsTable).values({ id: event.id, data: event });
  return clone(event);
}

export function toSummary(event: EventData): EventData {
  const { notice, terms, options, instruction, reconciliation, tasks, audit, positions, calculation, validation, ...summary } = event;
  return { ...summary, ...deriveEventSignals(event) };
}

const isOpenEvent = (event: EventData) => !["Closed", "Reconciled"].includes(event.status);
export const EXPOSURE_HEADROOM_THRESHOLDS = { critical: 0.5, tight: 2 } as const;

function eventExposure(event: EventData, impact: EventData, scheme: EventData): EventData {
  const seed = ARKA_SCHEME_SEED.find((candidate) => candidate.id === scheme.id);
  const aumRupees = seed ? Number(seed.aumPaise) / 100 : Number(scheme.aumCrore ?? 0) * 10_000_000;
  const position = (event.positions ?? []).find((candidate: EventData) => candidate.fund === scheme.name);
  const quantity = Number(position?.eligibleQuantity ?? position?.settledQuantity ?? 0);
  const price = Number(event.referencePrice ?? event.calculationInputs?.offerPrice ?? event.calculationInputs?.subscriptionPrice ?? 100);
  const inferredCurrent = aumRupees > 0 ? quantity * price / aumRupees * 100 : 0;
  let inferredChange = 0;
  if (aumRupees > 0 && event.eventType === "Bonus issue") {
    inferredChange = Number(impact.quantityResult ?? 0) * price / aumRupees * 100;
  } else if (aumRupees > 0 && event.eventType === "Rights issue") {
    inferredChange = Number(impact.quantityResult ?? 0) * price / aumRupees * 100;
  }
  let currentPercent = Number((event.analysisCurrentExposurePercent ?? inferredCurrent).toFixed(2));
  let postEventPercent = Number((currentPercent + Number(event.analysisExposureChangePercent ?? inferredChange)).toFixed(2));
  if (event.eventType === "Rights issue" && event.referencePrice && aumRupees > 0) {
    const ratioNumerator = Number(event.calculationInputs?.ratioNumerator ?? 1);
    const ratioDenominator = Number(event.calculationInputs?.ratioDenominator ?? 1);
    const subscriptionPrice = Number(event.calculationInputs?.subscriptionPrice ?? event.referencePrice);
    const postPrice = event.id === "evt-bharat-rights"
      ? calculateArkaRightsTerms().terp
      : (event.referencePrice * ratioDenominator + subscriptionPrice * ratioNumerator) / (ratioDenominator + ratioNumerator);
    const exposure = calculateIssuerExposure({
      holdingQuantity: BigInt(quantity),
      actionQuantity: BigInt(Number(impact.quantityResult ?? 0)),
      aumPaise: BigInt(Math.round(aumRupees * 100)),
      currentPricePaise: BigInt(Math.round(event.referencePrice * 100)),
      postActionPricePaise: BigInt(Math.round(postPrice * 100)),
    });
    currentPercent = exposure.currentPercent;
    postEventPercent = exposure.postActionPercent;
  }
  return {
    eventId: event.id,
    issuer: event.issuer,
    mandatory: event.processingType.startsWith("Mandatory"),
    currentPercent,
    changePercent: Number((postEventPercent - currentPercent).toFixed(2)),
    postEventPercent,
  };
}

export function issuerExposuresForScheme(events: EventData[], scheme: EventData): EventData[] {
  const grouped = new Map<string, EventData[]>();
  for (const event of events.filter(isOpenEvent)) {
    const impact = (event.schemeImpacts ?? []).find((candidate: EventData) => candidate.schemeId === scheme.id && candidate.affected);
    if (!impact) continue;
    const rows = grouped.get(event.issuer) ?? [];
    rows.push(eventExposure(event, impact, scheme));
    grouped.set(event.issuer, rows);
  }
  return [...grouped.entries()].map(([issuer, rows]) => {
    const currentPercent = Math.max(...rows.map((row) => row.currentPercent));
    const postActionPercent = Number((currentPercent + rows.reduce((total, row) => total + row.changePercent, 0)).toFixed(2));
    const distanceToCapPercent = Number((10 - postActionPercent).toFixed(2));
    const status = postActionPercent > 10
      ? "Breach"
      : distanceToCapPercent < EXPOSURE_HEADROOM_THRESHOLDS.critical
        ? "Critical"
        : distanceToCapPercent < EXPOSURE_HEADROOM_THRESHOLDS.tight
          ? "Tight"
          : "OK";
    return {
      issuer,
      eventCount: rows.length,
      includesMandatory: rows.some((row) => row.mandatory),
      currentPercent,
      postActionPercent,
      capPercent: 10,
      distanceToCapPercent,
      status,
      breach: postActionPercent > 10,
      eventIds: rows.map((row) => row.eventId),
      combinedOnly: rows.length > 1 && postActionPercent > 10 && rows.every((row) => row.postEventPercent <= 10),
    };
  }).sort((left, right) => right.postActionPercent - left.postActionPercent);
}

export function issuerIdFor(issuer: string): string {
  return issuer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Market reference first, then the security master price. Action prices (offer, subscription)
// are last-resort fallbacks only, so a tender premium never revalues the whole house holding.
function issuerPriceRupees(event: EventData): number {
  const cmp = event.securityMaster?.cmp;
  return Number(event.referencePrice
    ?? (cmp != null ? Number(cmp) : undefined)
    ?? event.calculationInputs?.offerPrice
    ?? event.calculationInputs?.subscriptionPrice
    ?? 100);
}

const positionQuantity = (position: EventData) => Number(position?.eligibleQuantity ?? position?.settledQuantity ?? 0);

// A decision is needed when the event is open, elective, and not yet submitted or approved.
export function needsDecision(event: EventData): boolean {
  if (!isOpenEvent(event)) return false;
  if (event.isEarlySighting) return false;
  const elective = event.processingType === "Voluntary"
    || (String(event.processingType ?? "").startsWith("Mandatory") && event.processingType !== "Mandatory");
  if (!elective) return false;
  return !["Awaiting approval", "Approved", "Awaiting settlement"].includes(event.status);
}

// Value forfeited if every open voluntary rights entitlement lapses. Reuses Stage 1 rightValue for the desk event.
export function rightsLapseValue(event: EventData, desk: EventData): number {
  if (event.eventType !== "Rights issue" || event.processingType !== "Voluntary") return 0;
  if (event.id === "evt-bharat-rights") {
    return Number(desk.totals?.totalEntitlementRights ?? 0) * calculateArkaRightsTerms().rightValue;
  }
  const ratioNumerator = Number(event.calculationInputs?.ratioNumerator ?? 1);
  const ratioDenominator = Number(event.calculationInputs?.ratioDenominator ?? 1);
  const subscriptionPrice = Number(event.calculationInputs?.subscriptionPrice ?? 0);
  const referencePrice = Number(event.referencePrice ?? 0);
  if (!subscriptionPrice || !referencePrice) return 0;
  const terp = (referencePrice * ratioDenominator + subscriptionPrice * ratioNumerator) / (ratioDenominator + ratioNumerator);
  const entitlement = (event.positions ?? []).reduce((total: number, position: EventData) =>
    total + Math.floor(positionQuantity(position) * ratioNumerator / ratioDenominator), 0);
  return Math.max(0, entitlement * (terp - subscriptionPrice));
}

export function closedEventOutcome(event: EventData): EventData {
  const outcome = event.historicalOutcome ?? {};
  const capturedAmount = Number(outcome.capturedAmount ?? (event.schemeImpacts ?? []).filter((impact: EventData) => impact.affected && impact.direction === "Receivable").reduce((total: number, impact: EventData) => total + Number(impact.cashAmount ?? 0), 0));
  return {
    capturedAmount: Number(capturedAmount.toFixed(2)),
    forfeitedAmount: Number(Number(outcome.forfeitedAmount ?? 0).toFixed(2)),
    lapsed: Boolean(outcome.lapsed),
    // A lapsed entitlement means the deadline passed without an instruction, so it can
    // never count as a met deadline; otherwise the history would claim every deadline
    // was met while also reporting lapses and forfeited value.
    deadlineOutcome: outcome.deadlineMet === false || Boolean(outcome.lapsed) ? "Missed" : "Met",
    reconciliationStatus: event.reconciliation?.classification ?? event.reconciliation?.status ?? "Closed",
  };
}

export function buildHistory(events: EventData[]): EventData {
  const closedEvents = events.filter((event) => ["Closed", "Reconciled"].includes(event.status)).map((event) => {
    const outcome = closedEventOutcome(event);
    return {
      eventId: event.id,
      issuer: event.issuer,
      eventType: event.eventType,
      capturedAmount: Number(outcome.capturedAmount),
      forfeitedAmount: Number(outcome.forfeitedAmount),
      lapsed: Boolean(outcome.lapsed),
      deadlineOutcome: String(outcome.deadlineOutcome),
      reconciliationStatus: String(outcome.reconciliationStatus),
    };
  });
  return {
    capturedAmount: Number(closedEvents.reduce((total, event) => total + event.capturedAmount, 0).toFixed(2)),
    forfeitedAmount: Number(closedEvents.reduce((total, event) => total + event.forfeitedAmount, 0).toFixed(2)),
    lapsedCount: closedEvents.filter((event) => event.lapsed).length,
    deadlinesMet: closedEvents.filter((event) => event.deadlineOutcome === "Met").length,
    deadlinesTotal: closedEvents.length,
    closedEvents,
  };
}

// One computation for the issuer axis: exposure values reuse the same price/AUM bases as
// issuerExposuresForScheme, and cap headroom comes from that shared function directly.
function computeIssuers(events: EventData[], desk: EventData): EventData[] {
  const schemes: EventData[] = desk.schemes ?? [];
  const totalAumRupees = ARKA_SCHEME_SEED.reduce((total, scheme) => total + Number(scheme.aumPaise) / 100, 0);
  const exposuresByScheme = schemes.map((scheme) => ({ scheme, exposures: issuerExposuresForScheme(events, scheme) }));
  const byIssuer = new Map<string, EventData[]>();
  for (const event of events) {
    // Early sightings can arrive before the company name is parsed; they carry the
    // "Issuer pending confirmation" placeholder. Grouping those would fabricate an
    // issuer page with zero exposure and unrelated cases lined up as one holding,
    // so they stay on the events list only until a real issuer name is confirmed.
    if (!event.issuer || event.issuer === "Issuer pending confirmation") continue;
    const rows = byIssuer.get(event.issuer) ?? [];
    rows.push(event);
    byIssuer.set(event.issuer, rows);
  }
  return [...byIssuer.entries()].map(([issuer, issuerEvents]) => {
    const newestFirst = [...issuerEvents].sort((left, right) => Date.parse(right.receivedAt ?? "") - Date.parse(left.receivedAt ?? ""));
    const isin = newestFirst.find((event) => event.securityMaster?.isin)?.securityMaster.isin ?? "";
    const perScheme = schemes.flatMap((scheme) => {
      // The holding is one baseline per issuer and scheme; concurrent events list the same position,
      // so take the largest eligible quantity rather than summing duplicates.
      const held = issuerEvents.flatMap((event) => (event.positions ?? [])
        .filter((position: EventData) => position.fund === scheme.name)
        .map((position: EventData) => ({ event, position })));
      if (held.length === 0) return [];
      const best = held.reduce((left, right) => positionQuantity(right.position) > positionQuantity(left.position) ? right : left);
      const quantity = positionQuantity(best.position);
      // Seeded events may carry zero-quantity position rows for schemes that do not hold the
      // issuer at all; those are not holdings and must not count towards schemesHolding.
      if (quantity <= 0) return [];
      const seed = ARKA_SCHEME_SEED.find((candidate) => candidate.id === scheme.id);
      const aumRupees = seed ? Number(seed.aumPaise) / 100 : Number(scheme.aumCrore ?? 0) * 10_000_000;
      const valueAmount = Number((quantity * issuerPriceRupees(best.event)).toFixed(2));
      const exposureRow = exposuresByScheme.find((entry) => entry.scheme.id === scheme.id)?.exposures
        .find((row: EventData) => row.issuer === issuer);
      const percentOfNav = aumRupees > 0 ? Number((valueAmount / aumRupees * 100).toFixed(2)) : 0;
      return [{
        schemeId: scheme.id,
        schemeName: scheme.name,
        holdingQuantity: quantity,
        valueAmount,
        percentOfNav,
        // Headroom comes only from the shared exposure function; without an open exposure row
        // there is no cap figure to show, so it stays null rather than being recomputed here.
        headroomPercent: exposureRow ? Number(exposureRow.distanceToCapPercent) : null,
        sharedHeadroom: exposureRow ? Number(exposureRow.distanceToCapPercent) : null,
        exposureStatus: exposureRow?.status ?? null,
      }];
    }).sort((left, right) => right.percentOfNav - left.percentOfNav);
    const houseExposureAmount = Number(perScheme.reduce((total, row) => total + row.valueAmount, 0).toFixed(2));
    const constrained = perScheme.filter((row) => row.sharedHeadroom != null);
    const tightest = constrained.length > 0
      ? constrained.reduce((left, right) => (right.sharedHeadroom as number) < (left.sharedHeadroom as number) ? right : left)
      : null;
    const attention = tightest && ["Tight", "Critical", "Breach"].includes(String(tightest.exposureStatus))
      ? String(tightest.exposureStatus)
      : null;
    // Two different facts, never interchangeable: schemes HOLDING the issuer (non-zero
    // position) versus schemes AFFECTED by an open action (eligible impact). A scheme can
    // hold shares yet receive no entitlement, so affected is always <= holding.
    const holdingSchemeIds = new Set(perScheme.map((row) => String(row.schemeId)));
    const schemesAffected = new Set(issuerEvents.filter(isOpenEvent)
      .flatMap((event) => (event.schemeImpacts ?? [])
        .filter((impact: EventData) => impact.affected && holdingSchemeIds.has(String(impact.schemeId)))
        .map((impact: EventData) => String(impact.schemeId)))).size;
    return {
      issuerId: issuerIdFor(issuer),
      issuer,
      isin,
      houseExposureAmount,
      percentOfAum: totalAumRupees > 0 ? Number((houseExposureAmount / totalAumRupees * 100).toFixed(2)) : 0,
      schemesHolding: perScheme.length,
      schemesAffected,
      totalSchemeCount: schemes.length,
      openActionCount: issuerEvents.filter(isOpenEvent).length,
      tightestHeadroomPercent: tightest ? (tightest.sharedHeadroom as number) : null,
      tightestSchemeName: tightest?.schemeName ?? "",
      attention,
      perScheme,
      events: newestFirst,
    };
  }).sort((left, right) => right.houseExposureAmount - left.houseExposureAmount);
}

export function buildIssuerSummaries(events: EventData[], desk: EventData): EventData[] {
  return computeIssuers(events, desk).map((row) => ({
    issuerId: row.issuerId,
    issuer: row.issuer,
    isin: row.isin,
    houseExposureAmount: row.houseExposureAmount,
    percentOfAum: row.percentOfAum,
    schemesHolding: row.schemesHolding,
    schemesAffected: row.schemesAffected,
    openActionCount: row.openActionCount,
    tightestHeadroomPercent: row.tightestHeadroomPercent,
    attention: row.attention,
  }));
}

const QUARTER_MS = 90 * 24 * 60 * 60 * 1000;

export function buildIssuerDetail(events: EventData[], desk: EventData, issuerId: string, asOf = new Date()): EventData | null {
  const row = computeIssuers(events, desk).find((candidate) => candidate.issuerId === issuerId);
  if (!row) return null;
  const largest = row.perScheme[0];
  const eventRows = row.events.map((event: EventData) => {
    const open = isOpenEvent(event);
    const outcome = open ? null : closedEventOutcome(event);
    return {
      eventId: event.id,
      eventName: `${event.issuer} ${String(event.eventType ?? "").toLowerCase()}`,
      eventType: event.eventType,
      receivedAt: event.receivedAt ?? "",
      status: event.status,
      open,
      capturedAmount: outcome ? outcome.capturedAmount : null,
      forfeitedAmount: outcome ? outcome.forfeitedAmount : null,
    };
  });
  const quarterFloor = asOf.getTime() - QUARTER_MS;
  const inQuarter = row.events.filter((event: EventData) => {
    const received = Date.parse(event.receivedAt ?? "");
    return Number.isFinite(received) && received >= quarterFloor && received <= asOf.getTime();
  });
  const closedInQuarter = inQuarter.filter((event: EventData) => !isOpenEvent(event)).map(closedEventOutcome);
  const summary = {
    actionsLastQuarter: inQuarter.length,
    receivedAmount: Number(closedInQuarter.reduce((total: number, outcome: EventData) => total + outcome.capturedAmount, 0).toFixed(2)),
    forfeitedAmount: Number(closedInQuarter.reduce((total: number, outcome: EventData) => total + outcome.forfeitedAmount, 0).toFixed(2)),
    openDecisionCount: row.events.filter(needsDecision).length,
  };
  // The quarter timeline is the issuer page's core argument: everywhere else these
  // actions are unrelated rows, but here they line up against one holding in order,
  // so the cumulative effect (cash banked, shares added, decisions on the enlarged
  // base) is visible in one place.
  const inrShort = (amount: number) => amount >= 10_000_000 ? `₹${(amount / 10_000_000).toFixed(2)} cr` : `₹${(amount / 100_000).toFixed(2)} lakh`;
  const sharesText = (quantity: number) => quantity.toLocaleString("en-IN");
  const quarterTimeline = [...inQuarter]
    .sort((left: EventData, right: EventData) => Date.parse(left.receivedAt ?? "") - Date.parse(right.receivedAt ?? ""))
    .map((event: EventData) => {
      const quantity = Math.max(0, ...(event.positions ?? []).map((current: EventData) => positionQuantity(current)));
      const open = isOpenEvent(event);
      const ratioNumerator = Number(event.calculationInputs?.ratioNumerator ?? 1);
      const ratioDenominator = Number(event.calculationInputs?.ratioDenominator ?? 1);
      let effect = String(event.status ?? "");
      if (event.eventType === "Cash dividend") {
        effect = open
          ? `Dividend pending on ${sharesText(quantity)} shares.`
          : `${inrShort(closedEventOutcome(event).capturedAmount)} received in cash on ${sharesText(quantity)} shares. The holding itself did not change.`;
      } else if (event.eventType === "Bonus issue") {
        const delta = Math.floor(quantity * ratioNumerator / ratioDenominator);
        effect = open
          ? `${sharesText(delta)} free shares due (${ratioNumerator} for ${ratioDenominator}). The holding will grow from ${sharesText(quantity)} to ${sharesText(quantity + delta)} shares.`
          : `${sharesText(delta)} free shares credited (${ratioNumerator} for ${ratioDenominator}). The holding grew from ${sharesText(quantity)} to ${sharesText(quantity + delta)} shares.`;
      } else if (event.eventType === "Rights issue") {
        const entitlement = Math.floor(quantity * ratioNumerator / ratioDenominator);
        const cost = entitlement * Number(event.calculationInputs?.subscriptionPrice ?? 0);
        if (open) {
          effect = `Decision open: subscribe ${sharesText(entitlement)} new shares for ${inrShort(cost)}, or sell the entitlement. The entitlement is calculated on the current holding of ${sharesText(quantity)} shares.`;
        } else {
          const outcome = closedEventOutcome(event);
          effect = outcome.forfeitedAmount > 0
            ? `The entitlement lapsed. ${inrShort(outcome.forfeitedAmount)} of value was forfeited.`
            : outcome.capturedAmount > 0
              ? `${inrShort(outcome.capturedAmount)} realised from the entitlement.`
              : "The rights entitlement closed with no cash effect.";
        }
      }
      return {
        eventId: event.id,
        eventType: event.eventType,
        receivedAt: event.receivedAt ?? "",
        status: event.status,
        open,
        decisionRequired: needsDecision(event),
        holdingQuantity: quantity,
        effect,
      };
    });
  const cumulativeNote = quarterTimeline.length >= 2
    ? `Every other screen shows these as ${quarterTimeline.length} separate cases. Lined up in order they act on one holding: it started the quarter at ${sharesText(quarterTimeline[0].holdingQuantity)} shares, and each later action was calculated on the result of the earlier ones.`
    : "";
  const crore = (amount: number) => `₹${(amount / 10_000_000).toFixed(2)} cr`;
  const affectedPhrase = row.openActionCount === 0
    ? ""
    : row.schemesAffected === 0
      ? " None of them is affected by the open actions."
      : ` ${row.schemesAffected} of them ${row.schemesAffected === 1 ? "is" : "are"} affected by the open actions.`;
  const parts = [`Arka holds ${crore(row.houseExposureAmount)} of ${row.issuer} across ${row.schemesHolding} of ${row.totalSchemeCount} schemes, ${row.percentOfAum.toFixed(2)}% of house AUM.${affectedPhrase}`];
  if (row.attention === "Breach") {
    parts.push(`${row.tightestSchemeName} breaches the SEBI single-issuer cap if the open actions complete in full.`);
  } else if (row.attention) {
    parts.push(`${row.tightestSchemeName} is ${Number(row.tightestHeadroomPercent).toFixed(2)}% from the SEBI single-issuer cap.`);
  } else if (row.openActionCount > 0) {
    parts.push(`${row.openActionCount} corporate action${row.openActionCount === 1 ? " is" : "s are"} open; none push a scheme near the cap.`);
  } else {
    parts.push("Nothing from this issuer needs a decision right now.");
  }
  return {
    issuerId: row.issuerId,
    issuer: row.issuer,
    isin: row.isin,
    situation: parts.join(" "),
    houseExposure: {
      totalAmount: row.houseExposureAmount,
      percentOfAum: row.percentOfAum,
      schemeCount: row.schemesHolding,
      affectedSchemeCount: row.schemesAffected,
      totalSchemeCount: row.totalSchemeCount,
      largestSchemeName: largest?.schemeName ?? "",
      largestSchemeAmount: largest?.valueAmount ?? 0,
    },
    perScheme: row.perScheme.map((scheme: EventData) => ({
      schemeId: scheme.schemeId,
      schemeName: scheme.schemeName,
      holdingQuantity: scheme.holdingQuantity,
      valueAmount: scheme.valueAmount,
      percentOfNav: scheme.percentOfNav,
      headroomPercent: scheme.headroomPercent,
    })),
    events: eventRows,
    summary,
    quarterTimeline,
    cumulativeNote,
  };
}

export function buildSchemeSummaries(events: EventData[], desk: EventData): EventData[] {
  return desk.schemes.map((scheme: EventData) => {
    const impacts = events.flatMap((event) => (event.schemeImpacts ?? []).map((impact: EventData) => ({ event, impact })))
      .filter(({ impact }) => impact.schemeId === scheme.id && impact.affected);
    const open = impacts.filter(({ event }) => !["Closed", "Reconciled"].includes(event.status));
    const fundingNeeded = open.filter(({ impact }) => impact.direction === "Funding")
      .reduce((total, { impact }) => total + Number(impact.cashAmount ?? 0), 0);
    const seedScheme = ARKA_SCHEME_SEED.find((candidate) => candidate.id === scheme.id);
    const cashAvailable = seedScheme?.treasuryCashPaise != null
      ? Number(seedScheme.treasuryCashPaise) / 100
      : Number(scheme.cashAvailableCrore ?? 0) * 10_000_000;
    const exposure = issuerExposuresForScheme(events, scheme)[0];
    const closest = [...open].sort((left, right) => Date.parse(left.event.internalDeadlineAt) - Date.parse(right.event.internalDeadlineAt))[0]?.event;
    return {
      id: scheme.id,
      name: scheme.name,
      category: scheme.category,
      aumCrore: Number(scheme.aumCrore ?? 0),
      navRupees: Number((Number(scheme.navPaise ?? 0) / 100).toFixed(2)),
      holdingCount: ARKA_SCHEME_HOLDING_COUNTS[scheme.id] ?? 0,
      openActions: open.map(({ event, impact }) => ({ eventId: event.id, issuer: event.issuer, eventType: event.eventType, materialityPaise: Number(impact.navImpactPaise ?? 0) }))
        .sort((left, right) => right.materialityPaise - left.materialityPaise),
      totalNavImpactPaise: Number(open.reduce((total, { impact }) => total + Number(impact.navImpactPaise ?? 0), 0).toFixed(2)),
      fundingNeeded: Number(fundingNeeded.toFixed(2)),
      cashAvailable,
      shortfall: Math.max(0, Number((fundingNeeded - cashAvailable).toFixed(2))),
      closestDeadline: closest?.internalDeadline ?? "",
      largestExposureIssuer: exposure?.issuer ?? "",
      largestExposureEventId: exposure?.eventIds?.[0] ?? "",
      largestExposureEventName: exposure ? `${exposure.issuer} ${open.find(({ event }) => event.id === exposure.eventIds[0])?.event.eventType.toLowerCase() ?? ""}` : "",
      largestExposurePercent: exposure?.postActionPercent ?? 0,
      distanceToLimitPercent: exposure?.distanceToCapPercent ?? 10,
      // The scheme-level cash flag must agree with the row's own numbers: it is set
      // exactly when total funding needed exceeds total cash available. Per-decision
      // cash budget constraints stay on the decision desk where they apply, so an
      // impact-level "Cash short" never leaks up beside a fully funded row.
      flag: exposure?.combinedOnly
        ? "Combined issuer breach"
        : fundingNeeded > cashAvailable
          ? "Cash short"
          : open.map(({ impact }) => impact.flag).find((flag) => flag && flag !== "Cash short") ?? null,
    };
  }).sort((left: EventData, right: EventData) => right.totalNavImpactPaise - left.totalNavImpactPaise || right.openActions.length - left.openActions.length);
}

export function buildAnalysis(events: EventData[], desk: EventData, asOf = new Date()): EventData {
  const schemes = desk.schemes.map((scheme: EventData) => {
    const openImpacts = events.filter(isOpenEvent).flatMap((event) => {
      const impact = (event.schemeImpacts ?? []).find((candidate: EventData) => candidate.schemeId === scheme.id && candidate.affected);
      return impact ? [{ event, impact }] : [];
    });
    const fundingRows = openImpacts.filter(({ impact }) => impact.direction === "Funding");
    const aggregateFundingNeeded = fundingRows.reduce((total, { impact }) => total + Number(impact.cashAmount ?? 0), 0);
    const largestSingleEventFunding = Math.max(0, ...fundingRows.map(({ impact }) => Number(impact.cashAmount ?? 0)));
    const cashAvailable = scheme.cashAvailableCrore == null ? null : Number(scheme.cashAvailableCrore) * 10_000_000;
    const issuerExposures = issuerExposuresForScheme(events, scheme);
    return {
      schemeId: scheme.id,
      schemeName: scheme.name,
      openEventCount: openImpacts.length,
      aggregateFundingNeeded: Number(aggregateFundingNeeded.toFixed(2)),
      largestSingleEventFunding: Number(largestSingleEventFunding.toFixed(2)),
      cashAvailable,
      shortfall: cashAvailable == null ? null : Number(Math.max(0, aggregateFundingNeeded - cashAvailable).toFixed(2)),
      fundingStatus: cashAvailable == null ? "Unknown" : aggregateFundingNeeded > cashAvailable ? "Short" : "Covered",
      aggregateNavImpactPaise: Number(openImpacts.reduce((total, { impact }) => total + Number(impact.navImpactPaise ?? 0), 0).toFixed(2)),
      issuerExposures: issuerExposures.map(({ eventIds: _eventIds, combinedOnly: _combinedOnly, ...exposure }) => exposure),
      combinedOnlyBreaches: issuerExposures.filter((exposure) => exposure.combinedOnly).map((exposure) => ({
        issuer: exposure.issuer,
        eventIds: exposure.eventIds,
        postActionPercent: exposure.postActionPercent,
        capPercent: exposure.capPercent,
        excessPercent: Number((exposure.postActionPercent - exposure.capPercent).toFixed(2)),
      })),
    };
  }).sort((left: EventData, right: EventData) => {
    const severityRank: Record<string, number> = { Breach: 4, Critical: 3, Tight: 2, OK: 1 };
    const severity = (scheme: EventData) => Math.max(0, ...scheme.issuerExposures.map((exposure: EventData) => severityRank[exposure.status] ?? 0));
    return severity(right) - severity(left)
      || Number(right.shortfall ?? 0) - Number(left.shortfall ?? 0)
      || right.aggregateNavImpactPaise - left.aggregateNavImpactPaise;
  });

  const history = buildHistory(events);
  const breaches = schemes.flatMap((scheme: EventData) =>
    scheme.issuerExposures.filter((exposure: EventData) => exposure.postActionPercent > exposure.capPercent)
      .map((exposure: EventData) => ({ scheme, exposure })));
  const nearCap = schemes.flatMap((scheme: EventData) =>
    scheme.issuerExposures.filter((exposure: EventData) => exposure.postActionPercent <= exposure.capPercent && exposure.distanceToCapPercent < 2)
      .map((exposure: EventData) => ({ scheme, exposure })));
  const shortSchemes = schemes.filter((scheme: EventData) => Number(scheme.shortfall ?? 0) > 0);
  const conclusionParts: string[] = [];
  for (const { scheme, exposure } of breaches) {
    conclusionParts.push(`${scheme.schemeName} will breach the SEBI single-issuer cap on ${exposure.issuer} if the open actions complete in full: ${exposure.postActionPercent.toFixed(2)}% against a ${exposure.capPercent}% limit.`);
  }
  for (const { scheme, exposure } of nearCap) {
    conclusionParts.push(`${scheme.schemeName} is ${exposure.distanceToCapPercent.toFixed(2)}% from the cap on ${exposure.issuer}${exposure.includesMandatory ? " on a mandatory event it cannot decline" : ""}.`);
  }
  if (breaches.length === 0 && nearCap.length === 0) {
    conclusionParts.push("No scheme is within 2% of a single-issuer limit.");
  } else {
    const flagged = new Set([...breaches, ...nearCap].map(({ scheme }) => scheme.schemeId));
    if (schemes.some((scheme: EventData) => !flagged.has(scheme.schemeId))) conclusionParts.push("No other scheme is within 2% of a limit.");
  }
  if (shortSchemes.length > 0) {
    conclusionParts.push(`Funding is short in ${shortSchemes.map((scheme: EventData) => scheme.schemeName).join(" and ")}.`);
  }

  const decisions = events.flatMap((event) => (event.schemeImpacts ?? []).flatMap((impact: EventData) => {
    if (!impact.electionDecision) return [];
    const decidedEntry = (event.audit ?? []).find((entry: EventData) =>
      entry.action === "Election submitted" && String(entry.detail ?? "").includes(String(impact.account ?? "")));
    const approvalEntry = (event.audit ?? []).find((entry: EventData) => entry.action === "Checker approval recorded");
    return [{
      eventId: event.id,
      eventLabel: `${event.issuer} ${String(event.eventType ?? "").toLowerCase()}`,
      schemeName: impact.schemeName ?? impact.fund ?? impact.account ?? "",
      decision: `${impact.electionDecision.optionLabel ?? impact.electionDecision.optionId}${impact.electionDecision.quantityElected ? ` for ${Number(impact.electionDecision.quantityElected).toLocaleString("en-IN")} units` : ""}`,
      decidedBy: impact.electionDecision.analyst ?? "",
      decidedAt: decidedEntry?.timestamp ?? event.receivedAt ?? "",
      approvedBy: impact.approval === "Approved" ? (approvalEntry?.actor ?? event.instruction?.approvalActor ?? "Compliance") : "",
      valueAmount: Number(Number(impact.electionDecision.requiredFunding || impact.cashAmount || 0).toFixed(2)),
      status: impact.approval === "Approved" ? "Approved" : impact.status ?? "Submitted",
    }];
  })).sort((left, right) => String(right.decidedAt).localeCompare(String(left.decidedAt)));

  return {
    generatedAt: asOf.toISOString(),
    purpose: "Each corporate action is checked on its own. A scheme holding one issuer across several concurrent events can breach the SEBI single-issuer cap on the combination alone. Catching that combined breach is what this page exists for.",
    conclusion: conclusionParts.join(" "),
    schemes,
    decisions,
    history,
  };
}

export function buildDashboard(events: EventData[], desk: EventData, asOf = new Date()): EventData {
  const schemes = buildSchemeSummaries(events, desk);
  const inboundEvents = sortCorporateActionEvents(events, asOf).map(toSummary);
  const portfolioEvents = events.filter((event) => event.schemeImpacts?.some((impact: EventData) => impact.affected));
  // Funding is a live obligation figure: closed or reconciled events no longer demand cash,
  // so only open events count, matching the six-week chart and nearest-funding semantics.
  const totalFunding = events.filter(isOpenEvent).flatMap((event) => event.schemeImpacts ?? [])
    .filter((impact: EventData) => impact.affected && impact.direction === "Funding")
    .reduce((total: number, impact: EventData) => total + Number(impact.cashAmount ?? 0), 0);
  // "Nearest" must be a live obligation: open events with a future deadline only.
  const nearestFunding = events
    .filter((event) =>
      event.status !== "Closed" && event.status !== "Reconciled" &&
      Date.parse(event.internalDeadlineAt) > asOf.getTime() &&
      event.schemeImpacts?.some((impact: EventData) => impact.affected && impact.direction === "Funding" && impact.cashAmount > 0))
    .sort((left, right) => Date.parse(left.internalDeadlineAt) - Date.parse(right.internalDeadlineAt))[0];
  const lowerBound24h = asOf.getTime() - DAY_MS;
  const arrivalsAffectingSchemes24h = events.filter((event) => {
    const received = Date.parse(event.receivedAt);
    return Number.isFinite(received) && received > lowerBound24h && received <= asOf.getTime()
      && event.schemeImpacts?.some((impact: EventData) => impact.affected);
  }).length;
  const openEvents = events.filter(isOpenEvent);
  const needsYouCount = openEvents.filter(needsDecision).length;
  // Early sightings are genuinely a third state: nothing can be decided until the
  // custodian confirms, so they are neither "needs you" nor "needs nothing".
  const awaitingConfirmationCount = openEvents.filter((event) => event.isEarlySighting).length;
  const atStakeAmount = Number(openEvents.reduce((total, event) => total + rightsLapseValue(event, desk), 0).toFixed(2));
  const dueWithin3DaysCount = openEvents.filter((event) => {
    const deadline = Date.parse(event.internalDeadlineAt);
    return Number.isFinite(deadline) && deadline > asOf.getTime() && deadline <= asOf.getTime() + 3 * DAY_MS;
  }).length;
  const settlementBreakCount = openEvents.filter((event) =>
    event.reconciliation?.classification && !["Matched", "Not due"].includes(event.reconciliation.classification)).length;
  const topHouseExposures = buildIssuerSummaries(events, desk).slice(0, 5).map((row) => ({
    issuerId: row.issuerId,
    issuer: row.issuer,
    houseExposureAmount: row.houseExposureAmount,
    schemesHolding: row.schemesHolding,
    schemesAffected: row.schemesAffected,
    tightestHeadroomPercent: row.tightestHeadroomPercent,
    attention: row.attention,
  }));
  const sourceRecords = events.flatMap((event) => event.sourceRecords ?? [])
    .filter((record: EventData) => Number.isFinite(Date.parse(record.receivedAt ?? "")));
  const latestRecord = [...sourceRecords].sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))[0];
  const dataTrust = {
    conflictingSourceCount: events.filter((event) => (event.sourceDisagreements ?? []).length > 0).length,
    lastDeliveryChannel: latestRecord?.channel ?? "",
    lastDeliveryAt: latestRecord?.receivedAt ?? "",
    allSynthetic: events.every((event) => event.source !== "Public web discovery"),
  };
  const history = buildHistory(events);
  return {
    needsYouCount,
    needsNothingCount: openEvents.length - needsYouCount - awaitingConfirmationCount,
    awaitingConfirmationCount,
    atStakeAmount,
    dueWithin3DaysCount,
    settlementBreakCount,
    topHouseExposures,
    dataTrust,
    lastQuarter: {
      capturedAmount: history.capturedAmount,
      forfeitedAmount: history.forfeitedAmount,
      lapsedCount: history.lapsedCount,
      deadlinesMet: history.deadlinesMet,
      deadlinesTotal: history.deadlinesTotal,
    },
    arrivalCount24h: countArrivalsInLast24Hours(events, asOf),
    arrivalsAffectingSchemes24h,
    portfolioEventCount: portfolioEvents.length,
    impactedSchemeCount: schemes.filter((scheme) => scheme.openActions.length > 0).length,
    totalSchemeCount: schemes.length,
    totalFunding: Number(totalFunding.toFixed(2)),
    nearestDeadline: nearestFunding?.internalDeadline ?? "",
    nearestFundingIssuer: nearestFunding?.issuer ?? "",
    inboundEvents,
    schemes,
  };
}