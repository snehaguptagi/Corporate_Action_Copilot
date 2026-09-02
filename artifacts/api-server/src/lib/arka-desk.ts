import { desc, eq } from "drizzle-orm";
import {
  arkaDeskSubmissionsTable,
  arkaMutualFundSchemesTable,
  arkaSchemeHoldingsTable,
  db,
} from "@workspace/db";
import { divideBigIntFloor } from "./calculations";
import { SEED_DATE_ANCHOR } from "./seed-clock";

const CURRENT_PRICE_PAISE = 12_000n;
const SUBSCRIPTION_PRICE_PAISE = 8_500n;
const RIGHTS_NUMERATOR = 1n;
const RIGHTS_DENOMINATOR = 5n;
const CAP_PERCENT = 10n;
const CAP_BASE = 100n;
const FOCUSED_MAX_RIGHTS = 1_027_007n;
const FOCUSED_POST_EXERCISE_PERCENT = 10.77;
const TERP_NUMERATOR = CURRENT_PRICE_PAISE * RIGHTS_DENOMINATOR + SUBSCRIPTION_PRICE_PAISE * RIGHTS_NUMERATOR;
const TERP_DENOMINATOR = RIGHTS_DENOMINATOR + RIGHTS_NUMERATOR;
const DAY_MS = 24 * 60 * 60 * 1000;
const dateAtOffset = (offset: number) => new Date(Date.UTC(
  SEED_DATE_ANCHOR.getUTCFullYear(),
  SEED_DATE_ANCHOR.getUTCMonth(),
  SEED_DATE_ANCHOR.getUTCDate() + offset,
));
const displayDate = (date: Date) => new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
}).format(date);
const localIsoDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const previousTradingDay = (date: Date) => {
  const prior = new Date(date.getTime() - DAY_MS);
  while ([0, 6].includes(prior.getUTCDay())) prior.setUTCDate(prior.getUTCDate() - 1);
  return prior;
};
const arkaRecordDate = dateAtOffset(10);

export const ARKA_SCHEME_SEED = [
  { id: "arka-large-cap", schemeCode: "ARKA-LC", schemeName: "Arka Large Cap Fund", category: "Large cap", aumPaise: 8_400_000_000_000n, navPaise: 7_250, cashBudgetPaise: 210_000_000_000n, eligibilityStatus: "Eligible", quantity: 1_200_000n },
  { id: "arka-flexi-cap", schemeCode: "ARKA-FC", schemeName: "Arka Flexi Cap Fund", category: "Flexi cap", aumPaise: 5_200_000_000_000n, navPaise: 5_680, cashBudgetPaise: 130_000_000_000n, eligibilityStatus: "Eligible", quantity: 800_000n },
  { id: "arka-small-cap", schemeCode: "ARKA-SC", schemeName: "Arka Small Cap Fund", category: "Small cap", aumPaise: 2_100_000_000_000n, navPaise: 9_430, cashBudgetPaise: 1_800_000_000n, eligibilityStatus: "Eligible", quantity: 1_500_000n },
  { id: "arka-focused-25", schemeCode: "ARKA-F25", schemeName: "Arka Focused 25 Fund", category: "Focused", aumPaise: 1_150_000_000_000n, navPaise: 4_820, cashBudgetPaise: 40_000_000_000n, eligibilityStatus: "Eligible", quantity: 9_000_000n },
  { id: "arka-infrastructure", schemeCode: "ARKA-INF", schemeName: "Arka Infrastructure Fund", category: "Sectoral", aumPaise: 640_000_000_000n, navPaise: 3_890, cashBudgetPaise: 22_000_000_000n, eligibilityStatus: "Eligible", quantity: 500_002n },
  { id: "arka-nifty-50", schemeCode: "ARKA-N50", schemeName: "Arka Nifty 50 Index Fund", category: "Index", aumPaise: 3_300_000_000_000n, navPaise: 2_140, cashBudgetPaise: 18_000_000_000n, eligibilityStatus: "Eligible", quantity: 200_000n },
  { id: "arka-value", schemeCode: "ARKA-VALUE", schemeName: "Arka Value Fund", category: "Value", aumPaise: 1_480_000_000_000n, navPaise: 6_120, cashBudgetPaise: null, eligibilityStatus: "Excluded", exclusionReason: "Failed record-date test: sold 6,00,000 equity shares before ex-date", quantity: 600_000n },
  { id: "arka-elss-tax-saver", schemeCode: "ARKA-ELSS", schemeName: "Arka ELSS Tax Saver", category: "ELSS", aumPaise: 2_650_000_000_000n, navPaise: 8_840, cashBudgetPaise: null, eligibilityStatus: "Excluded", exclusionReason: "Failed equity-ISIN test: holds issuer NCD only", quantity: 0n },
  { id: "arka-mid-cap", schemeCode: "ARKA-MC", schemeName: "Arka Mid Cap Fund", category: "Mid cap", aumPaise: 4_100_000_000_000n, navPaise: 6_710, cashBudgetPaise: null, eligibilityStatus: "Excluded", exclusionReason: "Failed equity-ISIN test: no Bharat Renewables equity holding", quantity: 0n },
  { id: "arka-banking-financial", schemeCode: "ARKA-BF", schemeName: "Arka Banking & Financial", category: "Banking", aumPaise: 1_900_000_000_000n, navPaise: 4_470, cashBudgetPaise: null, eligibilityStatus: "Excluded", exclusionReason: "Failed folio-active test: folio inactive", quantity: 0n },
] as const;

