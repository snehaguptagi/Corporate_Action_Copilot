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
import { ARKA_SCHEME_SEED, ARKA_EVENT, projectArkaBharatPositions } from "./arka-desk";

export type EventData = Record<string, any>;

export const SEED_DATE_ANCHOR = sharedSeedDateAnchor;
export const SEED_VERSION = "fund-manager-dashboard-v9";
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
  { id: "USR-001", name: "Aisha Mehta", role: "Operations Analyst", desk: "London Operations" },
  { id: "USR-002", name: "Daniel Reed", role: "Reviewer", desk: "London Operations" },
  { id: "USR-003", name: "Maya Shah", role: "Operations Manager", desk: "Global Oversight" },
  { id: "USR-004", name: "Rohan Iyer", role: "Fund Manager", desk: "Arka Mutual Fund" },
  { id: "USR-005", name: "Nisha Kapoor", role: "Compliance", desk: "Arka Mutual Fund" },
];

const indianSecurity = (isin: string, ticker: string, issuer: string) => ({
  securityId: `SEC-${ticker}`, isin, ticker, securityName: issuer, currency: "INR", market: "India", status: "Active",
});
const istDeadline = (offset: number, time = "15:30") => `${shortDate(offset)} · ${time} IST`;
const INDIAN_EVENT_META: Record<string, { deadlineOffset: number; receivedOffset: number; receivedTime: string; source: string }> = {
  "evt-ind-dividend-review": { deadlineOffset: 12, receivedOffset: 0, receivedTime: "08:45:00", source: "NSE corporate filing" },
  "evt-ind-split": { deadlineOffset: 14, receivedOffset: 0, receivedTime: "10:20:00", source: "BSE corporate filing" },
  "evt-ind-bonus": { deadlineOffset: 6, receivedOffset: -1, receivedTime: "11:10:00", source: "RTA notice" },
  "evt-ind-buyback": { deadlineOffset: 16, receivedOffset: 0, receivedTime: "13:05:00", source: "NSDL/CDSL corporate action file" },
  "evt-ind-scheme": { deadlineOffset: 17, receivedOffset: -2, receivedTime: "15:40:00", source: "Manual upload" },
  "evt-ind-dividend-break": { deadlineOffset: 1, receivedOffset: -1, receivedTime: "09:30:00", source: "RTA notice" },
  "evt-bharat-rights": { deadlineOffset: 15, receivedOffset: -1, receivedTime: "14:15:00", source: "NSE corporate filing" },
};
const indianEvent = (input: EventData): EventData => eventBase({
  currency: "INR",
  marketDeadline: istDeadline(INDIAN_EVENT_META[input.id]?.deadlineOffset ?? 15),
  internalDeadline: istDeadline((INDIAN_EVENT_META[input.id]?.deadlineOffset ?? 15) - 1, "15:00"),
  affectedAccounts: input.positions?.length ?? 1,
  receivedAt: seedTimestamp(INDIAN_EVENT_META[input.id]?.receivedOffset ?? -1, INDIAN_EVENT_META[input.id]?.receivedTime ?? "09:00:00"),
  source: INDIAN_EVENT_META[input.id]?.source ?? "NSE corporate filing",
  calculationInputs: { recordDate: isoDate(input.recordOffset ?? 10), currency: "INR", cashDecimals: 2, ...input.calculationInputs },
  reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Settlement pending.", expectedCash: 0, expectedGrossCash: 0, expectedWithholdingAmount: 0, expectedNetCash: 0, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "INR", actualCurrency: "INR", expectedSettlementDate: isoDate((input.deadlineOffset ?? 15) + 7), actualSettlementDate: "", expectedAccount: "Multiple accounts", actualAccount: "", investigationSteps: [] },
  instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory event. No market instruction is generated.", simulated: false, approvalActor: "" },
  options: [], impacts: [], tasks: [],
  audit: [{ id: `audit-${input.id}`, eventId: input.id, action: "Notice received", actor: "System", actorType: "system", timestamp: seedTimestamp(-1, "09:00:00"), detail: "Synthetic NSE notice captured.", previousValue: "", newValue: input.status, reason: "", evidenceId: `EVD-${input.id}`, workflowStatus: input.status }],
  ...input,
});

