import OpenAI from "openai";
import { issuerExposuresForScheme } from "./corporate-actions-v2";

export const JUDGEMENT_MODEL = "gpt-5.4-mini";

type AnyRecord = Record<string, any>;

export interface Stage1Figures {
  lines: string[];
  allowed: Set<string>;
}

export interface JudgementResult {
  status: "ok" | "rejected" | "unavailable";
  summary?: string;
  model: string;
  generatedAt: string;
  rejectedReason?: string;
}

export interface JudgementSections {
  recommendation: string;
  portfolioImpact: string;
  riskAndControls: string;
  missingInformation: string;
}

const SECTION_LABELS = [
  "RECOMMENDATION",
  "PORTFOLIO IMPACT",
  "RISK AND CONTROLS",
  "MISSING INFORMATION",
] as const;

/** Canonicalize a numeric token: strip grouping commas, normalize decimals. */
export function canonicalNumber(token: string): string {
  const cleaned = token.replace(/,/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return cleaned;
  return String(value);
}

function addNumber(allowed: Set<string>, value: unknown): void {
  const num = Number(value);
  if (!Number.isFinite(num)) return;
  allowed.add(String(num));
  allowed.add(String(Math.abs(num)));
  allowed.add(String(Number(num.toFixed(2))));
  allowed.add(String(Number(Math.abs(num).toFixed(2))));
}

const FIGURE_KEYS = new Set([
  "eligibleQuantity", "cashAmount", "navImpactPaise", "quantityResult", "entitlement",
  "expected", "expectedCash", "grossCash", "withholdingRate", "withholdingAmount", "netCash",
  "expectedSecurityQuantity", "requiredFunding", "quantityElected", "amount", "referencePrice",
  "discountPercentage", "materialityPaise", "cashImpactAmount", "shareAmount",
  "expectedGrossCash", "expectedWithholdingAmount", "expectedNetCash", "actualCash",
  "actualSecurityQuantity", "difference", "tolerance", "actual",
  "currentPercent", "postActionPercent", "capPercent", "distanceToCapPercent", "maxRightsByCap",
  "settledQuantity", "unsettledQuantity",
]);

function harvest(node: unknown, allowed: Set<string>): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) harvest(item, allowed);
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as AnyRecord)) {
      if (typeof value === "number" && FIGURE_KEYS.has(key)) addNumber(allowed, value);
      else if (typeof value === "object") harvest(value, allowed);
    }
  }
}

const formatInr = (value: number): string => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Stage 1 harvest: every deterministic figure the event and desk expose,
 * as labelled prompt lines plus the canonical allow-list the validator enforces.
 */