export const ARKA_SCHEME_HOLDING_COUNTS: Record<string, number> = {
  "arka-large-cap": 112,
  "arka-flexi-cap": 84,
  "arka-small-cap": 58,
  "arka-focused-25": 34,
  "arka-infrastructure": 42,
  "arka-nifty-50": 53,
  "arka-value": 61,
  "arka-elss-tax-saver": 47,
  "arka-mid-cap": 76,
  "arka-banking-financial": 38,
};

export const ARKA_EVENT = {
  reference: "CA-IN-2026-0901-BR",
  issuer: "Bharat Renewables Ltd",
  securityName: "Bharat Renewables Ltd",
  ticker: "BHRENEW",
  isin: "INE0BRR01019",
  reIsin: "INE0BRR02019",
  securityId: "IN-BR-001",
  exchange: "NSE",
  currency: "INR",
  cmpPaise: CURRENT_PRICE_PAISE,
  subscriptionPricePaise: SUBSCRIPTION_PRICE_PAISE,
  ratioNumerator: RIGHTS_NUMERATOR,
  ratioDenominator: RIGHTS_DENOMINATOR,
  receivedDate: displayDate(dateAtOffset(12)),
  recordDate: displayDate(arkaRecordDate),
  recordDateIso: localIsoDate(arkaRecordDate),
  exRightsDate: displayDate(previousTradingDay(arkaRecordDate)),
  fundDeadline: `${displayDate(dateAtOffset(14))} · 15:00 IST`,
  marketDeadline: `${displayDate(dateAtOffset(15))} · 15:30 IST`,
  settlementDate: displayDate(dateAtOffset(22)),
} as const;

/** Shared deterministic holding projection used by the Bharat workbench case. */
export function projectArkaBharatPositions() {
  return ARKA_SCHEME_SEED.map((scheme) => ({
    id: `POS-BHARAT-${scheme.id}`,
    fund: scheme.schemeName,
    account: `ARKA-${scheme.schemeCode}-001`,
    isin: ARKA_EVENT.isin,
    securityId: ARKA_EVENT.securityId,
    settledQuantity: Number(scheme.quantity),
    unsettledQuantity: 0,
    eligibleQuantity: Number(scheme.quantity),
    positionDate: ARKA_EVENT.recordDateIso,
    eligibilityStatus: scheme.eligibilityStatus === "Eligible" ? "Eligible" : "Excluded",
    dataQualityWarning: "exclusionReason" in scheme ? scheme.exclusionReason : "",
  }));
}

const paiseToRupees = (value: bigint): number => Number(value) / 100;
const fractionToRupees = (numerator: bigint, denominator: bigint, decimals = 4): number =>
  Number((Number(numerator) / Number(denominator) / 100).toFixed(decimals));
const percentOf = (numerator: bigint, denominator: bigint): number =>
  Number((Number(numerator) * 100 / Number(denominator)).toFixed(2));
const paiseToCrore = (value: bigint): number => Number(value) / 1_000_000_000;

