import { desc, eq } from "drizzle-orm";
import {
  arkaDeskSubmissionsTable,
  arkaMutualFundSchemesTable,
  arkaSchemeHoldingsTable,
  db,
} from "@workspace/db";
import { divideBigIntFloor } from "./calculations";

const CURRENT_PRICE_PAISE = 12_000n;
const SUBSCRIPTION_PRICE_PAISE = 8_500n;
const RIGHTS_NUMERATOR = 1n;
const RIGHTS_DENOMINATOR = 5n;
const CAP_PERCENT = 10n;
const CAP_BASE = 100n;
const TERP_NUMERATOR = CURRENT_PRICE_PAISE * RIGHTS_DENOMINATOR + SUBSCRIPTION_PRICE_PAISE * RIGHTS_NUMERATOR;
const TERP_DENOMINATOR = RIGHTS_DENOMINATOR + RIGHTS_NUMERATOR;

export const ARKA_SCHEME_SEED = [
  { id: "arka-focused-25", schemeCode: "ARKA-F25", schemeName: "Arka Focused 25", category: "Focused", aumPaise: 793_520_406_334n, navPaise: 184_25, cashBudgetPaise: null, eligibilityStatus: "Eligible", quantity: 6_000_000n },
  { id: "arka-equity-savings", schemeCode: "ARKA-ES", schemeName: "Arka Equity Savings", category: "Equity Savings", aumPaise: 2_450_000_000_000n, navPaise: 126_80, cashBudgetPaise: null, eligibilityStatus: "Eligible", quantity: 900_000n },
  { id: "arka-small-cap", schemeCode: "ARKA-SC", schemeName: "Arka Small Cap", category: "Small Cap", aumPaise: 3_250_000_000_000n, navPaise: 214_60, cashBudgetPaise: 1_799_994_000n, eligibilityStatus: "Eligible", quantity: 1_200_000n },
  { id: "arka-flexi-cap", schemeCode: "ARKA-FC", schemeName: "Arka Flexi Cap", category: "Flexi Cap", aumPaise: 5_500_000_000_000n, navPaise: 168_35, cashBudgetPaise: null, eligibilityStatus: "Eligible", quantity: 1_300_000n },
  { id: "arka-large-mid", schemeCode: "ARKA-LM", schemeName: "Arka Large & Mid Cap", category: "Large & Mid Cap", aumPaise: 2_800_000_000_000n, navPaise: 142_15, cashBudgetPaise: null, eligibilityStatus: "Eligible", quantity: 900_000n },
  { id: "arka-balanced-advantage", schemeCode: "ARKA-BA", schemeName: "Arka Balanced Advantage", category: "Balanced Advantage", aumPaise: 3_900_000_000_000n, navPaise: 118_90, cashBudgetPaise: null, eligibilityStatus: "Eligible", quantity: 1_000_000n },
  { id: "arka-value-discovery", schemeCode: "ARKA-VD", schemeName: "Arka Value Discovery", category: "Value", aumPaise: 2_100_000_000_000n, navPaise: 156_20, cashBudgetPaise: null, eligibilityStatus: "Eligible", quantity: 600_000n },
  { id: "arka-elss-tax-saver", schemeCode: "ARKA-ELSS", schemeName: "Arka ELSS Tax Saver", category: "ELSS", aumPaise: 1_500_000_000_000n, navPaise: 132_40, cashBudgetPaise: null, eligibilityStatus: "Eligible", quantity: 1_300_000n },
  { id: "arka-midcap-opportunities", schemeCode: "ARKA-MO", schemeName: "Arka Midcap Opportunities", category: "Mid Cap", aumPaise: 2_600_000_000_000n, navPaise: 198_10, cashBudgetPaise: null, eligibilityStatus: "Excluded", exclusionReason: "No position on the record date", quantity: 0n },
  { id: "arka-arbitrage", schemeCode: "ARKA-ARB", schemeName: "Arka Arbitrage", category: "Arbitrage", aumPaise: 1_100_000_000_000n, navPaise: 104_75, cashBudgetPaise: null, eligibilityStatus: "Excluded", exclusionReason: "Security is outside the scheme mandate", quantity: 0n },
] as const;

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
  receivedDate: "01 Sep 2026",
  recordDate: "04 Sep 2026",
  exRightsDate: "03 Sep 2026",
  fundDeadline: "07 Sep 2026 · 17:00 IST",
  marketDeadline: "08 Sep 2026 · 15:30 IST",
  settlementDate: "15 Sep 2026",
} as const;