export function collectStage1Figures(event: AnyRecord, desk: AnyRecord): Stage1Figures {
  const allowed = new Set<string>();
  const lines: string[] = [];

  harvest(event.schemeImpacts, allowed);
  harvest(event.positions, allowed);
  harvest(event.reconciliation, allowed);
  for (const key of ["amount", "referencePrice", "discountPercentage", "materialityPaise", "cashImpactAmount", "cashAmount", "shareAmount"]) {
    if (typeof event[key] === "number") addNumber(allowed, event[key]);
  }

  lines.push(`Event: ${event.issuer} ${String(event.eventType ?? "").toLowerCase()} (${event.reference}), status ${event.status}, processing type ${event.processingType}.`);
  lines.push(`Internal deadline: ${event.internalDeadline}. Market deadline: ${event.marketDeadline}.`);

  const impacts = (event.schemeImpacts ?? []).filter((impact: AnyRecord) => impact.affected);
  for (const impact of impacts) {
    const parts = [
      `Scheme ${impact.schemeName ?? impact.fund}: eligible quantity ${formatInr(Number(impact.eligibleQuantity ?? 0))}`,
      `direction ${impact.direction}`,
      `cash ${formatInr(Number(impact.cashAmount ?? 0))} INR`,
      `NAV impact ${impact.navImpactPaise ?? 0} paise per unit`,
    ];
    if (impact.entitlement) parts.push(`entitlement ${formatInr(Number(impact.entitlement))}`);
    if (impact.flag) parts.push(`flag: ${impact.flag}`);
    if (impact.electionDecision) parts.push(`election ${impact.electionDecision.optionLabel ?? impact.electionDecision.optionId} for ${formatInr(Number(impact.electionDecision.quantityElected ?? 0))} units`);
    lines.push(parts.join(", ") + ".");
  }

  const schemeIds = new Set(impacts.map((impact: AnyRecord) => impact.schemeId));
  for (const scheme of desk?.schemes ?? []) {
    if (!schemeIds.has(scheme.id)) continue;
    if (scheme.cashAvailableCrore != null) {
      const cash = Number(scheme.cashAvailableCrore) * 10_000_000;
      addNumber(allowed, cash);
      lines.push(`Cash available in ${scheme.name}: ${formatInr(cash)} INR.`);
    }
    if (scheme.maxRightsByCap != null) {
      addNumber(allowed, scheme.maxRightsByCap);
      lines.push(`Permitted maximum rights in ${scheme.name} under the SEBI cap: ${formatInr(Number(scheme.maxRightsByCap))}.`);
    }
    try {
      for (const exposure of issuerExposuresForScheme([event], scheme) ?? []) {
        addNumber(allowed, exposure.currentPercent);
        addNumber(allowed, exposure.postActionPercent);
        addNumber(allowed, exposure.capPercent);
        addNumber(allowed, exposure.distanceToCapPercent);
        lines.push(`Issuer exposure for ${scheme.name} on ${exposure.issuer}: ${exposure.currentPercent}% now, ${exposure.postActionPercent}% after action, cap ${exposure.capPercent}%.`);
      }
    } catch {
      // exposure derivation is best-effort for prompt context
    }
  }

  for (const option of event.options ?? []) {
    lines.push(`Option ${option.label}: ${option.result}${option.fundingFormula ? ` Funding: ${option.fundingFormula}` : ""}`);
  }
  for (const term of event.terms ?? []) {
    lines.push(`Term ${term.label}: ${term.value}`);
  }
  const missing = event.validation?.missingTerms ?? [];
  if (missing.length > 0) lines.push(`Terms still missing from the notice: ${missing.join(", ")}.`);
  lines.push(`Affected schemes: ${impacts.length} of ${(event.schemeImpacts ?? []).length}.`);
  const reconciliation = event.reconciliation ?? {};
  if (reconciliation.classification && reconciliation.classification !== "Not due") {
    lines.push(`Settlement classification: ${reconciliation.classification}. ${reconciliation.note ?? ""}`.trim());
    lines.push(`Settlement cash: expected ${formatInr(Number(reconciliation.expectedCash ?? reconciliation.expected ?? 0))} ${reconciliation.expectedCurrency ?? event.currency}, actual ${formatInr(Number(reconciliation.actualCash ?? reconciliation.actual ?? 0))} ${reconciliation.actualCurrency ?? reconciliation.expectedCurrency ?? event.currency}, difference ${formatInr(Number(reconciliation.difference ?? 0))}.`);
    lines.push(`Settlement securities: expected ${formatInr(Number(reconciliation.expectedSecurityQuantity ?? 0))}, actual ${formatInr(Number(reconciliation.actualSecurityQuantity ?? 0))}.`);
    lines.push(`Settlement date: expected ${reconciliation.expectedSettlementDate ?? "not stated"}, actual ${reconciliation.actualSettlementDate ?? "not stated"}.`);
    lines.push(`Settlement account: expected ${reconciliation.expectedAccount ?? "not stated"}, actual ${reconciliation.actualAccount ?? "not stated"}.`);
    if ((reconciliation.investigationSteps ?? []).length > 0) {
      lines.push(`Required settlement investigation: ${reconciliation.investigationSteps.join(" ")}`);
    }
  }

  // The snapshot shown to the model IS the allow-list: every numeric token
  // in every line above (dates, ratios, counts, term strings) is citable,
  // and nothing else is.
  for (const line of lines) harvestText(line, allowed);

  return { lines, allowed };
}

const NUMBER_TOKEN = /\d[\d,]*(?:\.\d+)?/g;

/** Add every numeric token found in a Stage 1 text line to the allow-list. */
export function harvestText(text: string, allowed: Set<string>): void {
  for (const match of String(text ?? "").match(NUMBER_TOKEN) ?? []) {
    allowed.add(canonicalNumber(match));
  }
}