export function calculateArkaRightsTerms() {
  return {
    terp: fractionToRupees(TERP_NUMERATOR, TERP_DENOMINATOR),
    rightValue: fractionToRupees(TERP_NUMERATOR - SUBSCRIPTION_PRICE_PAISE * TERP_DENOMINATOR, TERP_DENOMINATOR),
    dilution: fractionToRupees(CURRENT_PRICE_PAISE * TERP_DENOMINATOR - TERP_NUMERATOR, TERP_DENOMINATOR),
  };
}

function rightsForQuantity(quantity: bigint): bigint {
  return divideBigIntFloor(quantity * RIGHTS_NUMERATOR, RIGHTS_DENOMINATOR);
}

function capMaximumRights(quantity: bigint, aumPaise: bigint): bigint {
  const numerator = CAP_PERCENT * aumPaise * TERP_DENOMINATOR - CAP_BASE * TERP_NUMERATOR * quantity;
  const denominator = CAP_BASE * TERP_NUMERATOR - CAP_PERCENT * SUBSCRIPTION_PRICE_PAISE * TERP_DENOMINATOR;
  if (numerator <= 0n) return 0n;
  return divideBigIntFloor(numerator, denominator);
}

export function calculateArkaFixtureValues() {
  const focused = ARKA_SCHEME_SEED.find((scheme) => scheme.id === "arka-focused-25");
  const smallCap = ARKA_SCHEME_SEED.find((scheme) => scheme.id === "arka-small-cap");
  if (!focused || !smallCap || smallCap.cashBudgetPaise === null) {
    throw new Error("Arka fixture schemes are incomplete.");
  }
  const totalRights = ARKA_SCHEME_SEED.reduce(
    (total, scheme) => scheme.eligibilityStatus === "Eligible" ? total + rightsForQuantity(scheme.quantity) : total,
    0n,
  );
  return {
    ...calculateArkaRightsTerms(),
    totalRights: Number(totalRights),
    totalExerciseCashCrore: Number(totalRights * SUBSCRIPTION_PRICE_PAISE) / 100 / 10_000_000,
    focusedMaximumRights: Number(FOCUSED_MAX_RIGHTS),
    smallCapAffordableRights: Number(divideBigIntFloor(smallCap.cashBudgetPaise, SUBSCRIPTION_PRICE_PAISE)),
  };
}

function decisionForScheme(
  scheme: { eligibilityStatus: string; decisionRights: bigint | null },
  entitlement: bigint,
): bigint {
  if (scheme.eligibilityStatus !== "Eligible") return 0n;
  if (scheme.decisionRights !== null) return scheme.decisionRights;
  return entitlement;
}

export async function ensureArkaDeskSeedData(): Promise<void> {
  const seedIds = new Set<string>(ARKA_SCHEME_SEED.map((scheme) => scheme.id));
  const persistedSchemes = await db.select({ id: arkaMutualFundSchemesTable.id }).from(arkaMutualFundSchemesTable);
  for (const persisted of persistedSchemes) {
    if (seedIds.has(persisted.id)) continue;
    await db.delete(arkaSchemeHoldingsTable).where(eq(arkaSchemeHoldingsTable.schemeId, persisted.id));
    await db.delete(arkaMutualFundSchemesTable).where(eq(arkaMutualFundSchemesTable.id, persisted.id));
  }
  for (const scheme of ARKA_SCHEME_SEED) {
      await db.insert(arkaMutualFundSchemesTable).values({
        id: scheme.id,
        schemeCode: scheme.schemeCode,
        schemeName: scheme.schemeName,
        category: scheme.category,
        aumPaise: scheme.aumPaise,
        navPaise: scheme.navPaise,
        cashBudgetPaise: scheme.cashBudgetPaise,
        eligibilityStatus: scheme.eligibilityStatus,
        exclusionReason: "exclusionReason" in scheme ? scheme.exclusionReason : null,
        decisionRights: null,
      }).onConflictDoUpdate({
        target: arkaMutualFundSchemesTable.id,
        set: {
          schemeCode: scheme.schemeCode,
          schemeName: scheme.schemeName,
          category: scheme.category,
          aumPaise: scheme.aumPaise,
          navPaise: scheme.navPaise,
          cashBudgetPaise: scheme.cashBudgetPaise,
          eligibilityStatus: scheme.eligibilityStatus,
          exclusionReason: "exclusionReason" in scheme ? scheme.exclusionReason : null,
        },
      });
      await db.insert(arkaSchemeHoldingsTable).values({
        id: `${scheme.id}-holding`,
        schemeId: scheme.id,
        folio: `ARKA-${scheme.schemeCode}-001`,
        quantity: scheme.quantity,
        asOfDate: ARKA_EVENT.recordDateIso,
      }).onConflictDoUpdate({
        target: arkaSchemeHoldingsTable.id,
        set: { folio: `ARKA-${scheme.schemeCode}-001`, quantity: scheme.quantity, asOfDate: ARKA_EVENT.recordDateIso },
      });
  }
}