const preloadedEvents: EventData[] = [
  indianEvent({ id: "evt-ind-dividend-review", reference: "CA-IN-DIV-001", issuer: "Aarav Industries Ltd", security: "ISIN INE0AAR01011 · AARAV", eventType: "Cash dividend", processingType: "Mandatory", status: "Under review", risk: "High", amount: 0, securityMaster: indianSecurity("INE0AAR01011", "AARAV", "Aarav Industries Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency", "withholding"], notice: notice("aarav-dividend-notice.pdf", "Interim dividend of ₹4.25.", ["NSE CORPORATE ACTION: Interim dividend ₹4.25 per equity share."]), terms: [term("rate", "Cash rate", "₹4.25", 1, "₹4.25 per equity share."), term("recordDate", "Record date", shortDate(10), 1, "Record date."), term("paymentDate", "Payment date", shortDate(22), 1, "Payment date."), term("currency", "Payment currency", "INR", 1, "Indian rupees."), term("withholding", "TDS applicability", "Not applicable — mutual fund, s.196", 1, "Section 196 treatment.", "Needs review")], positions: [position("POS-AAR", "Arka Large Cap Fund", "ARKA-LC-001", "INE0AAR01011", 450000, isoDate(10))] }),
  indianEvent({ id: "evt-ind-split", reference: "CA-IN-SPLIT-001", issuer: "Deccan Grid Ltd", security: "ISIN INE0DEC01012 · DGL", eventType: "Stock split", processingType: "Mandatory", status: "Awaiting settlement", risk: "Low", amount: 0, unit: "Shares", securityMaster: indianSecurity("INE0DEC01012", "DGL", "Deccan Grid Ltd"), requiredTermKeys: ["splitRatio", "effectiveDate", "recordDate"], calculationInputs: { splitFactor: 5 }, notice: notice("deccan-split-notice.pdf", "Stock split 1:5.", ["Face value ₹10 split into five ₹2 shares."]), terms: [term("splitRatio", "Split ratio", "5 for 1", 1, "1:5 split."), term("effectiveDate", "Effective date", shortDate(15), 1, "Effective date."), term("recordDate", "Record date", shortDate(10), 1, "Record date.")], positions: [position("POS-DEC", "Arka Flexi Cap Fund", "ARKA-FC-001", "INE0DEC01012", 80000, isoDate(10))] }),
  indianEvent({ id: "evt-ind-bonus", reference: "CA-IN-BONUS-001", issuer: "Narmada Logistics Ltd", security: "ISIN INE0NAR01013 · NARMADA", eventType: "Bonus issue", processingType: "Mandatory", status: "Closed", risk: "Low", amount: 5000, unit: "Shares", securityMaster: indianSecurity("INE0NAR01013", "NARMADA", "Narmada Logistics Ltd"), requiredTermKeys: ["bonusRatio", "paymentDate", "recordDate"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 10 }, notice: notice("narmada-bonus-notice.pdf", "Bonus issue 1:10.", ["One bonus share for every ten equity shares."]), terms: [term("bonusRatio", "Bonus ratio", "1 for 10", 1, "1:10."), term("paymentDate", "Settlement date", shortDate(17), 1, "Settlement."), term("recordDate", "Record date", shortDate(10), 1, "Record date.")], positions: [position("POS-NAR", "Arka Small Cap Fund", "ARKA-SC-001", "INE0NAR01013", 50000, isoDate(10))] }),
  indianEvent({ id: "evt-ind-buyback", reference: "CA-IN-BUYBACK-001", issuer: "Meridian Infrastructure India Ltd", security: "ISIN INE0MER01014 · MII", eventType: "Tender offer", processingType: "Voluntary", status: "Awaiting approval", risk: "Medium", amount: 6800000, securityMaster: indianSecurity("INE0MER01014", "MII", "Meridian Infrastructure India Ltd"), requiredTermKeys: ["offerPrice", "maximumAcceptance", "marketDeadline"], calculationInputs: { offerPrice: 850, maximumPercentage: .2 }, notice: notice("meridian-buyback-notice.pdf", "Buyback at ₹850 with 20% acceptance.", ["Tender offer / buyback: ₹850 per share; 20% maximum acceptance."]), terms: [term("offerPrice", "Offer price", "₹850", 1, "₹850."), term("maximumAcceptance", "Maximum acceptance", "20%", 1, "20%."), term("marketDeadline", "Market deadline", istDeadline(15), 1, "IST deadline.")], positions: [position("POS-MER", "Arka Focused 25 Fund", "ARKA-F25-001", "INE0MER01014", 40000, isoDate(10))], options: [{ id: "tender", label: "Tender maximum", description: "Tender up to 20%.", result: "Cash proceeds.", default: false, fundingFormula: "Quantity × price" }, { id: "decline", label: "Do not tender", description: "Retain holding.", result: "No cash.", default: true, fundingFormula: "No funding" }] }),
  indianEvent({ id: "evt-ind-scheme", reference: "CA-IN-SCHEME-001", issuer: "Vindhya Mobility Ltd", security: "ISIN INE0VIN01015 · VINDHYA", eventType: "Merger / demerger", processingType: "Mandatory with options", status: "Election required", risk: "High", amount: 0, securityMaster: indianSecurity("INE0VIN01015", "VINDHYA", "Vindhya Mobility Ltd"), requiredTermKeys: ["cashRate", "shareExchangeRatio", "marketDeadline", "recordDate"], calculationInputs: { cashRate: 425, shareExchangeRatio: .333 }, notice: notice("vindhya-scheme-notice.pdf", "Scheme of arrangement.", ["₹425 cash and 0.333 successor shares."]), terms: [term("cashRate", "Cash consideration", "₹425", 1, "Cash."), term("shareExchangeRatio", "Share exchange ratio", "0.333", 1, "Shares."), term("recordDate", "Record date", shortDate(10), 1, "Record date."), term("marketDeadline", "Market deadline", istDeadline(15), 1, "IST.")], positions: [position("POS-VIN", "Arka Infrastructure Fund", "ARKA-INF-001", "INE0VIN01015", 13005, isoDate(10))], options: [{ id: "default-consideration", label: "Accept default consideration", description: "Cash and shares.", result: "Cash plus shares.", default: true, fundingFormula: "No funding" }] }),
  indianEvent({ id: "evt-ind-dividend-break", reference: "CA-IN-DIV-002", issuer: "Harit Utilities Ltd", security: "ISIN INE0HAR01016 · HARIT", eventType: "Cash dividend", processingType: "Mandatory", status: "Break identified", risk: "High", amount: 1912500, securityMaster: indianSecurity("INE0HAR01016", "HARIT", "Harit Utilities Ltd"), requiredTermKeys: ["rate", "recordDate", "paymentDate", "currency", "withholding"], calculationInputs: { rate: 4.25, withholdingRate: 0 }, notice: notice("harit-dividend-notice.pdf", "Interim dividend ₹4.25.", ["₹4.25 dividend. TDS not applicable to Arka Mutual Fund under s.196."]), terms: [term("rate", "Cash rate", "₹4.25", 1, "Rate."), term("recordDate", "Record date", shortDate(10), 1, "Record."), term("paymentDate", "Payment date", shortDate(17), 1, "Payment."), term("currency", "Payment currency", "INR", 1, "INR."), term("withholding", "TDS applicability", "Not applicable — mutual fund, s.196", 1, "s.196.")], positions: [position("POS-HAR", "Arka Large Cap Fund", "ARKA-LC-001", "INE0HAR01016", 450000, isoDate(10))], impacts: [{ id: "imp-har", fund: "Arka Large Cap Fund", account: "ARKA-LC-001", eligibleQuantity: 450000, positionDate: isoDate(10), securityId: "SEC-HARIT", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "450,000 × ₹4.25", expected: 1912500, expectedCash: 1912500, grossCash: 1912500, netCash: 1912500, withholdingAmount: 0, withholdingRate: 0, expectedSecurityQuantity: 0, securityMovement: "Cash receipt", currency: "INR", unit: "INR", status: "Calculated", election: null, approval: "Not required" }], reconciliation: { expected: 1912500, actual: 1870000, difference: -42500, tolerance: .01, status: "Under-settled", classification: "Under-settled", note: "Custodian paid 4,40,000 shares against 4,50,000 entitled.", expectedCash: 1912500, expectedGrossCash: 1912500, expectedWithholdingAmount: 0, expectedNetCash: 1912500, actualCash: 1870000, expectedSecurityQuantity: 450000, actualSecurityQuantity: 440000, expectedCurrency: "INR", actualCurrency: "INR", expectedSettlementDate: isoDate(17), actualSettlementDate: isoDate(17), expectedAccount: "ARKA-LC-001", actualAccount: "ARKA-LC-001", investigationSteps: ["Verify entitled quantity of 4,50,000 shares.", "Confirm custodian paid on only 4,40,000 shares.", "Recover ₹42,500 for the 10,000-share shortfall."] } }),
  indianEvent({ id: "evt-bharat-rights", reference: ARKA_EVENT.reference, issuer: ARKA_EVENT.issuer, security: `ISIN ${ARKA_EVENT.isin} · ${ARKA_EVENT.ticker}`, eventType: "Rights issue", processingType: "Voluntary", status: "Validated", risk: "High", amount: 0, securityMaster: indianSecurity(ARKA_EVENT.isin, ARKA_EVENT.ticker, ARKA_EVENT.issuer), requiredTermKeys: ["rightsRatio", "subscriptionPrice", "recordDate", "marketDeadline"], calculationInputs: { ratioNumerator: 1, ratioDenominator: 5, subscriptionPrice: 85 }, notice: notice("bharat-rights-issue-notice.pdf", "Rights issue 1:5 at ₹85.", ["Bharat Renewables rights issue: 1 for 5 at ₹85."]), terms: [term("rightsRatio", "Rights ratio", "1 for 5", 1, "Ratio."), term("subscriptionPrice", "Subscription price", "₹85", 1, "Price."), term("recordDate", "Record date", ARKA_EVENT.recordDate, 1, "Record."), term("marketDeadline", "Market deadline", ARKA_EVENT.marketDeadline, 1, "IST.")], positions: projectArkaBharatPositions(), options: [{ id: "exercise", label: "Exercise", description: "Subscribe.", result: "Funding required.", default: true, fundingFormula: "Rights × ₹85" }] }),
];

