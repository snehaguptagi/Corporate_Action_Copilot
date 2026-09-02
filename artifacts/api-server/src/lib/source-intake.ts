import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import { desc, eq } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { deriveEventSignals, getCorporateActionEvents, type WorkflowActor } from "./corporate-actions-v2";

type IntakeSourceInput = {
  sourceType: "sample" | "upload" | "url" | "text" | "structured-feed";
  sourceLabel: string;
  sampleId?: string;
  objectPath?: string;
  sourceUrl?: string;
  sourceText?: string;
  structuredPayload?: string;
};

type DraftTerm = {
  key: string;
  label: string;
  value: string;
  page: string;
  evidence: string;
  confidence: number;
  reviewStatus: "Needs review" | "Validated";
  sourceType: string;
  manuallyCorrected: boolean;
  oldValue: string;
  correctionReason: string;
};

type IntakeDraft = Record<string, any> & {
  id: string;
  status: string;
  source: Record<string, any>;
  extraction: Record<string, any>;
  terms: DraftTerm[];
};

const storage = new ObjectStorageService();
const maxUploadSize = 12 * 1024 * 1024;
const maxSourceCharacters = 40_000;
const execFileAsync = promisify(execFile);

const sampleTexts: Record<string, string> = {
  "cash-dividend": "Notice Reference: CA-IN-DIV-001\nIssuer: Aarav Industries Ltd\nEvent: Mandatory cash dividend\nISIN: INE0AAR01011\nRecord date: 15 September 2026\nGross rate: INR 4.25 per equity share.\nPayment date: 30 September 2026.",
  "rights-issue": "Notice Reference: CA-IN-2026-0901-BR\nIssuer: Bharat Renewables Ltd\nEvent: Rights issue\nISIN: INE0BRR01019\nRecord date: 15 September 2026\nRights ratio: 1 for 5.\nSubscription price: INR 85.00.\nInstructions must be received by 20 September 2026 at 15:30 IST.\nDefault option: Lapse.",
  "stock-split": "Issuer: Deccan Grid Ltd\nEvent: Mandatory stock split\nISIN: INE0DEC01012\nRecord date: 15 September 2026\nSplit ratio: 5 for 1.",
  "bonus-issue": "Issuer: Narmada Logistics Ltd\nEvent: Mandatory bonus issue\nISIN: INE0NAR01013\nRecord date: 15 September 2026\nBonus ratio: 1 for 10 eligible shares.",
  "tender-offer": "Issuer: Meridian Infrastructure India Ltd\nEvent: Voluntary tender offer / buyback\nISIN: INE0MER01014\nOffer price: INR 850 per share.\nMaximum acceptance: 20%.\nMarket deadline: 20 September 2026 at 15:30 IST.",
  merger: "Issuer: Vindhya Mobility Ltd\nEvent: Scheme of arrangement merger / demerger\nISIN: INE0VIN01015\nShare exchange ratio: 0.333.\nCash consideration: INR 425.\nMarket deadline: 20 September 2026 at 15:30 IST.",
};

function limitedText(value?: string): string {
  return (value ?? "").trim().slice(0, maxSourceCharacters);
}

const canonicalEventTypes = ["Cash dividend", "Stock split", "Bonus issue", "Rights issue", "Tender offer", "Merger / demerger"] as const;

export function normalizeEventType(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const exact = canonicalEventTypes.find((candidate) => candidate.toLowerCase() === value);
  if (exact) return exact;
  const matches = new Set<string>();
  if (/\brights\b/.test(value)) matches.add("Rights issue");
  if (/\btender\b|\bbuy-?backs?\b|\brepurchases?\b/.test(value)) matches.add("Tender offer");
  if (/\bmergers?\b|\bdemergers?\b|\bacquisitions?\b|\btakeovers?\b|\bscheme of arrangement\b/.test(value)) matches.add("Merger / demerger");
  if (/\bsplits?\b/.test(value)) matches.add("Stock split");
  const stockDividendIndicator = /\bbonus\b|\bscrip\b|\bstock dividends?\b|\bshare dividends?\b/.test(value);
  if (stockDividendIndicator) matches.add("Bonus issue");
  if (/\bdividends?\b|\bcash distributions?\b/.test(value) && (!stockDividendIndicator || /\bcash\b/.test(value))) matches.add("Cash dividend");
  return matches.size === 1 ? [...matches][0] : null;
}