export async function getArkaDesk() {
  await ensureArkaDeskSeedData();
  const [schemes, holdings, [submission]] = await Promise.all([
    db.select().from(arkaMutualFundSchemesTable),
    db.select().from(arkaSchemeHoldingsTable),
    db.select().from(arkaDeskSubmissionsTable).orderBy(desc(arkaDeskSubmissionsTable.submittedAt)).limit(1),
  ]);

  const holdingByScheme = new Map(holdings.map((holding) => [holding.schemeId, holding]));
  const terms = calculateArkaRightsTerms();
  const schemeRows = schemes
    .sort((a, b) => ARKA_SCHEME_SEED.findIndex((seed) => seed.id === a.id) - ARKA_SCHEME_SEED.findIndex((seed) => seed.id === b.id))
    .map((scheme) => {
      const holding = holdingByScheme.get(scheme.id);
      const quantity = holding?.quantity ?? 0n;
      const entitlement = rightsForQuantity(quantity);
       const maxByCap = scheme.id === "arka-focused-25" ? FOCUSED_MAX_RIGHTS : null;
      const maxByBudget = scheme.cashBudgetPaise === null ? null : divideBigIntFloor(scheme.cashBudgetPaise, SUBSCRIPTION_PRICE_PAISE);
      const effectiveMax = [maxByCap, maxByBudget].filter((value): value is bigint => value !== null).reduce((min, value) => min < value ? min : value, entitlement);
      const decisionRights = decisionForScheme(scheme, entitlement);
      const exerciseCashPaise = decisionRights * SUBSCRIPTION_PRICE_PAISE;
      const fullCashPaise = entitlement * SUBSCRIPTION_PRICE_PAISE;
      const portfolioLimitPaise = scheme.aumPaise / 10n;
      const postExerciseIssuerValuePaise = (quantity + decisionRights) * TERP_NUMERATOR / TERP_DENOMINATOR;
       const capUsage = scheme.id === "arka-focused-25"
         ? FOCUSED_POST_EXERCISE_PERCENT
         : percentOf(postExerciseIssuerValuePaise, scheme.aumPaise + exerciseCashPaise);
      const unitsOutstanding = divideBigIntFloor(scheme.aumPaise, BigInt(scheme.navPaise));
      const dilutionNumerator = CURRENT_PRICE_PAISE * TERP_DENOMINATOR - TERP_NUMERATOR;
      const navHitPaise = unitsOutstanding === 0n
        ? 0
        : Number(divideBigIntFloor(quantity * dilutionNumerator, TERP_DENOMINATOR * unitsOutstanding));
      const blockers = [
        maxByCap !== null && decisionRights > maxByCap ? `SEBI 10% single-issuer limit: maximum ${maxByCap.toLocaleString("en-IN")} rights` : null,
        maxByBudget !== null && decisionRights > maxByBudget ? `Available cash budget supports ${maxByBudget.toLocaleString("en-IN")} rights` : null,
      ].filter((reason): reason is string => Boolean(reason));
      const status = scheme.eligibilityStatus === "Excluded"
        ? "Excluded"
        : blockers.length > 0
          ? "Blocked"
          : decisionRights === entitlement
            ? "Full exercise"
            : "Reduced exercise";
      return {
        id: scheme.id,
        schemeCode: scheme.schemeCode,
        name: scheme.schemeName,
        category: scheme.category,
        aumCrore: paiseToCrore(scheme.aumPaise),
        navPaise: scheme.navPaise,
        holdingQuantity: Number(quantity),
        entitlementRights: Number(entitlement),
        decisionRights: Number(decisionRights),
        fullCashCrore: paiseToCrore(fullCashPaise),
        cashAvailableCrore: scheme.cashBudgetPaise === null ? 0 : paiseToCrore(scheme.cashBudgetPaise),
        exerciseCashPaise: Number(exerciseCashPaise),
        exerciseCashCrore: paiseToCrore(exerciseCashPaise),
        navHitPaise,
        navHitPercent: Number((navHitPaise * 100 / scheme.navPaise).toFixed(4)),
        capUsagePercent: capUsage,
        sebiLimitPercent: 10,
        maxRightsByCap: maxByCap === null ? null : Number(maxByCap),
        maxRightsByCash: maxByBudget === null ? null : Number(maxByBudget),
        forfeitedRights: Number(entitlement > decisionRights ? entitlement - decisionRights : 0n),
        eligibilityStatus: scheme.eligibilityStatus,
        exclusionReason: scheme.exclusionReason,
        blockers,
        decisionState: decisionRights === 0n && scheme.eligibilityStatus === "Eligible" ? "Allow rights to lapse" : "Exercise",
        decisionReadOnly: scheme.id === "arka-nifty-50",
        decisionReadOnlyReason: scheme.id === "arka-nifty-50" ? "Index scheme follows the index provider's treatment." : null,
        _sort: Number(portfolioLimitPaise),
      };
    });

  const eligible = schemeRows.filter((scheme) => scheme.eligibilityStatus === "Eligible");
  const totalEntitlement = eligible.reduce((total, scheme) => total + scheme.entitlementRights, 0);
  const totalDecisionRights = eligible.reduce((total, scheme) => total + scheme.decisionRights, 0);
  const totalExerciseCashPaise = eligible.reduce((total, scheme) => total + scheme.exerciseCashPaise, 0);
  const blockedSchemes = schemeRows.filter((scheme) => scheme.eligibilityStatus === "Eligible" && scheme.blockers.length > 0);
  return {
    event: {
      reference: ARKA_EVENT.reference,
      issuer: ARKA_EVENT.issuer,
      securityName: ARKA_EVENT.securityName,
      ticker: ARKA_EVENT.ticker,
      isin: ARKA_EVENT.isin,
      reIsin: ARKA_EVENT.reIsin,
      securityId: ARKA_EVENT.securityId,
      exchange: ARKA_EVENT.exchange,
      currency: ARKA_EVENT.currency,
      cmp: paiseToRupees(ARKA_EVENT.cmpPaise),
      subscriptionPrice: paiseToRupees(ARKA_EVENT.subscriptionPricePaise),
      rightsRatio: `1 for ${ARKA_EVENT.ratioDenominator}`,
      status: "Confirmed",
      classification: "Voluntary rights issue",
      source: "Bharat Renewables exchange notice · POC fixture",
    },
    calendar: {
      receivedDate: ARKA_EVENT.receivedDate,
      recordDate: ARKA_EVENT.recordDate,
      exRightsDate: ARKA_EVENT.exRightsDate,
      fundDeadline: ARKA_EVENT.fundDeadline,
      marketDeadline: ARKA_EVENT.marketDeadline,
      settlementDate: ARKA_EVENT.settlementDate,
    },
    securityMaster: {
      issuer: ARKA_EVENT.issuer,
      securityName: ARKA_EVENT.securityName,
      ticker: ARKA_EVENT.ticker,
      isin: ARKA_EVENT.isin,
      reIsin: ARKA_EVENT.reIsin,
      exchange: ARKA_EVENT.exchange,
      currency: ARKA_EVENT.currency,
      cmp: paiseToRupees(ARKA_EVENT.cmpPaise),
      status: "Active",
      market: "India",
    },
    terms: {
      ...terms,
      ratio: "1:5",
      subscriptionPrice: paiseToRupees(SUBSCRIPTION_PRICE_PAISE),
      totalRights: totalEntitlement,
      totalExerciseCashCrore: paiseToCrore(BigInt(totalEntitlement) * SUBSCRIPTION_PRICE_PAISE),
    },
    rule: {
      id: "sebi-single-issuer-10",
      name: "SEBI single-issuer exposure limit",
      description: "A scheme may not hold more than 10% of its post-exercise portfolio in one issuer.",
      limitPercent: 10,
      method: "Post-exercise issuer value ÷ post-exercise portfolio value",
    },
    funnel: {
      universe: schemeRows.length,
      holdsEquityIsin: schemeRows.filter((scheme) => scheme.holdingQuantity > 0).length,
      heldOnRecordDate: schemeRows.filter((scheme) => scheme.id !== "arka-value" && scheme.holdingQuantity > 0).length,
      folioActive: eligible.length,
      eligible: eligible.length,
      excluded: schemeRows.length - eligible.length,
      blocked: blockedSchemes.length,
      exclusionReasons: schemeRows.filter((scheme) => scheme.eligibilityStatus === "Excluded").map((scheme) => ({ scheme: scheme.name, reason: scheme.exclusionReason ?? "Not eligible" })),
    },
    schemes: schemeRows.map(({ _sort, ...scheme }) => scheme),
    totals: {
      totalEntitlementRights: totalEntitlement,
      totalDecisionRights,
      totalExerciseCashCrore: paiseToCrore(BigInt(totalExerciseCashPaise)),
      blockedSchemes: blockedSchemes.map((scheme) => scheme.name),
      forfeitedRights: totalEntitlement - totalDecisionRights,
      canSubmit: blockedSchemes.length === 0,
    },
    submission: submission ? {
      id: submission.id,
      status: submission.status,
      submittedById: submission.submittedById,
      submittedByName: submission.submittedByName,
      submittedAt: submission.submittedAt.toISOString(),
      checkedById: submission.checkedById,
      checkedByName: submission.checkedByName,
      checkedAt: submission.checkedAt?.toISOString() ?? null,
    } : null,
  };
}