function buildSchemeImpacts(event: EventData): EventData[] {
  const positionByScheme = new Map<string, EventData>(
    (event.positions ?? []).map((current: EventData): [string, EventData] => [String(current.fund), current]),
  );
  return ARKA_SCHEME_SEED.map((scheme) => {
    const position = positionByScheme.get(scheme.schemeName);
    const eligible = position?.eligibilityStatus !== "Excluded";
    const quantity = eligible ? Number(position?.eligibleQuantity ?? position?.settledQuantity ?? 0) : 0;
    let cashAmount = 0;
    let direction = "Neutral";
    let quantityResult: number | null = null;
    let navImpactPaise: number | null = null;

    if (event.eventType === "Cash dividend") {
      cashAmount = quantity * Number(event.calculationInputs?.rate ?? 0);
      direction = cashAmount > 0 ? "Receivable" : "Neutral";
    } else if (event.eventType === "Stock split") {
      quantityResult = quantity * Number(event.calculationInputs?.splitFactor ?? 1);
    } else if (event.eventType === "Bonus issue") {
      quantityResult = Math.floor(
        quantity
        * Number(event.calculationInputs?.ratioNumerator ?? 0)
        / Number(event.calculationInputs?.ratioDenominator ?? 1),
      );
    } else if (event.eventType === "Rights issue") {
      const rights = Math.floor(
        quantity
        * Number(event.calculationInputs?.ratioNumerator ?? 0)
        / Number(event.calculationInputs?.ratioDenominator ?? 1),
      );
      cashAmount = rights * Number(event.calculationInputs?.subscriptionPrice ?? 0);
      direction = cashAmount > 0 ? "Funding" : "Neutral";
      quantityResult = rights;
      if (quantity > 0) {
        const unitsOutstanding = Number(scheme.aumPaise) / Number(scheme.navPaise);
        navImpactPaise = Number(((quantity * (120 - 685 / 6)) / unitsOutstanding * 100).toFixed(2));
      }
    } else if (event.eventType === "Tender offer") {
      const accepted = Math.floor(quantity * Number(event.calculationInputs?.maximumPercentage ?? 0));
      cashAmount = accepted * Number(event.calculationInputs?.offerPrice ?? 0);
      direction = cashAmount > 0 ? "Receivable" : "Neutral";
      quantityResult = accepted;
    } else if (event.eventType === "Merger / demerger") {
      cashAmount = quantity * Number(event.calculationInputs?.cashRate ?? 0);
      direction = cashAmount > 0 ? "Receivable" : "Neutral";
      quantityResult = Math.floor(quantity * Number(event.calculationInputs?.shareExchangeRatio ?? 0));
    }

    const affected = quantity > 0;
    return {
      schemeId: scheme.id,
      schemeName: scheme.schemeName,
      affected,
      eligibleQuantity: quantity,
      direction,
      cashAmount: Number(cashAmount.toFixed(2)),
      quantityResult,
      navImpactPaise,
      navImpactTreatment: event.eventType === "Rights issue" ? "Dilution" : "Neutral",
      flag: event.eventType === "Rights issue" && scheme.id === "arka-focused-25"
        ? "SEBI 10% headroom"
        : event.eventType === "Rights issue" && scheme.id === "arka-small-cap"
          ? "Cash budget"
          : null,
    };
  });
}