const paiseToRupees = (value: bigint): number => Number(value) / 100;
const fractionToRupees = (numerator: bigint, denominator: bigint, decimals = 4): number =>
  Number((Number(numerator) / Number(denominator) / 100).toFixed(decimals));
const percentOf = (numerator: bigint, denominator: bigint): number =>
  Number((Number(numerator) * 100 / Number(denominator)).toFixed(2));

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
    focusedMaximumRights: Number(capMaximumRights(focused.quantity, focused.aumPaise)),
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
  const existing = await db.select({ id: arkaMutualFundSchemesTable.id }).from(arkaMutualFundSchemesTable);
  if (existing.length === 0) {
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
      }).onConflictDoNothing();
      await db.insert(arkaSchemeHoldingsTable).values({
        id: `${scheme.id}-holding`,
        schemeId: scheme.id,
        folio: `ARKA-${scheme.schemeCode}-001`,
        quantity: scheme.quantity,
        asOfDate: ARKA_EVENT.recordDate,
      }).onConflictDoNothing();
    }
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
      const maxByCap = scheme.id === "arka-focused-25" ? capMaximumRights(quantity, scheme.aumPaise) : null;
      const maxByBudget = scheme.cashBudgetPaise === null ? null : divideBigIntFloor(scheme.cashBudgetPaise, SUBSCRIPTION_PRICE_PAISE);
      const effectiveMax = [maxByCap, maxByBudget].filter((value): value is bigint => value !== null).reduce((min, value) => min < value ? min : value, entitlement);
      const decisionRights = decisionForScheme(scheme, entitlement);
      const exerciseCashPaise = decisionRights * SUBSCRIPTION_PRICE_PAISE;
      const fullCashPaise = entitlement * SUBSCRIPTION_PRICE_PAISE;
      const portfolioLimitPaise = scheme.aumPaise / 10n;
      const postExerciseIssuerValuePaise = (quantity + decisionRights) * TERP_NUMERATOR / TERP_DENOMINATOR;
      const capUsage = percentOf(postExerciseIssuerValuePaise, scheme.aumPaise + exerciseCashPaise);
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
        aumCrore: Number((Number(scheme.aumPaise) / 100 / 10_000_000).toFixed(2)),
        navPaise: scheme.navPaise,
        holdingQuantity: Number(quantity),
        entitlementRights: Number(entitlement),
        decisionRights: Number(decisionRights),
        fullCashCrore: Number((Number(fullCashPaise) / 100 / 10_000_000).toFixed(4)),
        exerciseCashPaise: Number(exerciseCashPaise),
        exerciseCashCrore: Number((Number(exerciseCashPaise) / 100 / 10_000_000).toFixed(4)),
        navHitPaise: Number((Number(exerciseCashPaise) * 100 / Number(scheme.aumPaise)).toFixed(2)),
        navHitPercent: percentOf(exerciseCashPaise, scheme.aumPaise),
        capUsagePercent: capUsage,
        sebiLimitPercent: 10,
        maxRightsByCap: maxByCap === null ? null : Number(maxByCap),
        maxRightsByCash: maxByBudget === null ? null : Number(maxByBudget),
        forfeitedRights: Number(entitlement > decisionRights ? entitlement - decisionRights : 0n),
        eligibilityStatus: scheme.eligibilityStatus,
        exclusionReason: scheme.exclusionReason,
        blockers,
        decisionState: decisionRights === 0n && scheme.eligibilityStatus === "Eligible" ? "Allow rights to lapse" : "Exercise",
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
      totalExerciseCashCrore: Number((totalEntitlement * Number(SUBSCRIPTION_PRICE_PAISE) / 100 / 10_000_000).toFixed(4)),
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
      eligible: eligible.length,
      excluded: schemeRows.length - eligible.length,
      blocked: blockedSchemes.length,
      exclusionReasons: schemeRows.filter((scheme) => scheme.eligibilityStatus === "Excluded").map((scheme) => ({ scheme: scheme.name, reason: scheme.exclusionReason ?? "Not eligible" })),
    },
    schemes: schemeRows.map(({ _sort, ...scheme }) => scheme),
    totals: {
      totalEntitlementRights: totalEntitlement,
      totalDecisionRights,
      totalExerciseCashCrore: Number((totalExerciseCashPaise / 100 / 10_000_000).toFixed(4)),
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