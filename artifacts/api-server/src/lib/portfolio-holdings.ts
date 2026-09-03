import { ARKA_SCHEME_SEED } from "./arka-desk";

/**
 * Portfolio holdings master for the Arka schemes.
 *
 * Real fetched notices name real Indian issuers. To analyse a captured notice
 * against the house portfolio, each scheme carries positions in widely held
 * NSE/BSE names. Matching is by ISIN first, then by issuer-name alias.
 */
export type PortfolioHolding = {
  issuer: string;
  isin: string;
  ticker: string;
  aliases: string[];
  /** Scheme id -> equity shares held. */
  positions: Record<string, number>;
};

export const PORTFOLIO_HOLDINGS: PortfolioHolding[] = [
  { issuer: "Reliance Industries Ltd", isin: "INE002A01018", ticker: "RELIANCE", aliases: ["reliance industries", "reliance", "ril"], positions: { "arka-large-cap": 1_500_000, "arka-flexi-cap": 620_000, "arka-focused-25": 900_000, "arka-nifty-50": 410_000, "arka-value": 350_000 } },
  { issuer: "Tata Consultancy Services Ltd", isin: "INE467B01029", ticker: "TCS", aliases: ["tata consultancy services", "tata consultancy", "tcs"], positions: { "arka-large-cap": 850_000, "arka-flexi-cap": 380_000, "arka-nifty-50": 260_000, "arka-elss-tax-saver": 240_000 } },
  { issuer: "HDFC Bank Ltd", isin: "INE040A01034", ticker: "HDFCBANK", aliases: ["hdfc bank"], positions: { "arka-large-cap": 2_600_000, "arka-banking-financial": 1_900_000, "arka-nifty-50": 780_000, "arka-flexi-cap": 700_000 } },
  { issuer: "ICICI Bank Ltd", isin: "INE090A01021", ticker: "ICICIBANK", aliases: ["icici bank", "icici"], positions: { "arka-banking-financial": 2_400_000, "arka-large-cap": 1_800_000, "arka-nifty-50": 660_000 } },
  { issuer: "State Bank of India", isin: "INE062A01020", ticker: "SBIN", aliases: ["state bank of india", "sbi"], positions: { "arka-banking-financial": 2_800_000, "arka-value": 1_200_000, "arka-nifty-50": 540_000 } },
  { issuer: "Infosys Ltd", isin: "INE009A01021", ticker: "INFY", aliases: ["infosys"], positions: { "arka-large-cap": 1_400_000, "arka-elss-tax-saver": 520_000, "arka-nifty-50": 480_000 } },
  { issuer: "ITC Ltd", isin: "INE154A01025", ticker: "ITC", aliases: ["itc"], positions: { "arka-value": 2_400_000, "arka-nifty-50": 1_050_000, "arka-flexi-cap": 950_000 } },
  { issuer: "Larsen & Toubro Ltd", isin: "INE018A01030", ticker: "LT", aliases: ["larsen and toubro", "larsen & toubro", "larsen", "l&t"], positions: { "arka-infrastructure": 380_000, "arka-large-cap": 520_000, "arka-nifty-50": 210_000 } },
  { issuer: "Bharti Airtel Ltd", isin: "INE397D01024", ticker: "BHARTIARTL", aliases: ["bharti airtel", "airtel"], positions: { "arka-flexi-cap": 640_000, "arka-focused-25": 550_000, "arka-nifty-50": 400_000 } },
  { issuer: "Hindustan Unilever Ltd", isin: "INE030A01027", ticker: "HINDUNILVR", aliases: ["hindustan unilever", "hul"], positions: { "arka-large-cap": 480_000, "arka-elss-tax-saver": 300_000, "arka-nifty-50": 220_000 } },
  { issuer: "NTPC Ltd", isin: "INE733E01010", ticker: "NTPC", aliases: ["ntpc"], positions: { "arka-infrastructure": 2_900_000, "arka-value": 1_600_000, "arka-nifty-50": 900_000 } },
  { issuer: "Tata Motors Ltd", isin: "INE155A01022", ticker: "TATAMOTORS", aliases: ["tata motors"], positions: { "arka-flexi-cap": 850_000, "arka-value": 700_000, "arka-nifty-50": 380_000 } },
  { issuer: "Wipro Ltd", isin: "INE075A01022", ticker: "WIPRO", aliases: ["wipro"], positions: { "arka-elss-tax-saver": 800_000, "arka-mid-cap": 950_000 } },
  { issuer: "Tata Steel Ltd", isin: "INE081A01020", ticker: "TATASTEEL", aliases: ["tata steel"], positions: { "arka-value": 3_200_000, "arka-nifty-50": 1_400_000, "arka-infrastructure": 1_100_000 } },
  { issuer: "Vedanta Ltd", isin: "INE205A01025", ticker: "VEDL", aliases: ["vedanta"], positions: { "arka-value": 1_500_000, "arka-mid-cap": 1_100_000 } },
];

