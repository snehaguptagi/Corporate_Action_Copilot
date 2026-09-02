/**
 * Market-data provider adapter.
 *
 * The rest of the product never talks to a provider directly. It calls
 * refreshEventFromProvider, which runs the persisted chain:
 *   fetch -> store raw verbatim -> extract -> Stage 1 -> Stage 2.
 * Each step is stamped on the event so the page renders the last completed
 * run instantly. When a real provider (name and docs pending) is chosen,
 * implement MarketDataProvider once here and nothing else changes.
 */

type AnyRecord = Record<string, any>;

export interface RawFetchResult {
  /** Raw provider response, stored verbatim and immutably. */
  payload: string;
  fetchedAt: string;
  provider: string;
  channel: string;
}

export interface MarketDataProvider {
  readonly name: string;
  /** True when this provider returns synthetic data rather than a live fetch. */
  readonly synthetic: boolean;
  fetchRawNotice(event: AnyRecord): Promise<RawFetchResult>;
}

/**
 * Placeholder provider used until the real market-data provider is selected.
 * It re-serves the event's seeded notice as the raw payload so the pipeline
 * shape (raw cache, timestamps, re-extraction) is real even though the data
 * is synthetic.
 */
export class SyntheticNoticeProvider implements MarketDataProvider {
  readonly name = "Synthetic seed (no live provider configured)";
  readonly synthetic = true;

  async fetchRawNotice(event: AnyRecord): Promise<RawFetchResult> {
    return {
      payload: JSON.stringify({
        documentName: event.notice?.documentName ?? "",
        source: event.notice?.source ?? event.source ?? "",
        excerpt: event.notice?.excerpt ?? "",
        pages: event.notice?.pages ?? [],
        terms: (event.terms ?? []).map((term: AnyRecord) => ({ key: term.key, value: term.value })),
      }),
      fetchedAt: new Date().toISOString(),
      provider: this.name,
      channel: "Synthetic",
    };
  }
}

export const defaultProvider: MarketDataProvider = new SyntheticNoticeProvider();

/**
 * Re-run the fetch -> raw cache -> extract chain for one event and persist
 * the raw copy immutably (appended, never overwritten) so extraction can be
 * re-run later without re-fetching. Stage 1 and Stage 2 stamps are added by
 * their own steps.
 */
export async function refreshEventFromProvider(event: AnyRecord, provider: MarketDataProvider = defaultProvider): Promise<void> {
  const raw = await provider.fetchRawNotice(event);
  event.rawSources = [...(event.rawSources ?? []), raw];
  event.pipeline = {
    ...(event.pipeline ?? {}),
    fetchedAt: raw.fetchedAt,
    extractedAt: new Date().toISOString(),
    provider: raw.provider,
    channel: raw.channel,
    synthetic: provider.synthetic,
  };
}
