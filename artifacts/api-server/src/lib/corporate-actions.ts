import { desc, eq } from "drizzle-orm";
import { corporateActionEventsTable, db } from "@workspace/db";

type EventData = Record<string, any>;

const now = () => new Date().toISOString();

const makeAudit = (
  eventId: string,
  action: string,
  detail: string,
  actor = "Corporate Actions Analyst",
) => ({
  id: `audit-${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  eventId,
  action,
  actor,
  timestamp: now(),
  detail,
});

const seedEvents: EventData[] = [
  {
    id: "evt-aurora-div",
    reference: "CA-2026-0814-AX",
    issuer: "Aurora Global plc",
    security: "ISIN GB00AUR00018 · AUR",
    eventType: "Cash dividend",
    processingType: "Mandatory",
    status: "Needs review",
    risk: "High",
    marketDeadline: "27 Aug 2026 · 16:00 BST",
    internalDeadline: "27 Aug 2026 · 11:00 BST",
    affectedAccounts: 3,
    amount: 186750,
    currency: "GBP",
    notice: {
      documentName: "Aurora_Global_FY26_Interim_Dividend_v2.pdf",
      source: "Custodian portal",
      receivedAt: "2026-08-26T05:42:00.000Z",
      version: "v2 · amended",
      role: "Amendment",
      excerpt:
        "The board declares an interim cash dividend of GBP 0.425 per ordinary share. Payment date revised to 18 September 2026.",
    },
    terms: [
      { key: "rate", label: "Cash rate", value: "GBP 0.4250", page: "p. 1", evidence: "“interim cash dividend of GBP 0.425 per ordinary share”", confidence: 0.98, reviewStatus: "Validated" },
      { key: "recordDate", label: "Record date", value: "28 Aug 2026", page: "p. 1", evidence: "“record date: 28 August 2026”", confidence: 0.97, reviewStatus: "Validated" },
      { key: "paymentDate", label: "Payment date", value: "18 Sep 2026", page: "p. 1", evidence: "“payment date revised to 18 September 2026”", confidence: 0.99, reviewStatus: "Needs review" },
      { key: "withholding", label: "Withholding tax", value: "See market guidance", page: "p. 3", evidence: "Tax statement refers to local investor documentation.", confidence: 0.62, reviewStatus: "Needs review" },
    ],
    impacts: [
      { id: "imp-aur-1", fund: "Northbridge Income Fund", account: "CUST-4081", eligibleQuantity: 220000, formula: "220,000 × GBP 0.4250", expected: 93500, currency: "GBP", status: "Calculated", election: null, approval: "Not required" },
      { id: "imp-aur-2", fund: "Northbridge Balanced Fund", account: "CUST-9227", eligibleQuantity: 150000, formula: "150,000 × GBP 0.4250", expected: 63750, currency: "GBP", status: "Calculated", election: null, approval: "Not required" },
      { id: "imp-aur-3", fund: "Sovereign Select Mandate", account: "CUST-1138", eligibleQuantity: 69529.41, formula: "69,529.41 × GBP 0.4250", expected: 29500, currency: "GBP", status: "Calculated", election: null, approval: "Not required" },
    ],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "—", content: "Mandatory cash event. No instruction is submitted." },
    reconciliation: { expected: 186750, actual: 0, difference: -186750, tolerance: 5, status: "Awaiting settlement", note: "Payment date amended; expected settlement recalculated." },
    tasks: [
      { id: "task-aur-1", eventId: "evt-aurora-div", title: "Validate amended payment date", detail: "Confirm the amendment supersedes notice version v1 before releasing downstream task dates.", priority: "High", owner: "M. Shah", due: "Today · 11:00 BST", status: "Open", category: "Term validation" },
      { id: "task-aur-2", eventId: "evt-aurora-div", title: "Confirm withholding guidance", detail: "Attach market guidance or escalate the ambiguous withholding statement.", priority: "Medium", owner: "Tax Operations", due: "27 Aug · 09:00 BST", status: "Open", category: "Risk" },
    ],
    audit: [
      { id: "audit-aur-1", eventId: "evt-aurora-div", action: "Amendment linked", actor: "System", timestamp: "2026-08-26T05:44:00.000Z", detail: "Version v2 identified as an amendment to CA-2026-0814-AX." },
      { id: "audit-aur-2", eventId: "evt-aurora-div", action: "Impact recalculated", actor: "System", timestamp: "2026-08-26T05:45:00.000Z", detail: "Expected cash updated using the amended GBP 0.4250 rate." },
    ],
  },
  {
    id: "evt-delta-split",
    reference: "CA-2026-0809-DL",
    issuer: "Delta Grid Technologies",
    security: "ISIN US24703D1072 · DGT",
    eventType: "Stock split",
    processingType: "Mandatory",
    status: "Ready for settlement",
    risk: "Low",
    marketDeadline: "28 Aug 2026 · EOD",
    internalDeadline: "27 Aug 2026 · 15:00 ET",
    affectedAccounts: 2,
    amount: 420000,
    currency: "Shares",
    notice: { documentName: "DGT_4_for_1_Split_Notice.pdf", source: "Issuer agent", receivedAt: "2026-08-25T14:20:00.000Z", version: "v1", role: "New", excerpt: "Each holder receives three additional shares for every share held at close of business on the record date." },
    terms: [
      { key: "ratio", label: "Split ratio", value: "4 : 1", page: "p. 1", evidence: "“four-for-one forward split”", confidence: 0.99, reviewStatus: "Validated" },
      { key: "effectiveDate", label: "Effective date", value: "28 Aug 2026", page: "p. 1", evidence: "“effective before market open on 28 August 2026”", confidence: 0.99, reviewStatus: "Validated" },
    ],
    impacts: [
      { id: "imp-dgt-1", fund: "Northbridge Growth Fund", account: "CUST-7019", eligibleQuantity: 80000, formula: "80,000 × 4", expected: 320000, currency: "Shares", status: "Calculated", election: null, approval: "Validated" },
      { id: "imp-dgt-2", fund: "Sovereign Select Mandate", account: "CUST-1138", eligibleQuantity: 25000, formula: "25,000 × 4", expected: 100000, currency: "Shares", status: "Calculated", election: null, approval: "Validated" },
    ],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "—", content: "Mandatory position adjustment. No market instruction required." },
    reconciliation: { expected: 420000, actual: 420000, difference: 0, tolerance: 1, status: "Matched", note: "Custodian confirmation received." },
    tasks: [],
    audit: [{ id: "audit-dgt-1", eventId: "evt-delta-split", action: "Settlement matched", actor: "Reconciliation", timestamp: "2026-08-26T07:12:00.000Z", detail: "Expected and booked share quantities agree." }],
  },
  {
    id: "evt-lumen-bonus",
    reference: "CA-2026-0820-LH",
    issuer: "Lumen Health Systems plc",
    security: "ISIN GB00LUM00027 · LHS",
    eventType: "Stock dividend / bonus issue",
    processingType: "Mandatory",
    status: "Ready for settlement",
    risk: "Medium",
    marketDeadline: "29 Aug 2026 · EOD",
    internalDeadline: "28 Aug 2026 · 12:00 BST",
    affectedAccounts: 2,
    amount: 5617,
    currency: "Shares",
    notice: { documentName: "LHS_Bonus_Issue_Notice.pdf", source: "Issuer agent", receivedAt: "2026-08-26T03:18:00.000Z", version: "v1", role: "New", excerpt: "One bonus share will be issued for every twenty ordinary shares held on the record date. Fractional entitlements will be rounded down and paid as cash in lieu where applicable." },
    terms: [
      { key: "bonusRatio", label: "Bonus ratio", value: "1 : 20", page: "p. 1", evidence: "“one bonus share for every twenty ordinary shares”", confidence: 0.98, reviewStatus: "Validated" },
      { key: "recordDate", label: "Record date", value: "28 Aug 2026", page: "p. 1", evidence: "“holders on the register at close of business on 28 August 2026”", confidence: 0.97, reviewStatus: "Validated" },
      { key: "fractionRule", label: "Fraction rule", value: "Round down; cash in lieu", page: "p. 2", evidence: "“fractional entitlements will be rounded down and paid as cash in lieu”", confidence: 0.95, reviewStatus: "Validated" },
    ],
    impacts: [
      { id: "imp-lhs-1", fund: "Northbridge Growth Fund", account: "CUST-7019", eligibleQuantity: 100000, formula: "100,000 ÷ 20", expected: 5000, currency: "Shares", status: "Calculated", election: null, approval: "Validated" },
      { id: "imp-lhs-2", fund: "Northbridge Balanced Fund", account: "CUST-9227", eligibleQuantity: 12345, formula: "(12,345 ÷ 20), rounded down", expected: 617, currency: "Shares", status: "Calculated", election: null, approval: "Validated" },
    ],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "—", content: "Mandatory bonus issue. No election or market instruction is required." },
    reconciliation: { expected: 5617, actual: 0, difference: -5617, tolerance: 1, status: "Awaiting settlement", note: "Additional shares will post automatically after the record date." },
    tasks: [{ id: "task-lhs-1", eventId: "evt-lumen-bonus", title: "Confirm fractional cash-in-lieu handling", detail: "Validate that the 0.25-share fractional entitlement is routed to cash-in-lieu processing.", priority: "Medium", owner: "Fund Accounting", due: "29 Aug · 12:00 BST", status: "Open", category: "Fractional entitlement" }],
    audit: [{ id: "audit-lhs-1", eventId: "evt-lumen-bonus", action: "Bonus issue validated", actor: "System", timestamp: "2026-08-26T03:22:00.000Z", detail: "Mandatory 1-for-20 bonus issue validated with round-down and cash-in-lieu rules." }],
  },
  {
    id: "evt-verdant-rights",
    reference: "CA-2026-0821-VR",
    issuer: "Verdant Renewables SA",
    security: "ISIN FR001400VRN5 · VRN",
    eventType: "Rights issue",
    processingType: "Voluntary",
    status: "Election required",
    risk: "High",
    marketDeadline: "29 Aug 2026 · 17:30 CEST",
    internalDeadline: "29 Aug 2026 · 10:00 CEST",
    affectedAccounts: 2,
    amount: 40200,
    currency: "EUR",
    notice: { documentName: "VRN_Rights_Offer_Circular.pdf", source: "Custodian portal", receivedAt: "2026-08-26T04:06:00.000Z", version: "v1", role: "New", excerpt: "One subscription right is granted for every five existing shares. Subscription price is EUR 12.40 per new share." },
    terms: [
      { key: "rightsRatio", label: "Rights ratio", value: "1 for 5", page: "p. 2", evidence: "“one (1) subscription right for every five (5) shares”", confidence: 0.96, reviewStatus: "Validated" },
      { key: "subscriptionPrice", label: "Subscription price", value: "EUR 12.40", page: "p. 2", evidence: "“issue price of twelve euros and forty cents”", confidence: 0.99, reviewStatus: "Validated" },
      { key: "deadline", label: "Market deadline", value: "29 Aug 2026 · 17:30 CEST", page: "p. 4", evidence: "“instructions must be received by 17:30 CEST”", confidence: 0.94, reviewStatus: "Validated" },
    ],
    impacts: [
      { id: "imp-vrn-1", fund: "Northbridge Balanced Fund", account: "CUST-9227", eligibleQuantity: 12000, formula: "(12,000 ÷ 5) × EUR 12.40", expected: 29760, currency: "EUR", status: "Awaiting election", election: null, approval: "Pending" },
      { id: "imp-vrn-2", fund: "Northbridge Growth Fund", account: "CUST-7019", eligibleQuantity: 4200, formula: "(4,200 ÷ 5) × EUR 12.40", expected: 10416, currency: "EUR", status: "Awaiting election", election: null, approval: "Pending" },
    ],
    options: [
      { id: "subscribe", label: "Subscribe", description: "Exercise all eligible rights at the subscription price.", result: "Funding requirement calculated per account", default: false },
      { id: "lapse", label: "Allow to lapse", description: "Do not participate. Rights may expire without value.", result: "No funding; potential value loss", default: true },
    ],
    instruction: { status: "Draft — not submitted", destination: "Euroclear instruction gateway", reference: "DRAFT-VRN-0821", generatedAt: "2026-08-26T07:30:00.000Z", content: "DRAFT ONLY — election instruction will be populated after fund-level approval." },
    reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 1, status: "Not due", note: "Settlement expected after election and subscription." },
    tasks: [
      { id: "task-vrn-1", eventId: "evt-verdant-rights", title: "Obtain fund election", detail: "Northbridge Balanced Fund election is required before the internal deadline.", priority: "High", owner: "Fund Manager", due: "29 Aug · 10:00 CEST", status: "Open", category: "Election" },
      { id: "task-vrn-2", eventId: "evt-verdant-rights", title: "Obtain fund election", detail: "Northbridge Growth Fund election is required before the internal deadline.", priority: "High", owner: "Fund Manager", due: "29 Aug · 10:00 CEST", status: "Open", category: "Election" },
    ],
    audit: [{ id: "audit-vrn-1", eventId: "evt-verdant-rights", action: "Election checklist created", actor: "System", timestamp: "2026-08-26T04:09:00.000Z", detail: "Two affected accounts require a fund-level election." }],
  },
  {
    id: "evt-meridian-tender",
    reference: "CA-2026-0818-MT",
    issuer: "Meridian Infrastructure Ltd",
    security: "ISIN AU0000MERID2 · MRL",
    eventType: "Tender offer",
    processingType: "Voluntary",
    status: "Instruction pending",
    risk: "Medium",
    marketDeadline: "30 Aug 2026 · 19:00 AEST",
    internalDeadline: "30 Aug 2026 · 09:00 AEST",
    affectedAccounts: 1,
    amount: 68000,
    currency: "AUD",
    notice: { documentName: "MRL_OffMarket_Tender.pdf", source: "Agent message", receivedAt: "2026-08-25T22:10:00.000Z", version: "v1", role: "New", excerpt: "The company offers to acquire up to 20% of each holder’s position at AUD 8.50 per share." },
    terms: [
      { key: "offerPrice", label: "Offer price", value: "AUD 8.50", page: "p. 1", evidence: "“cash consideration of AUD 8.50 per share”", confidence: 0.99, reviewStatus: "Validated" },
      { key: "maximum", label: "Maximum acceptance", value: "20% of position", page: "p. 2", evidence: "“up to twenty per cent of each registered holding”", confidence: 0.93, reviewStatus: "Validated" },
    ],
    impacts: [
      { id: "imp-mrl-1", fund: "Sovereign Select Mandate", account: "CUST-1138", eligibleQuantity: 40000, formula: "(40,000 × 20%) × AUD 8.50", expected: 68000, currency: "AUD", status: "Election received", election: "Tender 20%", approval: "Approved" },
    ],
    options: [
      { id: "tender", label: "Tender maximum", description: "Tender up to 20% of the eligible position.", result: "Expected cash: AUD 68,000", default: false },
      { id: "decline", label: "Do not tender", description: "Retain the current holding.", result: "No cash proceeds", default: true },
    ],
    instruction: { status: "Draft — ready for checker", destination: "Custodian portal", reference: "DRAFT-MRL-0818", generatedAt: "2026-08-26T06:40:00.000Z", content: "DRAFT — tender 8,000 shares at AUD 8.50. Awaiting simulated submission." },
    reconciliation: { expected: 68000, actual: 0, difference: -68000, tolerance: 1, status: "Not due", note: "Tender acceptance outcome is pending." },
    tasks: [{ id: "task-mrl-1", eventId: "evt-meridian-tender", title: "Simulate instruction confirmation", detail: "Checker approval complete. Move the DRAFT instruction to a simulated pending or accepted status.", priority: "Medium", owner: "M. Shah", due: "30 Aug · 09:00 AEST", status: "Open", category: "Instruction" }],
    audit: [{ id: "audit-mrl-1", eventId: "evt-meridian-tender", action: "Checker approval recorded", actor: "Team Lead", timestamp: "2026-08-26T06:35:00.000Z", detail: "Tender election approved for the Sovereign Select Mandate." }],
  },
  {
    id: "evt-northstar-merger",
    seedRevision: 2,
    reference: "CA-2026-0824-NS",
    issuer: "Northstar Data Group Inc.",
    security: "ISIN US66702N1046 · NSD",
    eventType: "Mixed cash/share merger",
    processingType: "Mandatory with options",
    status: "Election required",
    risk: "High",
    marketDeadline: "2 Sep 2026 · 17:00 ET",
    internalDeadline: "1 Sep 2026 · 12:00 ET",
    affectedAccounts: 2,
    amount: 228600,
    currency: "USD",
    cashAmount: 228600,
    cashCurrency: "USD",
    shareAmount: 4445,
    shareLabel: "Nexus Holdings shares",
    notice: { documentName: "NSD_Merger_Consideration_Notice.pdf", source: "Custodian portal", receivedAt: "2026-08-26T06:02:00.000Z", version: "v1", role: "New", excerpt: "At completion, each NSD share will be exchanged for USD 18.00 in cash plus 0.35 shares of the acquiring company. Holders may elect all-cash consideration subject to proration." },
    terms: [
      { key: "exchangeRatio", label: "Share exchange ratio", value: "0.35 acquiring shares", page: "p. 3", evidence: "“0.35 shares of the acquiring company for each NSD share”", confidence: 0.98, reviewStatus: "Validated" },
      { key: "cashConsideration", label: "Cash consideration", value: "USD 18.00 per share", page: "p. 3", evidence: "“cash consideration of USD 18.00 per NSD share”", confidence: 0.99, reviewStatus: "Validated" },
      { key: "electionDeadline", label: "Election deadline", value: "1 Sep 2026 · 12:00 ET", page: "p. 8", evidence: "“all-cash elections must be received by 12:00 ET on 1 September 2026”", confidence: 0.96, reviewStatus: "Validated" },
    ],
    impacts: [
      { id: "imp-nsd-1", fund: "Northbridge Income Fund", account: "CUST-4081", eligibleQuantity: 8500, formula: "8,500 × USD 18.00; 8,500 × 0.35 acquiring shares", expected: 153000, currency: "USD", expectedCash: 153000, cashCurrency: "USD", expectedShares: 2975, shareLabel: "Nexus Holdings shares", status: "Awaiting election", election: null, approval: "Pending" },
      { id: "imp-nsd-2", fund: "Sovereign Select Mandate", account: "CUST-1138", eligibleQuantity: 4200, formula: "4,200 × USD 18.00; 4,200 × 0.35 acquiring shares", expected: 75600, currency: "USD", expectedCash: 75600, cashCurrency: "USD", expectedShares: 1470, shareLabel: "Nexus Holdings shares", status: "Awaiting election", election: null, approval: "Pending" },
    ],
    options: [
      { id: "mixed", label: "Cash and shares", description: "Accept the default mixed consideration of USD 18.00 plus 0.35 acquiring shares per NSD share.", result: "Expected cash: USD 228,600 plus 4,445 Nexus Holdings shares", default: true },
      { id: "cash", label: "All cash", description: "Elect cash consideration, subject to the merger agreement's proration.", result: "Cash election recorded for checker review", default: false },
    ],
    instruction: { status: "Draft — not submitted", destination: "Custodian portal", reference: "DRAFT-NSD-0824", generatedAt: "2026-08-26T06:20:00.000Z", content: "DRAFT ONLY — merger consideration instruction will be populated after all account elections and approval." },
    reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 1, status: "Not due", note: "Completion and consideration delivery are pending." },
    tasks: [
      { id: "task-nsd-1", eventId: "evt-northstar-merger", title: "Obtain merger consideration election", detail: "Northbridge Income Fund must confirm mixed or all-cash consideration before the internal deadline.", priority: "High", owner: "Fund Manager", due: "1 Sep · 12:00 ET", status: "Open", category: "Election" },
      { id: "task-nsd-2", eventId: "evt-northstar-merger", title: "Obtain merger consideration election", detail: "Sovereign Select Mandate must confirm mixed or all-cash consideration before the internal deadline.", priority: "High", owner: "Fund Manager", due: "1 Sep · 12:00 ET", status: "Open", category: "Election" },
    ],
    audit: [{ id: "audit-nsd-1", eventId: "evt-northstar-merger", action: "Mixed consideration terms validated", actor: "System", timestamp: "2026-08-26T06:25:00.000Z", detail: "Mandatory merger with an all-cash election option and share fractional handling pending." }],
  },
  {
    id: "evt-harbor-break",
    reference: "CA-2026-0812-HB",
    issuer: "Harbor Utilities Group",
    security: "ISIN US41141U1016 · HUG",
    eventType: "Cash dividend",
    processingType: "Mandatory",
    status: "Settlement break",
    risk: "High",
    marketDeadline: "26 Aug 2026 · 16:00 ET",
    internalDeadline: "26 Aug 2026 · 10:00 ET",
    affectedAccounts: 2,
    amount: 152000,
    currency: "USD",
    notice: { documentName: "HUG_Q3_Cash_Dividend_Notice.pdf", source: "Custodian portal", receivedAt: "2026-08-22T13:40:00.000Z", version: "v1", role: "New", excerpt: "A cash dividend of USD 0.80 per ordinary share was payable on 26 August 2026. Custodian postings show a partial settlement." },
    terms: [
      { key: "rate", label: "Cash rate", value: "USD 0.8000", page: "p. 1", evidence: "“cash dividend of USD 0.80 per ordinary share”", confidence: 0.99, reviewStatus: "Validated" },
      { key: "paymentDate", label: "Payment date", value: "26 Aug 2026", page: "p. 1", evidence: "“payable on 26 August 2026”", confidence: 0.98, reviewStatus: "Validated" },
    ],
    impacts: [
      { id: "imp-hug-1", fund: "Northbridge Income Fund", account: "CUST-4081", eligibleQuantity: 125000, formula: "125,000 × USD 0.8000", expected: 100000, currency: "USD", status: "Calculated", election: null, approval: "Not required" },
      { id: "imp-hug-2", fund: "Northbridge Balanced Fund", account: "CUST-9227", eligibleQuantity: 65000, formula: "65,000 × USD 0.8000", expected: 52000, currency: "USD", status: "Calculated", election: null, approval: "Not required" },
    ],
    options: [],
    instruction: { status: "Not required", destination: "N/A", reference: "N/A", generatedAt: "—", content: "Mandatory cash event. No instruction is submitted." },
    reconciliation: { expected: 152000, actual: 151500, difference: -500, tolerance: 5, status: "Break", note: "Partial settlement received; USD 500 remains outstanding and requires custodian investigation." },
    tasks: [{ id: "task-hug-1", eventId: "evt-harbor-break", title: "Investigate partial dividend settlement", detail: "Trace the USD 500 shortfall against the custodian cash statement and record the resolution.", priority: "High", owner: "Reconciliation", due: "Today · 15:00 ET", status: "Open", category: "Settlement break" }],
    audit: [
      { id: "audit-hug-1", eventId: "evt-harbor-break", action: "Settlement break recorded", actor: "Reconciliation", timestamp: "2026-08-26T08:10:00.000Z", detail: "Expected USD 152,000; custodian posted USD 151,500." },
      { id: "audit-hug-2", eventId: "evt-harbor-break", action: "Break investigation opened", actor: "System", timestamp: "2026-08-26T08:12:00.000Z", detail: "A reconciliation task was created for the USD 500 outstanding amount." },
    ],
  },
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function ensureCorporateActionSeedData(): Promise<void> {
  const existing = await db
    .select({ id: corporateActionEventsTable.id, data: corporateActionEventsTable.data })
    .from(corporateActionEventsTable);
  const existingById = new Map(existing.map((row) => [row.id, row.data]));
  const existingIds = new Set(existingById.keys());
  const missingEvents = seedEvents.filter((event) => !existingIds.has(event.id));
  if (missingEvents.length > 0) {
    await db.insert(corporateActionEventsTable).values(
      missingEvents.map((event) => ({ id: event.id, data: event })),
    );
  }

  const revisedEvents = seedEvents.filter((event) => {
    const storedEvent = existingById.get(event.id);
    return event.seedRevision && storedEvent?.seedRevision !== event.seedRevision;
  });
  await Promise.all(
    revisedEvents.map((event) =>
      db
        .update(corporateActionEventsTable)
        .set({ data: event })
        .where(eq(corporateActionEventsTable.id, event.id)),
    ),
  );
}

export async function getCorporateActionEvents(): Promise<EventData[]> {
  await ensureCorporateActionSeedData();
  const rows = await db.select().from(corporateActionEventsTable).orderBy(desc(corporateActionEventsTable.updatedAt));
  return rows.map((row) => clone(row.data));
}

export async function getCorporateActionEvent(id: string): Promise<EventData | null> {
  await ensureCorporateActionSeedData();
  const [row] = await db.select().from(corporateActionEventsTable).where(eq(corporateActionEventsTable.id, id));
  return row ? clone(row.data) : null;
}

export async function saveCorporateActionEvent(event: EventData): Promise<EventData> {
  await db
    .update(corporateActionEventsTable)
    .set({ data: event })
    .where(eq(corporateActionEventsTable.id, event.id));
  return clone(event);
}

export function appendAudit(event: EventData, action: string, detail: string, actor?: string): void {
  event.audit = [makeAudit(event.id, action, detail, actor), ...(event.audit ?? [])];
}

export function toSummary(event: EventData): EventData {
  const { notice, terms, impacts, options, instruction, reconciliation, tasks, audit, ...summary } = event;
  return summary;
}

export function buildDashboard(events: EventData[]): EventData {
  const allTasks = events.flatMap((event) => event.tasks ?? []);
  const activity = events.flatMap((event) => event.audit ?? []).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6);
  return {
    totalEvents: events.length,
    needsReview: events.filter((event) => event.status === "Needs review").length,
    dueToday: allTasks.filter((task) => task.status === "Open" && task.due.startsWith("Today")).length,
    openTasks: allTasks.filter((task) => task.status === "Open").length,
    breaks: events.filter((event) => event.reconciliation?.status === "Break").length,
    recentActivity: activity,
  };
}