function normalizeIssuerName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/\b(ltd|limited|plc|india|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchPortfolioHolding(issuer: string, isin: string): PortfolioHolding | undefined {
  const canonicalIsin = isin.trim().toUpperCase();
  if (canonicalIsin) {
    const byIsin = PORTFOLIO_HOLDINGS.find((holding) => holding.isin === canonicalIsin);
    if (byIsin) return byIsin;
    // A well-formed ISIN that we do not hold must not fall through to a name
    // match: it may be a different security of a matched issuer, or a
    // different company entirely.
    if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(canonicalIsin)) return undefined;
  }
  const name = normalizeIssuerName(issuer);
  if (!name) return undefined;
  return PORTFOLIO_HOLDINGS.find((holding) => holding.aliases.some((alias) => {
    const normalizedAlias = normalizeIssuerName(alias) || alias.toLowerCase();
    return new RegExp(`\\b${escapeRegExp(normalizedAlias)}\\b`).test(name);
  }));
}

const monthNames: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(year: number, month: number, day: number): string {
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parse Indian-notice date phrasing to yyyy-mm-dd. Returns "" when unparseable. */
export function parseNoticeDate(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const isoMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoMatch) return isoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  const dayMonthYear = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})/.exec(value);
  if (dayMonthYear) {
    const month = monthNames[dayMonthYear[2].slice(0, 3).toLowerCase()];
    if (month) return isoDate(Number(dayMonthYear[3]), month, Number(dayMonthYear[1]));
  }
  const monthDayYear = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(value);
  if (monthDayYear) {
    const month = monthNames[monthDayYear[1].slice(0, 3).toLowerCase()];
    if (month) return isoDate(Number(monthDayYear[3]), month, Number(monthDayYear[2]));
  }
  const numeric = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(value);
  if (numeric) return isoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  return "";
}

/** Parse a deadline phrase to a full ISO timestamp, defaulting to 15:30 IST. */
export function parseNoticeDeadline(raw: string): string {
  const date = parseNoticeDate(raw);
  if (!date) return "";
  const time = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/i.exec(raw ?? "");
  let hours = time ? Number(time[1]) : 15;
  const minutes = time ? Number(time[2]) : 30;
  const meridiem = time?.[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  const utcMillis = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hours,
    minutes,
  ) - (5 * 60 + 30) * 60_000; // interpret as IST
  return new Date(utcMillis).toISOString();
}

