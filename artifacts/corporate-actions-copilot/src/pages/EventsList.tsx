import { getGetLastDiscoveryQueryKey, useGetLastDiscovery, useListEvents, useSearchLiveCorporateActions, type LiveDiscoveryResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, ChevronDown, ExternalLink, Globe2, Landmark, LoaderCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";
import { fundManagerStatus, statusOptions } from "@/lib/status";

function cashDirectionLabel(direction?: string) {
  if (direction === "Payable") return "Funding required";
  if (direction === "Receivable") return "Entitlement";
  return "";
}

export default function EventsList() {
  const { data: events, isLoading, isError, refetch } = useListEvents();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [processingType, setProcessingType] = useState("All");
  const [liveQuery, setLiveQuery] = useState("India corporate actions announced this week");
  const [discovery, setDiscovery] = useState<LiveDiscoveryResponse | null>(null);
  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const liveSearch = useSearchLiveCorporateActions({
    mutation: {
      onSuccess: (result) => {
        setDiscovery(result);
        queryClient.setQueryData(getGetLastDiscoveryQueryKey(), { searched: true, result });
      },
    },
  });
  const lastFetch = useGetLastDiscovery();
  const stored = !discovery && lastFetch.data?.searched ? lastFetch.data.result ?? null : null;
  const shown = discovery ?? stored;

  const filtered = useMemo(() => (events ?? []).filter((event) => {
    const haystack = `${event.reference} ${event.issuer} ${event.security} ${event.eventType}`.toLowerCase();
    return (!search || haystack.includes(search.toLowerCase()))
      && (status === "All" || fundManagerStatus(event.status, event.isEarlySighting) === status)
      && (processingType === "All" || event.processingType === processingType);
  }), [events, processingType, search, status]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading corporate actions...</div>;
  if (isError) return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
      <Card className="max-w-md border-rose-200">
        <CardContent className="space-y-4 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <div><h1 className="font-semibold">Could not load corporate actions</h1><p className="mt-1 text-sm text-slate-500">No empty list has been shown in place of live event data.</p></div>
          <Button onClick={() => void refetch()}>Retry</Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <div className="border-b bg-card px-8 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-[28px] font-semibold tracking-tight text-foreground"><Landmark className="h-6 w-6 text-primary" />Corporate actions</h1>
            <p className="mt-1 text-sm text-slate-500">Decision deadlines first, then constraints and settlement breaks, followed by computed materiality.</p>
          </div>
          <Link href="/intake"><Button variant="outline" size="sm">Add manually</Button></Link>
        </div>
      </div>
      <div className="p-8">
        <Card className="mb-4 border-amber-200 bg-amber-50/30">
          <CardHeader className="border-b border-amber-200 bg-amber-50/60">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <Globe2 className="h-5 w-5 text-amber-700" />
                  <h2 className="text-lg font-semibold text-slate-900">Live notice discovery</h2>
                  <Badge variant="warning">Indicative only</Badge>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">OpenAI searches public web sources and summarizes supported facts. Results remain unverified until the original evidence is captured and custodian terms are confirmed.</p>
              </div>
              {shown && (
                <div className="figure-inline shrink-0 text-right text-xs text-slate-500">
                  <div>{stored ? "Last fetch" : "Searched"} {new Date(shown.searchedAt).toLocaleString("en-IN")}</div>
                  {stored && <div className="mt-0.5 max-w-xs truncate italic">"{shown.query}"</div>}
                </div>
              )}
            </div>
            <form
              className="mt-4 flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (liveQuery.trim().length >= 3) liveSearch.mutate({ data: { query: liveQuery.trim() } });
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="bg-white pl-9" value={liveQuery} onChange={(event) => setLiveQuery(event.target.value)} placeholder="Search issuer, market, security, or corporate-action type" />
              </div>
              <Button type="submit" disabled={liveSearch.isPending || liveQuery.trim().length < 3}>
                {liveSearch.isPending ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Searching...</> : "Search public sources"}
              </Button>
            </form>
            {liveSearch.isError && <div className="mt-3 flex items-center gap-2 text-sm text-rose-700"><AlertCircle className="h-4 w-4" />{liveSearch.error instanceof Error ? liveSearch.error.message : "Live discovery failed."}</div>}
          </CardHeader>
          {shown && (
            <CardContent className="p-0">
              <div className="border-b border-amber-200 px-5 py-3 text-xs leading-5 text-amber-900">
                {stored ? "These are the results of your last fetch. Search again to refresh them. " : ""}{shown.warning}
              </div>
              {shown.notices.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-500">No supported public notices were found for this search. Try a named issuer, exchange, or event type.</div>
              ) : (
                <div className="divide-y">
                  {shown.notices.map((notice) => {
                    const open = expandedNoticeId === notice.id;
                    return (
                      <article key={notice.id} className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedNoticeId(open ? null : notice.id)}
                          aria-expanded={open}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-slate-900">{notice.title}</h3>
                              <Badge variant="outline">{notice.confidence}</Badge>
                              {notice.eventType && <Badge variant="secondary">{notice.eventType}</Badge>}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{[notice.issuer, notice.publishedAt].filter(Boolean).join(" · ") || "Source date and issuer require review"}</div>
                          </div>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && (
                          <div className="mt-3 border-t border-amber-100 pt-3">
                            <p className="max-w-4xl text-sm leading-6 text-slate-700">{notice.summary}</p>
                            {notice.terms.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Stated terms</p>
                                <div className="mt-1.5 flex flex-wrap gap-2">{notice.terms.map((term) => <span key={term} className="rounded border bg-white px-2 py-1 text-xs text-slate-600">{term}</span>)}</div>
                              </div>
                            )}
                            <p className="mt-3 max-w-4xl text-xs leading-5 text-amber-800">{notice.whyRelevant}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Link href={`/intake?sourceUrl=${encodeURIComponent(notice.sourceUrl)}`}><Button size="sm">Capture &amp; analyse</Button></Link>
                              <a href={notice.sourceUrl} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">Open source <ExternalLink className="ml-2 h-3.5 w-3.5" /></Button></a>
                              <p className="text-xs leading-5 text-slate-500">Capture pulls the source evidence, extracts the relevant facts, then opens the case: Stage 1 deterministic numbers against your schemes, Stage 2 AI judgement, and the decision. The dashboard and portfolio update as soon as the case is created.</p>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader className="border-b bg-card">
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, issuer, security, or event type" />
              </div>
              <select className="h-9 rounded border bg-card px-3 text-sm outline-none transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option>All</option>
                {statusOptions.map((value) => <option key={value}>{value}</option>)}
              </select>
              <select className="h-9 rounded border bg-card px-3 text-sm outline-none transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={processingType} onChange={(event) => setProcessingType(event.target.value)}>
                <option>All</option>
                {[...new Set((events ?? []).map((event) => event.processingType))].map((value) => <option key={value}>{value}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead>Event</TableHead><TableHead className="text-right">Schemes impacted</TableHead><TableHead>Classification</TableHead><TableHead className="text-right">Materiality</TableHead><TableHead className="text-right">Cash impact</TableHead><TableHead>Attention</TableHead><TableHead className="text-right">Decision deadline</TableHead><TableHead>Status</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="h-32 text-center text-slate-500">No events match these filters.</TableCell></TableRow> : filtered.map((event) => {
                    const impacted = event.schemeImpacts.filter((impact) => impact.affected).length;
                    const cashTotal = event.schemeImpacts.filter((impact) => impact.affected).reduce((total, impact) => total + impact.cashAmount, 0);
                    return (
                    <TableRow key={event.id} className="group">
                      <TableCell><div className="font-medium">{event.issuer}</div><div className="text-xs text-slate-500">{event.reference} · {event.eventType} · {event.security}</div>{event.isEarlySighting && <div className="mt-1 text-xs font-semibold text-amber-700">Indicative impact</div>}{event.source === "Public web discovery" ? <div className="mt-1 text-xs font-semibold text-slate-500">Fetched from public web source</div> : <div className="mt-1 text-xs font-semibold text-slate-500">Synthetic record, no live fetch yet</div>}</TableCell>
                      <TableCell className="figure"><strong>{impacted}</strong> of 10</TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.processingType}</Badge>
                        {cashDirectionLabel(event.cashDirection) && <div className="mt-1 text-xs font-medium text-slate-600">{cashDirectionLabel(event.cashDirection)}</div>}
                      </TableCell>
                      <TableCell className="figure font-semibold">{event.materialityPaise === null ? "Neutral" : `${event.materialityPaise.toFixed(2)} paise`}</TableCell>
                      <TableCell className="figure font-medium">{cashTotal > 0 ? formatInr(cashTotal) : "No cash movement"}</TableCell>
                      <TableCell>{event.attention && <Badge variant="warning">{event.attention}</Badge>}</TableCell>
                      <TableCell className="figure text-sm text-muted-foreground">{event.internalDeadline}</TableCell>
                      <TableCell><Badge variant="secondary">{fundManagerStatus(event.status, event.isEarlySighting)}</Badge></TableCell>
                      <TableCell><Link href={`/events/${event.id}`}><Button variant="outline" size="sm" aria-label={`View ${event.reference}`}>View <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></Link></TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}