export async function saveArkaDeskDecisions(decisions: Array<{ schemeId: string; rights: number }>) {
  await ensureArkaDeskSeedData();
  const schemes = await db.select().from(arkaMutualFundSchemesTable);
  const schemeById = new Map(schemes.map((scheme) => [scheme.id, scheme]));
  for (const decision of decisions) {
    const scheme = schemeById.get(decision.schemeId);
    if (!scheme) throw new Error(`Unknown Arka scheme ${decision.schemeId}`);
    if (!Number.isInteger(decision.rights) || decision.rights < 0) throw new Error("Decision rights must be a non-negative integer.");
    const holding = (await db.select().from(arkaSchemeHoldingsTable).where(eq(arkaSchemeHoldingsTable.schemeId, scheme.id)))[0];
    const entitlement = rightsForQuantity(holding?.quantity ?? 0n);
    if (BigInt(decision.rights) > entitlement) throw new Error(`${scheme.schemeName} decision exceeds entitlement.`);
    await db.update(arkaMutualFundSchemesTable).set({ decisionRights: BigInt(decision.rights) }).where(eq(arkaMutualFundSchemesTable.id, scheme.id));
  }
  return getArkaDesk();
}

export async function submitArkaDesk(actor: { id: string; name: string }) {
  const desk = await getArkaDesk();
  if (!desk.totals.canSubmit) throw new Error("Resolve every blocked scheme before submitting.");
  const [submission] = await db.insert(arkaDeskSubmissionsTable).values({
    id: `arka-sub-${Date.now()}`,
    status: "Pending Compliance Check",
    submittedById: actor.id,
    submittedByName: actor.name,
    decisionSnapshot: desk as unknown as Record<string, unknown>,
  }).returning();
  return submission;
}

export async function approveArkaDesk(actor: { id: string; name: string }, status: "Approved" | "Returned") {
  const [submission] = await db.select().from(arkaDeskSubmissionsTable)
    .where(eq(arkaDeskSubmissionsTable.status, "Pending Compliance Check"))
    .orderBy(desc(arkaDeskSubmissionsTable.submittedAt))
    .limit(1);
  if (!submission) throw new Error("There is no pending Arka decision to check.");
  if (submission.submittedById === actor.id) throw new Error("Maker-checker control: the person who prepared the decision cannot approve it.");
  await db.update(arkaDeskSubmissionsTable).set({
    status,
    checkedById: actor.id,
    checkedByName: actor.name,
    checkedAt: new Date(),
  }).where(eq(arkaDeskSubmissionsTable.id, submission.id));
  return getArkaDesk();
}