function parseNumberToken(raw: string): number | null {
  const match = /-?[\d,]+(?:\.\d+)?/.exec((raw ?? "").replace(/\u20b9/g, ""));
  if (!match) return null;
  const value = Number(match[0].replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

function parseRatio(raw: string): { numerator: number; denominator: number } | null {
  const pair = /(\d+(?:\.\d+)?)\s*(?:for|:|\/|per)\s*(?:every\s+)?(\d+(?:\.\d+)?)/i.exec(raw ?? "");
  if (pair) {
    const numerator = Number(pair[1]);
    const denominator = Number(pair[2]);
    if (numerator > 0 && denominator > 0) return { numerator, denominator };
    return null;
  }
  const single = parseNumberToken(raw ?? "");
  return single && single > 0 ? { numerator: single, denominator: 1 } : null;
}

function parsePercent(raw: string): number | null {
  const value = parseNumberToken(raw ?? "");
  if (value === null || value < 0) return null;
  return /%/.test(raw ?? "") || value > 1 ? value / 100 : value;
}

export type DerivedCalculationInputs = {
  inputs: Record<string, unknown>;
  /** Human labels for numeric terms that block quantification. */
  missing: string[];
  /** Assumption notes to surface with the indicative estimate. */
  notes: string[];
};

/** Map validated notice terms to the deterministic calculation inputs for the event type. */
export function deriveCalculationInputs(eventType: string, values: Record<string, string>): DerivedCalculationInputs {
  const inputs: Record<string, unknown> = {};
  const missing: string[] = [];
  const notes: string[] = [];

  const recordDate = parseNoticeDate(values.recordDate ?? "");
  if (recordDate) inputs.recordDate = recordDate;
  else notes.push("Record date could not be read from the source; eligibility is assessed on current holdings.");

  if (eventType === "Cash dividend") {
    const rate = parseNumberToken(values.rate ?? "");
    if (rate && rate > 0) inputs.rate = rate;
    else missing.push("cash rate per share");
    inputs.withholdingRate = 0;
    inputs.currency = "INR";
    inputs.cashDecimals = 2;
    notes.push("Withholding is shown at 0% until the TDS treatment for the schemes is confirmed.");
  } else if (eventType === "Stock split") {
    const ratio = parseRatio(values.splitRatio ?? "");
    if (ratio) inputs.splitFactor = Math.max(ratio.numerator, ratio.denominator) / Math.min(ratio.numerator, ratio.denominator);
    else missing.push("split ratio");
  } else if (eventType === "Bonus issue") {
    const ratio = parseRatio(values.bonusRatio ?? "");
    if (ratio) {
      inputs.ratioNumerator = ratio.numerator;
      inputs.ratioDenominator = ratio.denominator;
    } else missing.push("bonus ratio");
  } else if (eventType === "Rights issue") {
    const ratio = parseRatio(values.rightsRatio ?? "");
    if (ratio) {
      inputs.ratioNumerator = ratio.numerator;
      inputs.ratioDenominator = ratio.denominator;
    } else missing.push("rights ratio");
    const price = parseNumberToken(values.subscriptionPrice ?? "");
    if (price && price > 0) inputs.subscriptionPrice = price;
    else missing.push("subscription price");
    inputs.currency = "INR";
  } else if (eventType === "Tender offer") {
    const price = parseNumberToken(values.offerPrice ?? "");
    if (price && price > 0) inputs.offerPrice = price;
    else missing.push("offer price");
    const acceptance = parsePercent(values.maximumAcceptance ?? "");
    if (acceptance && acceptance > 0) inputs.maximumPercentage = Math.min(acceptance, 1);
    else {
      inputs.maximumPercentage = 1;
      notes.push("Full acceptance is assumed until the acceptance cap is confirmed.");
    }
  } else if (eventType === "Merger / demerger") {
    const exchangeRatio = parseRatio(values.shareExchangeRatio ?? "");
    if (exchangeRatio) inputs.shareExchangeRatio = exchangeRatio.numerator / exchangeRatio.denominator;
    else missing.push("share exchange ratio");
    const cashRate = parseNumberToken(values.cashRate ?? "");
    if (cashRate && cashRate >= 0) inputs.cashRate = cashRate;
    else {
      inputs.cashRate = 0;
      notes.push("No cash consideration was read from the source; the estimate assumes an all-stock exchange.");
    }
  }

  return { inputs, missing, notes };
}

/** Build eligible position rows for every scheme that holds the matched security. */
export function buildIntakePositions(holding: PortfolioHolding, isin: string, recordDate: string, eventId: string): Array<Record<string, unknown>> {
  const today = new Date().toISOString().slice(0, 10);
  const positionDate = recordDate && recordDate < today ? recordDate : today;
  return ARKA_SCHEME_SEED
    .filter((scheme) => (holding.positions[scheme.id] ?? 0) > 0)
    .map((scheme) => ({
      id: `pos-${eventId}-${scheme.id}`,
      fund: scheme.schemeName,
      account: scheme.id,
      isin,
      securityId: holding.ticker,
      eligibleQuantity: holding.positions[scheme.id],
      settledQuantity: holding.positions[scheme.id],
      positionDate,
      eligibilityStatus: "Eligible",
      accountStatus: "Active",
      dataQualityWarning: "",
    }));
}