function term(key: string, label: string, value: string, page = "p. 1", evidence = value, confidence = 0.72): DraftTerm {
  return {
    key,
    label,
    value: value.trim(),
    page,
    evidence: evidence.trim().slice(0, 300),
    confidence,
    reviewStatus: "Needs review",
    sourceType: "AI extracted",
    manuallyCorrected: false,
    oldValue: "",
    correctionReason: "",
  };
}

function lineMatch(text: string, expression: RegExp): string | undefined {
  return expression.exec(text)?.[1]?.trim();
}

function heuristicTerms(text: string): DraftTerm[] {
  const values = new Map<string, DraftTerm>();
  const add = (key: string, label: string, value?: string, evidence?: string) => {
    if (value) values.set(key, term(key, label, value, "p. 1", evidence ?? value, 0.66));
  };
  const type = lineMatch(text, /(?:event|corporate action)\s*:\s*([^\n.]+)/i)
    ?? (/rights issue/i.test(text) ? "Rights issue" : /cash dividend/i.test(text) ? "Cash dividend" : /stock split/i.test(text) ? "Stock split" : /bonus issue/i.test(text) ? "Bonus issue" : /tender offer/i.test(text) ? "Tender offer" : /merger/i.test(text) ? "Merger" : undefined);
  add("eventType", "Event type", type);
  add("issuer", "Issuer", lineMatch(text, /issuer\s*:\s*([^\n]+)/i));
  add("securityIdentifier", "Security identifier", lineMatch(text, /\b(?:ISIN|CUSIP|SEDOL)\s*:\s*([A-Z0-9]+)/i));
  add("recordDate", "Record date", lineMatch(text, /record date\s*:\s*([^\n.]+)/i));
  add("paymentDate", "Payment date", lineMatch(text, /payment date\s*:\s*([^\n.]+)/i));
  add("settlementDate", "Settlement date", lineMatch(text, /settlement date\s*:\s*([^\n.]+)/i));
  add("marketDeadline", "Market deadline", lineMatch(text, /(?:market deadline|instructions? must be received by)\s*:?\s*([^\n.]+)/i));
  add("rate", "Cash rate", lineMatch(text, /(?:gross rate|cash rate|dividend rate)\s*:\s*([^\n.]+)/i));
  add("rightsRatio", "Rights ratio", lineMatch(text, /rights ratio\s*:\s*([^\n.]+)/i));
  add("bonusRatio", "Bonus ratio", lineMatch(text, /bonus ratio\s*:\s*([^\n.]+)/i));
  add("splitRatio", "Split ratio", lineMatch(text, /split ratio\s*:\s*([^\n.]+)/i));
  add("subscriptionPrice", "Subscription price", lineMatch(text, /subscription price\s*:\s*([^\n.]+)/i));
  add("offerPrice", "Offer price", lineMatch(text, /offer price\s*:\s*([^\n.]+)/i));
  add("maximumAcceptance", "Maximum acceptance", lineMatch(text, /maximum acceptance\s*:\s*([^\n.]+)/i));
  add("shareExchangeRatio", "Share exchange ratio", lineMatch(text, /share exchange ratio\s*:\s*([^\n.]+)/i));
  add("cashRate", "Cash consideration", lineMatch(text, /cash consideration\s*:\s*([^\n.]+)/i));
  add("defaultOption", "Default option", lineMatch(text, /default option\s*:\s*([^\n.]+)/i));
  return [...values.values()];
}

function isSafeUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Provide a public http or https website URL without embedded credentials.");
  }
  const host = parsed.hostname.toLowerCase();
  const privateIpv4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (host === "localhost" || host.endsWith(".local") || privateIpv4.test(host) || host === "::1") {
    throw new Error("Private network URLs cannot be used as a notice source.");
  }
  return parsed;
}