/**
 * The guardrail. Every number in the model output must already exist in
 * Stage 1's computed output. There are no exceptions: dates, counts and
 * percentages are only accepted because the Stage 1 snapshot itself
 * contains them (every prompt line is harvested into the allow-list).
 */
export function validateJudgementText(text: string, allowed: Set<string>): { ok: boolean; offending: string[] } {
  const offending: string[] = [];
  for (const match of text.match(NUMBER_TOKEN) ?? []) {
    if (!allowed.has(canonicalNumber(match))) offending.push(match);
  }
  return { ok: offending.length === 0, offending };
}

export function parseJudgementSections(text: string): { ok: true; sections: JudgementSections } | { ok: false; reason: string } {
  const matches = [...text.matchAll(/^(RECOMMENDATION|PORTFOLIO IMPACT|RISK AND CONTROLS|MISSING INFORMATION):\s*/gim)];
  if (matches.length !== SECTION_LABELS.length) {
    return { ok: false, reason: "Response must contain exactly four labelled sections." };
  }
  if (text.slice(0, matches[0].index).trim()) {
    return { ok: false, reason: "Response contains text before the first required label." };
  }
  const labels = matches.map((match) => match[1].toUpperCase());
  if (labels.some((label, index) => label !== SECTION_LABELS[index])) {
    return { ok: false, reason: "Required section labels are missing, duplicated, or out of order." };
  }
  const content = matches.map((match, index) => {
    const start = Number(match.index) + match[0].length;
    const end = index + 1 < matches.length ? Number(matches[index + 1].index) : text.length;
    return text.slice(start, end).trim();
  });
  if (content.some((value) => !value)) {
    return { ok: false, reason: "Every required section must contain an explanation." };
  }
  return {
    ok: true,
    sections: {
      recommendation: content[0],
      portfolioImpact: content[1],
      riskAndControls: content[2],
      missingInformation: content[3],
    },
  };
}

export function validateJudgementSemantics(
  text: string,
  event: AnyRecord,
): { ok: true; sections: JudgementSections } | { ok: false; reason: string } {
  const parsed = parseJudgementSections(text);
  if (!parsed.ok) return parsed;
  if (
    event.processingType === "Mandatory"
    && /\b(accept(?:ed|ing)?|reject(?:ed|ing)?|forego(?:ne|es|ing)?|forgo(?:ne|es|ing)?|elect(?:ed|ing)?)\b/i.test(text)
  ) {
    return { ok: false, reason: "Mandatory events cannot be described as an elective action." };
  }
  const recommendation = parsed.sections.recommendation;
  if (event.status === "Break identified") {
    const startsWithResolution = /^(?:(?:the )?next action is to |first[, ]+)?(?:investigat\w*|verif\w*|recover\w*|resolv\w*|correct\w*)\b/i.test(recommendation);
    const recommendsOriginalEventAction = /\b(book\w*|claim\w*|decid\w*|accept\w*|reject\w*|forego\w*|forgo\w*|elect\w*)\b/i.test(recommendation);
    const namesDiscrepancy = /\b(shortfall|excess|difference|mismatch|under-settled|over-settled|discrepancy|break)\b/i.test(recommendation);
    const resolvesDiscrepancy = /\b(investigat\w*|verif\w*|recover\w*|resolv\w*|correct\w*)\b/i.test(recommendation);
    const rerunsMatch = /\b(re-?run\w*|rematch\w*|reconcile again|match again)\b/i.test(recommendation);
    if (!startsWithResolution || recommendsOriginalEventAction || !namesDiscrepancy || !resolvesDiscrepancy || !rerunsMatch) {
      return { ok: false, reason: "A settlement-break recommendation must lead with identifying and resolving the discrepancy, then rematch it, without returning to the original event decision." };
    }
  }
  if (event.status === "Awaiting settlement") {
    const startsWithSettlementAction = /^(?:(?:the )?next action is to |first[, ]+)?(?:monitor\w*|record\w*|wait\w*|await\w*|confirm\w*|track\w*|reconcil\w*)\b/i.test(recommendation);
    const recommendsDecisionAction = /\b(book\w*|claim\w*|decid\w*|accept\w*|reject\w*|forego\w*|forgo\w*|elect\w*)\b/i.test(recommendation);
    if (!startsWithSettlementAction || recommendsDecisionAction) {
      return { ok: false, reason: "An awaiting-settlement recommendation must lead with the pending receipt and settlement check, not the original event decision." };
    }
  }
  return parsed;
}

