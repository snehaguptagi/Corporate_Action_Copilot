import OpenAI from "openai";

export type LiveDiscoveryNotice = {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: string;
  issuer: string;
  eventType: string;
  summary: string;
  terms: string[];
  whyRelevant: string;
  confidence: "Unverified";
};

export type LiveDiscoveryResponse = {
  mode: "Indicative discovery";
  query: string;
  searchedAt: string;
  warning: string;
  notices: LiveDiscoveryNotice[];
};

const maxQueryLength = 240;

function cleanText(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeUrl(value: unknown): string {
  const candidate = cleanText(value, 1000);
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function parseJsonOutput(text: string): { notices?: Array<Record<string, unknown>> } {
  const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as { notices?: Array<Record<string, unknown>> };
  } catch {
    return {};
  }
}

function collectCitations(response: any): Array<{ url: string; title: string }> {
  const citations: Array<{ url: string; title: string }> = [];
  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        const url = safeUrl(annotation.url);
        if (annotation.type === "url_citation" && url && !citations.some((citation) => citation.url === url)) {
          citations.push({ url, title: cleanText(annotation.title, 180) || url });
        }
      }
    }
  }
  return citations;
}

function toNotice(item: Record<string, unknown>, citation: { url: string; title: string } | undefined, index: number): LiveDiscoveryNotice | null {
  const sourceUrl = safeUrl(item.sourceUrl) || citation?.url || "";
  const title = cleanText(item.title, 180) || citation?.title || "";
  const summary = cleanText(item.summary, 700);
  if (!sourceUrl || !title || !summary) return null;
  const terms = Array.isArray(item.terms) ? item.terms.filter((term): term is string => typeof term === "string").map((term) => term.trim().slice(0, 160)).filter(Boolean).slice(0, 12) : [];
  return {
    id: `live-${index + 1}-${Buffer.from(sourceUrl).toString("base64url").slice(0, 18)}`,
    title,
    sourceUrl,
    publishedAt: cleanText(item.publishedAt, 40),
    issuer: cleanText(item.issuer, 160),
    eventType: cleanText(item.eventType, 80),
    summary,
    terms,
    whyRelevant: cleanText(item.whyRelevant, 300) || "Review the original notice before recording any corporate-action case.",
    confidence: "Unverified",
  };
}

export async function searchLiveCorporateActions(rawQuery: string): Promise<LiveDiscoveryResponse> {
  const query = rawQuery.trim().slice(0, maxQueryLength);
  if (query.length < 3) throw new Error("Enter at least three characters to search live notices.");
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI discovery is not configured. Add the OPENAI_API_KEY secret.");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: "gpt-5.4-mini",
    tools: [{ type: "web_search_preview" } as any],
    input: `Find recent public corporate-action notices relevant to this search: "${query}".

Use web search and return JSON only in this exact shape:
{"notices":[{"title":"","sourceUrl":"","publishedAt":"","issuer":"","eventType":"","summary":"","terms":[],"whyRelevant":""}]}

Rules:
- Return at most 8 notices.
- Prefer official exchange, issuer, regulator, depository, custodian, or recognized market-data sources.
- Include only facts supported by the linked source.
- Use an empty string when a field is not stated.
- Do not invent dates, ratios, prices, quantities, or event classifications.
- This is indicative discovery only. Every result must be treated as unverified until source evidence is captured and custodian terms are confirmed.
- Search India first unless the query clearly names another market.`,
  } as any);

  const parsed = parseJsonOutput(response.output_text ?? "");
  const citations = collectCitations(response);
  const notices = (parsed.notices ?? [])
    .map((item, index) => toNotice(item, citations[index], index))
    .filter((notice): notice is LiveDiscoveryNotice => notice !== null)
    .slice(0, 8);
  const fallbackText = cleanText(response.output_text, 1000);
  if (!notices.length && fallbackText && citations[0]) {
    notices.push({
      id: `live-fallback-${Buffer.from(citations[0].url).toString("base64url").slice(0, 18)}`,
      title: citations[0].title,
      sourceUrl: citations[0].url,
      publishedAt: "",
      issuer: "",
      eventType: "",
      summary: fallbackText,
      terms: [],
      whyRelevant: "Open the source and capture the original evidence before creating a case.",
      confidence: "Unverified",
    });
  }

  return {
    mode: "Indicative discovery",
    query,
    searchedAt: new Date().toISOString(),
    warning: "Web results are indicative only. They do not confirm terms, quantities, eligibility, or deadlines and cannot generate instructions.",
    notices,
  };
}