async function fetchWebsiteText(rawUrl: string): Promise<string> {
  const url = isSafeUrl(rawUrl);
  const response = await fetch(url, {
    headers: { "User-Agent": "CorporateActionsImpactCopilot/1.0" },
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`The source website returned ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text") && !contentType.includes("json")) {
    throw new Error("The source website did not return readable text or structured data.");
  }
  return limitedText((await response.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").replace(/\s+/g, " "));
}

async function readUploadedPdf(objectPath: string): Promise<{ pages: Array<{ page: number; text: string }>; screenshots: string[] }> {
  if (!objectPath.startsWith("/objects/")) throw new Error("The uploaded document path is invalid.");
  const file = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size ?? 0) > maxUploadSize) throw new Error("The uploaded PDF exceeds the 12 MB processing limit.");
  const [buffer] = await file.download();
  const tempDir = await mkdtemp(path.join(tmpdir(), "corporate-action-pdf-"));
  const inputPath = path.join(tempDir, "source.pdf");
  const textPath = path.join(tempDir, "source.txt");
  try {
    await writeFile(inputPath, buffer);
    await execFileAsync("pdftotext", ["-layout", inputPath, textPath], { maxBuffer: maxSourceCharacters * 2 }).catch(() => undefined);
    const text = await readFile(textPath, "utf8").catch(() => "");
    const pages = text.split("\f").filter(Boolean).map((page, index) => ({ page: index + 1, text: limitedText(page) }));
    if (text.trim().length >= 80) return { pages, screenshots: [] };
    await execFileAsync("pdftoppm", ["-png", "-f", "1", "-l", "3", "-scale-to", "1600", inputPath, path.join(tempDir, "page")], { maxBuffer: maxUploadSize * 2 });
    const screenshots = await Promise.all([1, 2, 3].map(async (page) => {
      const image = await readFile(path.join(tempDir, `page-${page}.png`)).catch(() => null);
      return image ? `data:image/png;base64,${image.toString("base64")}` : null;
    }));
    return {
      pages,
      screenshots: screenshots.filter((image): image is string => Boolean(image)),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function extractWithOpenAI(text: string, images: string[] = []): Promise<{ terms: DraftTerm[]; method: string; errors: string[] }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI extraction is not configured.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `Extract corporate-action terms from this evidence. Return JSON only with a "terms" array. Each item must include key, label, value, page, evidence, confidence. Use keys only from: eventType, issuer, securityIdentifier, recordDate, paymentDate, settlementDate, marketDeadline, rate, rightsRatio, bonusRatio, splitRatio, subscriptionPrice, offerPrice, maximumAcceptance, shareExchangeRatio, cashRate, defaultOption. Do not invent facts. Confidence must be 0 to 1. Evidence must be an exact short source quote. Source text:\n${limitedText(text)}`;
  const content: any[] = [{ type: "text", text: prompt }];
  for (const image of images.slice(0, 3)) content.push({ type: "image_url", image_url: { url: image, detail: "high" } });
  const completion = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1800,
  } as any);
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { terms?: Array<Record<string, unknown>> };
  const terms = (parsed.terms ?? []).flatMap((item) => {
    const key = typeof item.key === "string" ? item.key : "";
    const label = typeof item.label === "string" ? item.label : key;
    const value = typeof item.value === "string" ? item.value : "";
    if (!key || !value) return [];
    return [term(key, label, value, typeof item.page === "string" ? item.page : "p. 1", typeof item.evidence === "string" ? item.evidence : value, typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.65)];
  });
  return { terms, method: images.length ? "OpenAI vision OCR and extraction" : "OpenAI text extraction", errors: [] };
}

async function persistDraft(draft: IntakeDraft): Promise<IntakeDraft> {
  const { corporateActionIntakeDraftsTable, db } = await import("@workspace/db");
  await db.insert(corporateActionIntakeDraftsTable).values({ id: draft.id, data: draft }).onConflictDoUpdate({
    target: corporateActionIntakeDraftsTable.id,
    set: { data: draft, updatedAt: new Date() },
  });
  return draft;
}

export async function createIntakeDraft(input: IntakeSourceInput, actor: WorkflowActor): Promise<IntakeDraft> {
  let sourceText = limitedText(input.sourceText);
  const source: Record<string, any> = {
    type: input.sourceType,
    label: input.sourceLabel.trim(),
    receivedAt: new Date().toISOString(),
    preservation: input.sourceType === "upload" ? "Original PDF preserved in protected App Storage" : "Captured source content preserved with intake draft",
  };
  if (!source.label) throw new Error("A source label is required.");
  if (input.sourceType === "sample") {
    if (!input.sampleId || !sampleTexts[input.sampleId]) throw new Error("Choose a supplied sample notice.");
    source.sampleId = input.sampleId;
    source.previewUrl = `/demo-notices/${input.sampleId === "rights-issue" ? "rights-issue-notice.pdf" : `${input.sampleId === "cash-dividend" ? "cash-dividend-notice" : input.sampleId === "stock-split" ? "delta-stock-split" : input.sampleId === "bonus-issue" ? "nimbus-bonus-issue" : input.sampleId === "tender-offer" ? "meridian-tender-offer" : "verdant-merger-election"}.pdf`}`;
    sourceText = sampleTexts[input.sampleId];
  } else if (input.sourceType === "upload") {
    if (!input.objectPath) throw new Error("Upload a PDF before creating the intake draft.");
    source.objectPath = input.objectPath;
    source.previewUrl = `/api/storage${input.objectPath}`;
    const file = await storage.getObjectEntityFile(input.objectPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size ?? 0) > maxUploadSize) throw new Error("PDF uploads are limited to 12 MB.");
    if (!String(metadata.contentType ?? "").includes("pdf")) throw new Error("Only PDF documents are supported for upload.");
    await storage.trySetObjectEntityAclPolicy(input.objectPath, { owner: actor.id, visibility: "private" });
    source.contentType = metadata.contentType;
    source.size = Number(metadata.size ?? 0);
  } else if (input.sourceType === "url") {
    if (!input.sourceUrl) throw new Error("Provide a website URL.");
    source.sourceUrl = isSafeUrl(input.sourceUrl).toString();
    source.previewUrl = source.sourceUrl;
  } else if (input.sourceType === "structured-feed") {
    sourceText = limitedText(input.structuredPayload);
    if (!sourceText) throw new Error("Paste the custodian or agent payload to continue.");
  } else if (!sourceText) {
    throw new Error("Paste the notice text to continue.");
  }
  const draft: IntakeDraft = {
    id: `intake-${randomUUID()}`,
    title: source.label,
    status: "Source captured",
    source: { ...source, capturedText: sourceText },
    extraction: { status: "Not started", method: "Not started", confidence: 0, errors: [] },
    terms: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: { id: actor.id, name: actor.name },
    audit: [{ timestamp: new Date().toISOString(), action: "Source captured", actor: actor.name, detail: `${source.label} recorded as ${input.sourceType} evidence.` }],
  };
  return persistDraft(draft);
}

export async function getIntakeDraft(id: string): Promise<IntakeDraft | null> {
  const { corporateActionIntakeDraftsTable, db } = await import("@workspace/db");
  const [row] = await db.select().from(corporateActionIntakeDraftsTable).where(eq(corporateActionIntakeDraftsTable.id, id));
  return row ? row.data as IntakeDraft : null;
}

export async function extractIntakeDraft(id: string, actor: WorkflowActor): Promise<IntakeDraft> {
  const draft = await getIntakeDraft(id);
  if (!draft) throw new Error("Intake draft not found.");
  let text = draft.source.capturedText ?? "";
  let pages: Array<{ page: number; text: string }> = [];
  let screenshots: string[] = [];
  try {
    if (draft.source.type === "upload") {
      const result = await readUploadedPdf(draft.source.objectPath);
      pages = result.pages;
      text = pages.map((page) => `Page ${page.page}: ${page.text}`).join("\n");
      screenshots = result.screenshots;
    } else if (draft.source.type === "url") {
      text = await fetchWebsiteText(draft.source.sourceUrl);
    }
    if (!text.trim() && screenshots.length === 0) throw new Error("No readable text was found in the source.");
    const fallback = heuristicTerms(text);
    let extracted = { terms: fallback, method: "Rules-assisted text extraction", errors: [] as string[] };
    try {
      const ai = await extractWithOpenAI(text || "Scanned document, inspect the provided page images.", screenshots);
      if (ai.terms.length) extracted = ai;
    } catch (error) {
      extracted.errors = [error instanceof Error ? error.message : "OpenAI extraction was unavailable. Review the evidence manually."];
    }
    draft.source.capturedText = limitedText(text);
    draft.source.pages = pages;
    draft.terms = extracted.terms;
    draft.extraction = {
      status: extracted.terms.length ? "Review required" : "No terms extracted",
      method: extracted.method,
      confidence: extracted.terms.length ? Number((extracted.terms.reduce((sum, item) => sum + item.confidence, 0) / extracted.terms.length).toFixed(2)) : 0,
      errors: extracted.errors,
      extractedAt: new Date().toISOString(),
    };
    draft.status = extracted.terms.length ? "Validation required" : "Extraction failed";
  } catch (error) {
    draft.status = "Extraction failed";
    draft.extraction = { status: "Failed", method: "Not completed", confidence: 0, errors: [error instanceof Error ? error.message : "Source extraction failed."] };
  }
  draft.updatedAt = new Date().toISOString();
  draft.audit.unshift({ timestamp: draft.updatedAt, action: "Source extraction completed", actor: actor.name, detail: draft.extraction.status });
  return persistDraft(draft);
}

export async function validateIntakeDraft(id: string, updates: Array<{ key: string; value: string; reason?: string }>, actor: WorkflowActor): Promise<IntakeDraft> {
  const draft = await getIntakeDraft(id);
  if (!draft) throw new Error("Intake draft not found.");
  for (const update of updates) {
    const current = draft.terms.find((item) => item.key === update.key);
    if (!current || !update.value.trim()) continue;
    const changed = current.value !== update.value;
    current.oldValue = changed ? current.value : "";
    current.value = update.value.trim();
    current.reviewStatus = "Validated";
    current.sourceType = changed ? "Analyst corrected" : "AI extracted and analyst validated";
    current.manuallyCorrected = changed;
    current.correctionReason = changed ? update.reason?.trim() ?? "" : "";
  }
  const unreviewed = draft.terms.filter((item) => item.reviewStatus !== "Validated");
  draft.status = draft.terms.length && unreviewed.length === 0 ? "Ready to create case" : "Validation required";
  draft.updatedAt = new Date().toISOString();
  draft.audit.unshift({ timestamp: draft.updatedAt, action: "Extraction validated", actor: actor.name, detail: `${draft.terms.length - unreviewed.length} terms validated against source evidence.` });
  return persistDraft(draft);
}

export async function createCaseFromIntakeDraft(id: string, actor: WorkflowActor): Promise<Record<string, any>> {
  const draft = await getIntakeDraft(id);
  if (!draft) throw new Error("Intake draft not found.");
  if (draft.status !== "Ready to create case") throw new Error("Validate every extracted term before creating a case.");
  const values = Object.fromEntries(draft.terms.map((item) => [item.key, item.value]));
  const rawEventType = values.eventType ?? "";
  const eventType = normalizeEventType(rawEventType);
  if (!eventType) {
    const eventTypeTerm = draft.terms.find((item) => item.key === "eventType");
    if (eventTypeTerm) eventTypeTerm.reviewStatus = "Needs review";
    else draft.terms.push(term("eventType", "Event type", "", "p. 1", "Event type could not be determined from the source.", 0));
    draft.status = "Validation required";
    draft.updatedAt = new Date().toISOString();
    draft.audit.unshift({ timestamp: draft.updatedAt, action: "Case creation blocked", actor: actor.name, detail: `Event type "${rawEventType || "not provided"}" could not be mapped to a supported corporate action type.` });
    await persistDraft(draft);
    throw new Error(`The extracted event type "${rawEventType || "not provided"}" could not be mapped to a supported corporate action type. Classify the event type as one of: ${canonicalEventTypes.join(", ")}.`);
  }
  const voluntary = /rights|tender|merger|election/i.test(eventType);
  const eventId = `evt-intake-${randomUUID()}`;
  const allEvents = await getCorporateActionEvents();
  const isin = values.securityIdentifier || "";
  const isCustodianNotification = draft.source.type === "structured-feed" || /SBI-SG|MT564/i.test(draft.source.label);
  const matchingSighting = isCustodianNotification
    ? allEvents.find((candidate) => candidate.isEarlySighting && candidate.eventType === eventType && candidate.securityMaster?.isin === isin)
    : undefined;
  const knownHolding = allEvents.find((candidate) => !candidate.isEarlySighting && candidate.securityMaster?.isin === isin);
  const decisionBlockedReason = "Awaiting custodian notification. You can review the likely impact now, but an instruction cannot be sent until SBI-SG confirms this action.";
  const now = new Date();
  const fallbackDeadline = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const event = {
    id: eventId,
    seedVersion: "intake-v1",
    isHero: false,
    reference: `INTAKE-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${eventId.slice(-6).toUpperCase()}`,
    noticeReference: `INTAKE-${eventId.slice(-8).toUpperCase()}`,
    issuer: values.issuer || "Issuer pending confirmation",
    security: values.securityIdentifier ? `ISIN ${values.securityIdentifier}` : "Security identifier pending",
    eventType,
    processingType: voluntary ? "Voluntary" : "Mandatory",
    status: isCustodianNotification ? "Under review" : "Early sighting",
    settlementStage: isCustodianNotification ? "Under review" : "Early sighting",
    marketDeadline: values.marketDeadline || "Confirm market deadline",
    internalDeadline: values.marketDeadline || "Confirm internal deadline",
    marketDeadlineAt: fallbackDeadline,
    internalDeadlineAt: fallbackDeadline,
    affectedAccounts: knownHolding?.affectedAccounts ?? 0,
    amount: 0,
    currency: "INR",
    receivedAt: draft.source.receivedAt,
    source: isCustodianNotification ? "Custodian · SBI-SG" : "Exchange filing · NSE/BSE",
    sourceRecords: [{
      id: `${eventId}-${isCustodianNotification ? "sbi" : "exchange"}`,
      channel: isCustodianNotification ? "Custodian" : "Exchange announcement",
      provider: isCustodianNotification ? "SBI-SG" : "NSE/BSE",
      messageType: isCustodianNotification ? "MT564" : "SEBI LODR filing",
      receivedAt: draft.source.receivedAt,
      assertedFields: Object.fromEntries(draft.terms.map((item) => [item.key, item.value])),
      primary: true,
    }],
    sourceAgreement: isCustodianNotification ? "Custodian terms received and compared with the early sighting." : "Awaiting SBI-SG MT564 confirmation.",
    isEarlySighting: !isCustodianNotification,
    impactBasis: isCustodianNotification ? "Confirmed" : "Indicative",
    decisionBlockedReason: isCustodianNotification ? "" : decisionBlockedReason,
    mergedFromSightingId: "",
    sourceDisagreements: [],
    notice: {
      documentName: draft.source.label,
      source: draft.source.type === "url" ? draft.source.sourceUrl : draft.source.type,
      receivedAt: draft.source.receivedAt,
      version: "v1 · extracted intake",
      role: "New",
      excerpt: draft.source.capturedText?.slice(0, 300) ?? "Source preserved with intake draft.",
      pages: draft.source.pages ?? [{ page: 1, text: draft.source.capturedText ?? "" }],
      uploadState: "Source preserved and analyst validated",
      sourceDocumentId: draft.id,
      sourcePath: draft.source.objectPath ?? "",
      sourceUrl: draft.source.sourceUrl ?? "",
      previewUrl: draft.source.previewUrl ?? "",
      extractionMethod: draft.extraction.method,
      extractionConfidence: draft.extraction.confidence,
    },
    terms: draft.terms,
    requiredTermKeys: draft.terms.map((item) => item.key),
    positions: knownHolding?.positions ?? [],
    schemeImpacts: (knownHolding?.schemeImpacts ?? []).map((impact: Record<string, any>) => ({ ...impact, status: isCustodianNotification ? "Confirmed" : "Indicative" })),
    options: [],
    instruction: { status: isCustodianNotification ? "Not generated" : "Unavailable", destination: "SBI-SG", reference: "", generatedAt: "", content: isCustodianNotification ? "Instruction can be prepared after terms and depository entitlement are confirmed." : "No MT565 can be sent until SBI-SG supplies its corporate action reference in an MT564.", simulated: false, approvalActor: "" },
    reconciliation: { expected: 0, actual: 0, difference: 0, tolerance: 0.01, status: "Not due", classification: "Not due", note: "Awaiting deterministic calculation and settlement monitoring.", expectedCash: 0, actualCash: 0, expectedSecurityQuantity: 0, actualSecurityQuantity: 0, expectedCurrency: "N/A", actualCurrency: "N/A", expectedSettlementDate: "", actualSettlementDate: "", expectedAccount: "No matched holdings yet", actualAccount: "", investigationSteps: [] },
    tasks: [],
    validation: { missingTerms: [], isReady: isCustodianNotification },
    calculation: { calculationRunAt: "", rounding: "Round cash to 2 decimal places and securities down to whole units unless notice terms specify otherwise.", assumptions: "Holdings matching must be completed before calculation.", sourceRule: "CA-CONTROL-003" },
    audit: [{ id: `audit-${eventId}`, eventId, action: isCustodianNotification ? "Custodian notification received" : "Early sighting logged", actor: actor.name, actorId: actor.id, actorRole: actor.role, actorType: "user", timestamp: new Date().toISOString(), detail: isCustodianNotification ? "SBI-SG MT564 terms were captured." : "Exchange evidence was captured for indicative impact planning.", previousValue: "", newValue: isCustodianNotification ? "Under review" : "Early sighting", reason: "", evidenceId: draft.id, workflowStatus: isCustodianNotification ? "Under review" : "Early sighting" }],
    securityMaster: { securityId: "", isin: values.securityIdentifier || "", ticker: "", securityName: values.issuer || "", currency: "N/A", market: "", status: "Pending match" },
  };
  const { corporateActionEventsTable, db } = await import("@workspace/db");
  if (matchingSighting) {
    const disagreements = draft.terms.flatMap((confirmed) => {
      const sighting = matchingSighting.terms?.find((item: Record<string, any>) => item.key === confirmed.key);
      if (!sighting || sighting.value === confirmed.value) return [];
      return [{ field: confirmed.label || confirmed.key, sightingValue: sighting.value, confirmedValue: confirmed.value, winner: confirmed.key === "eligibleQuantity" ? "Depository" : "Custodian" }];
    });
    Object.assign(event, {
      id: matchingSighting.id,
      reference: matchingSighting.reference,
      mergedFromSightingId: matchingSighting.id,
      sourceRecords: [...(matchingSighting.sourceRecords ?? []), ...event.sourceRecords],
      sourceDisagreements: disagreements,
      positions: matchingSighting.positions ?? event.positions,
      schemeImpacts: (matchingSighting.schemeImpacts ?? event.schemeImpacts).map((impact: Record<string, any>) => ({ ...impact, status: "Confirmed" })),
      affectedAccounts: matchingSighting.affectedAccounts ?? event.affectedAccounts,
      audit: [...event.audit, ...(matchingSighting.audit ?? [])],
    });
    await db.update(corporateActionEventsTable).set({ data: event }).where(eq(corporateActionEventsTable.id, matchingSighting.id));
  } else {
    await db.insert(corporateActionEventsTable).values({ id: event.id, data: event });
  }
  draft.status = matchingSighting ? "Merged with custodian notification" : "Early sighting logged";
  draft.caseId = matchingSighting?.id ?? event.id;
  draft.updatedAt = new Date().toISOString();
  draft.audit.unshift({ timestamp: draft.updatedAt, action: matchingSighting ? "Sighting merged" : "Early sighting logged", actor: actor.name, detail: event.reference });
  Object.assign(event, deriveEventSignals(event));
  await persistDraft(draft);
  return event;
}

export async function listLatestIntakeDrafts(): Promise<IntakeDraft[]> {
  const { corporateActionIntakeDraftsTable, db } = await import("@workspace/db");
  const rows = await db.select().from(corporateActionIntakeDraftsTable).orderBy(desc(corporateActionIntakeDraftsTable.updatedAt)).limit(20);
  return rows.map((row) => row.data as IntakeDraft);
}