for (const event of preloadedEvents) {
  event.schemeImpacts = buildSchemeImpacts(event);
  event.affectedAccounts = event.schemeImpacts.filter((impact: EventData) => impact.affected).length;
}

/** Read-only deterministic fixture snapshot for coherence/control regression tests. */
export function getSeededEventSnapshot(): EventData[] {
  return JSON.parse(JSON.stringify(preloadedEvents)) as EventData[];
}

export function countArrivalsOnDate(events: EventData[], date: Date): number {
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return events.filter((event) => {
    const received = new Date(event.receivedAt);
    return !Number.isNaN(received.getTime())
      && new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(received) === dateKey;
  }).length;
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
  page: number,
  evidence: string,
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
  escalationPath: "Escalate to Operations Manager",
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
    schemeImpacts: [],
    noticeReference: input.reference,
    settlementStage: input.status,
    users: demoUsers,
    validation: { missingTerms: [], isReady: false },
    calculation: {
      calculationRunAt: input.calculationRunAt ?? seedTimestamp(seedTimeline.calculationRun, "06:30:00"),
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
    risk: "High",
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
    impacts: [],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory event. No market instruction is generated.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Expected net cash is pending withholding-rate validation.", expectedCash: 0, expectedGrossCash: 0, expectedWithholdingAmount: 0, expectedNetCash: 0, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "GBP", actualCurrency: "GBP", expectedSettlementDate: isoDate(seedTimeline.aurora.payment), actualSettlementDate: "", expectedAccount: "Multiple accounts", actualAccount: "", investigationSteps: [] },
    tasks: [
      task("task-aur-1", "evt-aurora-review", "CA-2026-0814-AX", "Validate payment currency", "Aisha Mehta", "Today · 11:00 BST", "High", "Term validation", "Confirm the currency evidence before calculation can be released."),
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
    risk: "Low",
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
    impacts: [
      { id: "imp-dgt-1", fund: "Northbridge Growth Fund", account: "CUST-4410", eligibleQuantity: 80000, positionDate: isoDate(seedTimeline.delta.record), securityId: "SEC-003", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "80,000 × 4", expected: 320000, expectedCash: 0, expectedSecurityQuantity: 320000, securityMovement: "240,000 additional shares", currency: "Shares", status: "Calculated", election: null, approval: "Not required" },
      { id: "imp-dgt-2", fund: "Sovereign Select Mandate", account: "CUST-1138", eligibleQuantity: 25000, positionDate: isoDate(seedTimeline.delta.record), securityId: "SEC-003", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "25,000 × 4", expected: 100000, expectedCash: 0, expectedSecurityQuantity: 100000, securityMovement: "75,000 additional shares", currency: "Shares", status: "Calculated", election: null, approval: "Not required" },
    ],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory position adjustment. No instruction is submitted.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 420000, actual: 0, difference: -420000, tolerance: 1, status: "Not due", classification: "Not due", note: "Awaiting custodian movement confirmation.", expectedCash: 0, actualCash: 0, expectedSecurityQuantity: 420000, actualSecurityQuantity: 0, expectedCurrency: "Shares", actualCurrency: "Shares", expectedSettlementDate: isoDate(seedTimeline.delta.settlement), actualSettlementDate: "", expectedAccount: "Multiple accounts", actualAccount: "", investigationSteps: [] },
    tasks: [task("task-dgt-1", "evt-delta-split", "CA-2026-0809-DL", "Check security receipt", "Aisha Mehta", `${taskDate(seedTimeline.delta.market)} · EOD ET`, "Medium", "Settlement", "Reconcile post-split quantities once custodian movement arrives.")],
    audit: [{ id: "audit-dgt-1", eventId: "evt-delta-split", action: "Calculation approved", actor: "Daniel Reed", actorType: "user", timestamp: seedTimestamp(seedTimeline.delta.audit, "06:45:00"), detail: "Split calculation and position eligibility approved.", previousValue: "Impact calculated", newValue: "Awaiting settlement", reason: "Mandatory event", evidenceId: "EVD-DGT-01", workflowStatus: "Awaiting settlement" }],
  }),
  eventBase({
    id: "evt-nimbus-bonus",
    reference: "CA-2026-0812-NB",
    issuer: "Nimbus Logistics SA",
    security: "ISIN NL000NIMB001 · NMB",
    eventType: "Stock dividend / bonus issue",
    processingType: "Mandatory",
    status: "Closed",
    risk: "Low",
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
    impacts: [{ id: "imp-nmb-1", fund: "European Opportunities Fund", account: "CUST-6632", eligibleQuantity: 50000, positionDate: isoDate(seedTimeline.nimbus.record), securityId: "SEC-004", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "floor(50,000 × 1 ÷ 10)", expected: 5000, expectedCash: 0, expectedSecurityQuantity: 5000, securityMovement: "5,000 bonus shares", currency: "Shares", status: "Reconciled", election: null, approval: "Not required" }],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory bonus issue processed without instruction.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 5000, actual: 5000, difference: 0, tolerance: 1, status: "Matched", classification: "Matched", note: "Custodian security movement matches expected entitlement.", expectedCash: 0, actualCash: 0, expectedSecurityQuantity: 5000, actualSecurityQuantity: 5000, expectedCurrency: "Shares", actualCurrency: "Shares", expectedSettlementDate: isoDate(seedTimeline.nimbus.settlement), actualSettlementDate: isoDate(seedTimeline.nimbus.settlement), expectedAccount: "CUST-6632", actualAccount: "CUST-6632", investigationSteps: [] },
    tasks: [],
    audit: [{ id: "audit-nmb-1", eventId: "evt-nimbus-bonus", action: "Event closed", actor: "Maya Shah", actorType: "user", timestamp: seedTimestamp(seedTimeline.nimbus.audit, "09:15:00"), detail: "Settlement matched and closure control completed.", previousValue: "Reconciled", newValue: "Closed", reason: "All mandatory controls complete", evidenceId: "SET-NMB-01", workflowStatus: "Closed" }],
  }),
  eventBase({
    id: "evt-meridian-tender",
    reference: "CA-2026-0818-MT",
    issuer: "Meridian Infrastructure Ltd",
    security: "ISIN AU0000MERID2 · MRL",
    eventType: "Tender offer",
    processingType: "Voluntary",
    status: "Awaiting approval",
    risk: "Medium",
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
    impacts: [{ id: "imp-mrl-1", fund: "Sovereign Select Mandate", account: "CUST-1138", eligibleQuantity: 40000, positionDate: isoDate(seedTimeline.meridian.record), securityId: "SEC-005", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "8,000 × AUD 8.50", expected: 68000, expectedCash: 68000, cashDirection: "Receivable", expectedSecurityQuantity: 0, securityMovement: "Tender 8,000 shares", currency: "AUD", status: "Election submitted", election: "tender", electionDecision: { optionId: "tender", quantityElected: 8000, requiredFunding: 0, analystId: "USR-001", analyst: "Aisha Mehta", comment: "Portfolio decision received.", status: "Submitted" }, approval: "Pending" }],
    options: [{ id: "tender", label: "Tender maximum", description: "Tender up to 20% of the eligible position.", result: "Expected cash proceeds at the offer price.", default: false, fundingFormula: "Quantity elected × offer price" }, { id: "decline", label: "Do not tender", description: "Retain the current holding.", result: "No cash proceeds.", default: true, fundingFormula: "No funding" }],
    instruction: { status: "DRAFT", destination: "Synthetic custodian gateway", reference: "DRAFT-MRL-0818", generatedAt: seedTimestamp(seedTimeline.meridian.audit, "06:40:00"), content: "DRAFT ONLY - awaiting reviewer approval.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 68000, actual: 0, difference: -68000, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Tender outcome pending.", expectedCash: 68000, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "AUD", actualCurrency: "AUD", expectedSettlementDate: isoDate(seedTimeline.meridian.settlement), actualSettlementDate: "", expectedAccount: "CUST-1138", actualAccount: "", investigationSteps: [] },
    tasks: [task("task-mrl-1", "evt-meridian-tender", "CA-2026-0818-MT", "Complete checker approval", "Daniel Reed", `${taskDate(seedTimeline.meridian.internal)} · 19:00 AEST`, "High", "Approval", "A reviewer independent of the maker must approve the tender.", "Open", "Obtain election decision", "CA-CONTROL-004")],
    audit: [{ id: "audit-mrl-1", eventId: "evt-meridian-tender", action: "Election submitted", actor: "Aisha Mehta", actorType: "user", timestamp: seedTimestamp(seedTimeline.meridian.audit, "06:35:00"), detail: "Tender election for 8,000 shares submitted for independent review.", previousValue: "Election required", newValue: "Awaiting approval", reason: "Portfolio decision received", evidenceId: "EVD-MRL-02", workflowStatus: "Awaiting approval" }],
  }),
  eventBase({
    id: "evt-verdant-merger",
    reference: "CA-2026-0820-VM",
    issuer: "Verdant Mobility Holdings",
    security: "ISIN FR001400VMH4 · VMH",
    eventType: "Merger / acquisition",
    processingType: "Mandatory with options",
    status: "Election required",
    risk: "High",
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
    impacts: [{ id: "imp-vmh-1", fund: "European Opportunities Fund", account: "CUST-6632", eligibleQuantity: 13005, positionDate: isoDate(seedTimeline.merger.record), securityId: "SEC-006", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "(13,005 × EUR 4.25) + floor(13,005 × 0.333) shares + cash in lieu", expected: 55271.25, expectedCash: 55271.25, cashDirection: "Receivable", expectedSecurityQuantity: 4330, securityMovement: "4,330 New Horizon shares; fraction paid in cash", currency: "EUR", status: "Calculated", election: null, approval: "Pending" }],
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
    risk: "High",
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
    impacts: [{ id: "imp-hbr-1", fund: "Northbridge Income Fund", account: "CUST-4081", eligibleQuantity: 450000, positionDate: isoDate(seedTimeline.harbor.record), securityId: "SEC-007", eligibilityStatus: "Eligible", dataQualityWarning: "", formula: "Gross GBP 191,250.00; withholding 15% = GBP 28,687.50; net GBP 162,562.50", expected: 162562.5, expectedCash: 162562.5, cashDirection: "Receivable", grossCash: 191250, withholdingRate: 0.15, withholdingAmount: 28687.5, netCash: 162562.5, expectedSecurityQuantity: 0, securityMovement: "Net cash receipt after withholding", currency: "GBP", status: "Break identified", election: null, approval: "Not required" }],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "", content: "Mandatory cash event. No instruction is submitted.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 162562.5, actual: 160562.5, difference: -2000, tolerance: 0.01, status: "Under-settled", classification: "Under-settled", note: "Custodian payment is GBP 2,000 below the expected net cash after 15% withholding.", expectedCash: 162562.5, expectedGrossCash: 191250, expectedWithholdingAmount: 28687.5, expectedNetCash: 162562.5, actualCash: 160562.5, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "GBP", actualCurrency: "GBP", expectedSettlementDate: isoDate(seedTimeline.harbor.settlement), actualSettlementDate: isoDate(seedTimeline.harbor.settlement), expectedAccount: "CUST-4081", actualAccount: "CUST-4081", investigationSteps: ["Verify the eligible quantity and record date.", "Confirm the GBP 0.425 gross dividend rate.", "Confirm the validated 15% withholding rate and GBP 28,687.50 tax amount.", "Compare the expected net GBP 162,562.50 with the custodian's GBP 160,562.50 payment.", "Contact the synthetic custodian about the remaining GBP 2,000 shortfall."] },
    tasks: [task("task-hbr-1", "evt-harbor-break", "CA-2026-0804-HB", "Investigate post-tax payment shortfall", "Aisha Mehta", "Today · 14:00 BST", "High", "Reconciliation", "Expected net GBP 162,562.50 after GBP 28,687.50 withholding; actual GBP 160,562.50. Investigate the remaining GBP 2,000 shortfall.", "Open", "", "CA-CONTROL-007")],
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
    risk: "High",
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
    impacts: [],
    options: [
      { id: "exercise", label: "Exercise rights", description: "Subscribe for new shares using all or part of the eligible entitlement.", result: "Cash funding is required.", default: false, fundingFormula: "Quantity elected × EUR 8.50" },
      { id: "sell", label: "Sell rights", description: "Submit the rights for sale; no subscription funding is required.", result: "Sale proceeds depend on market execution.", default: false, fundingFormula: "No funding" },
      { id: "lapse", label: "Allow rights to lapse", description: "Take no action; rights expire at the deadline.", result: "No funding; potential value loss.", default: true, fundingFormula: "No funding" },
    ],
    instruction: { status: "DRAFT", destination: "Synthetic Euroclear gateway", reference: "DRAFT-VRN-0821", generatedAt: "", content: "DRAFT ONLY - generated after independent reviewer approval.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Settlement follows an approved election.", expectedCash: 0, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "EUR", actualCurrency: "EUR", expectedSettlementDate: isoDate(seedTimeline.rights.settlement), actualSettlementDate: "", expectedAccount: "Multiple accounts", actualAccount: "", investigationSteps: [] },
    tasks: [task("task-vrn-1", eventId, "CA-2026-0821-VR", "Validate notice terms", "Aisha Mehta", "Today · 12:00 CEST", "High", "Term validation", "Review all extracted terms against the uploaded notice.", "Open", "", "CA-CONTROL-001")],
    audit: [audit(eventId, "Notice uploaded", `${documentName} accepted as a synthetic notice; deterministic extraction prepared for analyst review.`, actor.name, "Received", { evidenceId: "DOC-VRN-01", actorId: actor.id, actorRole: actor.role })],
  });
}

