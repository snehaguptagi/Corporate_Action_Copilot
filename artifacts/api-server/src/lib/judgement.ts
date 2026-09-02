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
  let text = "";
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: JUDGEMENT_MODEL,
      input: `You are the judgement layer of a corporate-actions workbench for an Indian mutual fund. Stage 1, the deterministic calculation engine, has already computed every figure. Your job is interpretation only.

Stage 1 output and portfolio context:
${lines.map((line) => `- ${line}`).join("\n")}

Write 4 to 5 short sentences for the fund manager covering, where relevant:
1. The trade-off in one sentence (which option recovers or forfeits what, citing Stage 1 figures).
2. Cross-event or concentration judgement if a cap or flag is in play.
3. What to do first and why, with a reason beyond size.
4. What is MISSING from the notice, if the Stage 1 output lists missing terms; recommend confirming it with the custodian.

Hard rules:
- Cite only figures that appear verbatim in the Stage 1 output above. Do not compute, convert, round, or introduce any other number. Do not convert units (no lakh or crore conversions).
- Any quantity, date, count or percentage you cannot copy exactly from the Stage 1 output must be written in words without digits.
- Plain prose only, no markdown, no bullet points, no em dashes, no emojis.
- Do not recommend an action Stage 1 marks as blocked.`,
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
    return { status: "unavailable", model: JUDGEMENT_MODEL, generatedAt, rejectedReason: "Model returned no text." };
  }
  const verdict = validateJudgementText(text, allowed);
  if (!verdict.ok) {
    return {
      status: "rejected",
      model: JUDGEMENT_MODEL,
      generatedAt,
      rejectedReason: `Response introduced figures not present in Stage 1 output: ${verdict.offending.join(", ")}.`,
    };
  }
  return { status: "ok", summary: text, model: JUDGEMENT_MODEL, generatedAt };
}