/**
 * Stage 2. Reads Stage 1's output plus portfolio context and writes prose.
 * Structurally incapable of changing a number: it receives only Stage 1
 * figures, and its response is rejected if it introduces any other number.
 */
export async function generateJudgement(event: AnyRecord, desk: AnyRecord): Promise<JudgementResult> {
  const generatedAt = new Date().toISOString();
  const { lines, allowed } = collectStage1Figures(event, desk);
  if (!process.env.OPENAI_API_KEY) {
    return { status: "unavailable", model: JUDGEMENT_MODEL, generatedAt, rejectedReason: "OPENAI_API_KEY is not configured." };
  }
  const prompt = `You are the judgement layer of a corporate-actions workbench for an Indian mutual fund. Stage 1, the deterministic calculation engine, has already computed every figure. Your job is interpretation only.

Stage 1 output and portfolio context:
${lines.map((line) => `- ${line}`).join("\n")}

Write exactly four short, newline-separated sections using these labels:
RECOMMENDATION: The next operational action and why it comes first.
PORTFOLIO IMPACT: Which schemes are affected, what changes, and the practical consequence.
RISK AND CONTROLS: Concentration, funding, deadline, settlement, or other control implications.
MISSING INFORMATION: Terms that still need confirmation, or state plainly that no missing terms were flagged.

Hard rules:
- Cite only figures that appear verbatim in the Stage 1 output above. Do not compute, convert, round, or introduce any other number. Do not convert units (no lakh or crore conversions).
- Any quantity, date, count or percentage you cannot copy exactly from the Stage 1 output must be written in words without digits.
- Keep RECOMMENDATION and MISSING INFORMATION to one or two short sentences. PORTFOLIO IMPACT and RISK AND CONTROLS may use one short sentence per affected scheme. Do not join multiple scheme impacts with semicolons.
- In PORTFOLIO IMPACT, state the concrete eligible quantity, cash or shares, and NAV impact for each affected scheme when those figures are present. Use a separate short sentence for each scheme instead of saying the figures are shown elsewhere.
- In RISK AND CONTROLS, keep each scheme name beside its own current exposure, post-action exposure, and cap. Never combine exposure figures from different schemes into one comparison.
- For mandatory events, describe the entitlement as an automatic outcome. Never say the fund manager can accept, reject, forego, or elect it.
- Discuss option trade-offs only when Stage 1 lists actual options.
- Match the recommendation to the current lifecycle status. For Break identified, lead with investigating and recovering the settlement discrepancy, then rerunning the match. Do not recommend booking, claiming, or deciding the original event as the next action.
- For Awaiting settlement, lead with monitoring and recording the receipt. For Reconciled or Closed, state that no further operational action is required.
- Plain prose after each required label, no markdown, no bullet points, no em dashes, no emojis.
- Do not recommend an action Stage 1 marks as blocked.`;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let rejectedReason = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text = "";
    try {
      const response = await client.responses.create({
        model: JUDGEMENT_MODEL,
        input: `${prompt}${attempt > 0 ? `\n\nYour previous response was rejected: ${rejectedReason} Return a corrected response that follows every hard rule.` : ""}`,
      } as any);
      text = String((response as AnyRecord).output_text ?? "").trim();
    } catch (error) {
      return {
        status: "unavailable",
        model: JUDGEMENT_MODEL,
        generatedAt,
        rejectedReason: error instanceof Error ? error.message : "Model call failed.",
      };
    }
    if (!text) {
      rejectedReason = "Model returned no text.";
      continue;
    }
    const numericVerdict = validateJudgementText(text, allowed);
    if (!numericVerdict.ok) {
      rejectedReason = `Response introduced figures not present in Stage 1 output: ${numericVerdict.offending.join(", ")}.`;
      continue;
    }
    const semanticVerdict = validateJudgementSemantics(text, event);
    if (!semanticVerdict.ok) {
      rejectedReason = semanticVerdict.reason;
      continue;
    }
    return { status: "ok", summary: text, model: JUDGEMENT_MODEL, generatedAt };
  }
  return {
    status: "rejected",
    model: JUDGEMENT_MODEL,
    generatedAt,
    rejectedReason,
  };
}