export type WorkflowActor = {
  id: string;
  name: string;
  role: "Operations Analyst" | "Reviewer" | "Operations Manager" | "Fund Manager" | "Compliance";
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
}

export function applyTermUpdates(event: EventData, updates: any[], actor: any, reason: string): void {
  if (actor.role !== "Operations Analyst") throw new Error("Only an Operations Analyst can validate or correct extracted terms.");
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
  if (actor.role !== "Operations Analyst") throw new Error("Only an Operations Analyst can run deterministic calculations.");
  if (event.impacts?.some((impact: any) => impact.electionDecision)) throw new Error("Calculation cannot be re-run after elections are submitted. Return the event for analyst review first.");
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

  event.impacts = positions.map((item: any) => {
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

  event.affectedAccounts = event.impacts.length;
  event.amount = sumMoneyPaise(event.impacts, "expectedCash") || event.impacts.reduce((total: number, item: any) => total + Number(item.expectedSecurityQuantity ?? 0), 0);
  if (event.eventType === "Cash dividend") {
    const expectedGrossCash = sumMoneyPaise(event.impacts, "grossCash");
    const expectedWithholdingAmount = sumMoneyPaise(event.impacts, "withholdingAmount");
    const expectedNetCash = sumMoneyPaise(event.impacts, "netCash");
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
  if (actor.role !== "Operations Analyst") throw new Error("Only an Operations Analyst can prepare an election.");
  if (event.processingType === "Mandatory") throw new Error("Mandatory events do not have an election workflow.");
  if (!["Election required", "Awaiting approval"].includes(event.status)) throw new Error(`Election cannot be saved while the event is ${event.status}.`);
  const impact = event.impacts?.find((candidate: any) => candidate.id === body.impactId);
  const option = event.options?.find((candidate: any) => candidate.id === body.optionId);
  if (!impact || !option) throw new Error("Impact or election option is invalid.");
  const maximum = Number(impact.entitlement ?? impact.eligibleQuantity);
  if (!Number.isFinite(body.quantityElected) || body.quantityElected < 0 || body.quantityElected > maximum) throw new Error(`Election quantity must be between 0 and ${maximum.toLocaleString()}.`);
  const funding = option.id === "exercise" ? paiseToRupees(BigInt(body.quantityElected) * rupeesToPaise(Number(event.calculationInputs.subscriptionPrice ?? 0))) : 0;
  impact.election = option.id;
  impact.electionDecision = { optionId: option.id, optionLabel: option.label, quantityElected: body.quantityElected, requiredFunding: funding, analystId: actor.id, analyst: actor.name, comment: body.comment ?? "", status: "Submitted" };
  impact.status = "Election submitted";
  impact.approval = "Pending";
  event.reconciliation.expectedCash = sumMoneyPaise(event.impacts.map((current: any) => ({ funding: current.electionDecision?.requiredFunding ?? 0 })), "funding");
  event.reconciliation.expected = event.reconciliation.expectedCash;
  event.reconciliation.expectedSecurityQuantity = event.impacts.reduce((total: number, current: any) => total + (current.election === "exercise" ? Number(current.electionDecision?.quantityElected ?? 0) : 0), 0);
  event.reconciliation.note = "Expected settlement is derived from the recorded election quantities and funding.";
  event.status = event.impacts.every((candidate: any) => candidate.election) ? "Awaiting approval" : "Election required";
  event.settlementStage = event.status;
  for (const currentTask of event.tasks ?? []) if (currentTask.category === "Election") currentTask.status = "Resolved";
  appendAudit(event, "Election submitted", `${impact.account} selected ${option.label} for ${body.quantityElected.toLocaleString()} entitlement units.`, actor, { previousValue: "", newValue: option.label, reason: body.comment ?? "" });
}

export function approveControlledEvent(event: EventData, approved: boolean, note: string, actor: any): void {
  if (actor.role !== "Reviewer") throw new Error("Only a Reviewer can approve or return controlled actions.");
  if (event.processingType !== "Mandatory" && event.status !== "Awaiting approval") throw new Error(`Approval is blocked while the event is ${event.status}.`);
  if (approved) {
    const makerActions = new Set(["Election submitted", "Extracted term corrected", "Extracted term validated"]);
    const makerConflict = (event.audit ?? []).some((entry: any) => makerActions.has(entry.action) && entry.actorId === actor.id)
      || event.impacts.some((impact: any) => impact.electionDecision?.analystId === actor.id);
    if (makerConflict) throw new Error("Maker-checker control failed: the person who prepared an election cannot approve it.");
  }
  event.impacts.forEach((impact: any) => {
    impact.approval = approved ? "Approved" : "Returned";
    if (impact.electionDecision) impact.electionDecision.status = approved ? "Approved" : "Returned";
  });
  event.status = approved ? "Approved" : "Election required";
  event.settlementStage = event.status;
  appendAudit(event, approved ? "Checker approval recorded" : "Checker returned event", note, actor, { previousValue: "Awaiting approval", newValue: event.status, reason: note });
}

export function simulateInstruction(event: EventData, status: string, actor: any): void {
  if (actor.role !== "Operations Analyst") throw new Error("Only an Operations Analyst can prepare a simulated instruction.");
  if (event.processingType === "Mandatory") throw new Error("Mandatory events do not require an outbound instruction; proceed directly to settlement monitoring.");
  const canIssue = event.status === "Approved";
  if (!canIssue) throw new Error(`Instruction is blocked while the event is ${event.status}. Approval and calculation controls must complete first.`);
  if (status !== "SIMULATED - NOT SENT") throw new Error("The POC only supports the explicit status SIMULATED - NOT SENT.");
  const electionLines = event.impacts.map((impact: any) => `${impact.account}: ${impact.electionDecision?.optionLabel ?? "Mandatory processing"}; quantity ${impact.electionDecision?.quantityElected ?? impact.expectedSecurityQuantity ?? 0}`).join("\n");
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
  if (!["Operations Analyst", "Operations Manager"].includes(actor.role)) throw new Error("Only Operations Analysts or Managers can record settlement results.");
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
    if (!exists) event.tasks.push(task(`task-${event.id}-break`, event.id, event.reference, "Investigate settlement difference", "Aisha Mehta", "Today · 16:00", "High", "Reconciliation", `${classification}: expected and actual settlement results differ.`, "Open", "", "CA-CONTROL-007"));
  }
  event.settlementStage = event.status;
  appendAudit(event, "Settlement reconciled", body.note, actor, { previousValue: "Awaiting settlement", newValue: event.status, reason: classification });
}

export async function ensureCorporateActionSeedData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const { corporateActionEventsTable, db } = await import("@workspace/db");
      const [existing] = await db.select().from(corporateActionEventsTable).limit(1);
      if (existing && (existing.data as any).seedVersion === SEED_VERSION) return;
      if (existing) await db.delete(corporateActionEventsTable);
      await db.insert(corporateActionEventsTable).values(preloadedEvents.map((event) => ({ id: event.id, data: event })));
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
    const event = clone(row.data as EventData);
    refreshValidation(event);
    return event;
  });
}

export async function getCorporateActionEvent(id: string): Promise<EventData | null> {
  await ensureCorporateActionSeedData();
  const { corporateActionEventsTable, db } = await import("@workspace/db");
  const [row] = await db.select().from(corporateActionEventsTable).where(eq(corporateActionEventsTable.id, id));
  if (!row) return null;
  const event = clone(row.data as EventData);
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
  const { notice, terms, impacts, options, instruction, reconciliation, tasks, audit, positions, calculation, validation, ...summary } = event;
  return summary;
}

export function buildDashboard(events: EventData[]): EventData {
  const allTasks = events.flatMap((event) => event.tasks ?? []);
  const activity = events.flatMap((event) => event.audit ?? []).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6);
  return {
    totalEvents: events.length,
    needsReview: events.filter((event) => ["Received", "Under review"].includes(event.status)).length,
    dueToday: allTasks.filter((current) => current.status === "Open" && current.due.startsWith("Today")).length,
    openTasks: allTasks.filter((current) => current.status === "Open").length,
    breaks: events.filter((event) => event.reconciliation?.classification && event.reconciliation.classification !== "Matched" && event.reconciliation.classification !== "Not due").length,
    recentActivity: activity,
  };
}