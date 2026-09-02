import { useGetDashboard, type EventSummary } from "@workspace/api-client-react";
import { AlertCircle, ArrowRight, CalendarClock, CircleDollarSign, CheckCircle2, CircleAlert, Radio } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";
import { fundManagerStatus, isComplete, isDecisionNeeded } from "@/lib/status";

function relativeArrival(timestamp: string) {
  const arrival = new Date(timestamp);
  if (Number.isNaN(arrival.getTime())) return "Arrival unavailable";
  const diffMinutes = Math.max(0, Math.round((Date.now() - arrival.getTime()) / 60_000));
  if (diffMinutes < 60) return `${diffMinutes || 1} min ago`;
  if (diffMinutes < 1_440) return `${Math.round(diffMinutes / 60)} hr ago`;
  const days = Math.round(diffMinutes / 1_440);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function actionName(eventType: string) {
  if (eventType === "Cash dividend") return "Dividend";
  if (eventType === "Stock split") return "Split";
  if (eventType === "Bonus issue") return "Bonus issue";
  if (eventType === "Rights issue") return "Rights issue";
  if (eventType === "Tender offer") return "Buyback";
  if (eventType === "Merger / demerger") return "Merger";
  return eventType;
}

function needsDecision(event: EventSummary) {
  return isDecisionNeeded(event.status);
}

function impactCopy(event: EventSummary) {
  const cash = event.schemeImpacts.reduce((total, impact) => total + impact.cashAmount, 0);
  const direction = event.schemeImpacts.find((impact) => impact.affected && impact.direction !== "Neutral")?.direction;
  if (cash > 0 && direction === "Funding") return { label: "Funding", value: formatInr(cash), tone: "text-rose-700" };
  if (cash > 0 && direction === "Receivable") return { label: "Receivable", value: formatInr(cash), tone: "text-emerald-700" };
  const quantity = event.schemeImpacts.reduce((total, impact) => total + (impact.quantityResult ?? 0), 0);
  if (quantity > 0) {
    const label = event.eventType === "Stock split" ? "Post-split quantity" : event.eventType === "Bonus issue" ? "Bonus shares" : "Security quantity";
    return { label, value: `${quantity.toLocaleString("en-IN")} shares`, tone: "text-slate-800" };
  }
  return { label: "Impact", value: "Not applicable", tone: "text-slate-500" };
}

function navImpactCopy(event: EventSummary) {
  return event.materialityPaise === null ? "" : `${event.materialityPaise.toFixed(2)} paise`;
}

function needsFromYou(event: EventSummary) {
  if (isComplete(event.status)) return "Settled";
  if (fundManagerStatus(event.status) === "With Compliance") return "With Compliance";
  if (needsDecision(event) || fundManagerStatus(event.status) === "Terms being confirmed") return `Decide by ${event.internalDeadline}`;
  if (event.processingType === "Mandatory") return "Nothing, mandatory";
  if (fundManagerStatus(event.status) === "Settlement break") return "Exception under review";
  return "Nothing required";
}

function isinFromSecurity(security: string) {
  return security.match(/ISIN\s+([^·\s]+)/)?.[1] ?? security;
}

export default function Dashboard() {
  const { data: dashboard, isLoading, isError, refetch } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-stone-50 p-8">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading portfolio corporate actions...
        </div>
      </div>
    );
  }

  if (isError || !dashboard) {
    return (
      <div className="flex flex-1 items-center justify-center bg-stone-50 p-6">
        <Card className="max-w-md border-rose-200">
          <CardContent className="space-y-4 p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
            <div>
              <h1 className="font-semibold text-slate-900">Portfolio impact is unavailable</h1>
              <p className="mt-1 text-sm text-slate-500">The dashboard will not replace missing corporate-action or scheme data with zeroes.</p>
            </div>
            <Button onClick={() => void refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedEvents = dashboard.inboundEvents;
  const schemeRows = dashboard.schemes.map((row) => ({
    scheme: { id: row.id, name: row.name, category: row.category },
    openActions: row.openActions.map((action) => ({ event: { id: action.eventId, issuer: action.issuer, eventType: action.eventType } })),
    funding: row.fundingNeeded,
    cashAvailable: row.cashAvailable,
    shortfall: row.shortfall,
    navImpact: row.totalNavImpactPaise,
    flag: row.flag,
  }));
  const affectedSchemeRows = schemeRows.filter(({ openActions }) => openActions.length > 0);
  const unaffectedSchemeRows = schemeRows.filter(({ openActions }) => openActions.length === 0);
  const unaffectedLabels = unaffectedSchemeRows.map(({ scheme }) => (
    scheme.category === "Banking" ? "Banking & Financial" : scheme.category
  ));
  const attentionCount = sortedEvents.filter((event) => Boolean(event.attention)).length;

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Corporate Actions Copilot</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground">Portfolio operations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Monitor incoming notices, assess scheme impact, and control decisions from one place.</p>
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4 sm:p-5">
        <section aria-labelledby="morning-status">
           <div className="overflow-hidden rounded border border-primary/30 bg-card shadow-sm">
             <div className="h-1 bg-primary" />
            <div className="flex flex-col gap-4 px-5 py-4 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
              <div>
                 <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  <CalendarClock className="h-4 w-4" />
                  Last 24 hours
                </div>
                 <p id="morning-status" className="max-w-5xl text-base font-semibold leading-7 text-foreground">
                   {dashboard.arrivalCount24h} notices in the last 24 hours. {dashboard.portfolioEventCount} affect your schemes.{" "}
                   {dashboard.impactedSchemeCount} of {dashboard.totalSchemeCount} schemes impacted.{" "}
                   {dashboard.totalFunding > 0 ? `${formatInr(dashboard.totalFunding)} to fund` : "No funding required"}
                   {dashboard.nearestDeadline ? ` by ${dashboard.nearestDeadline} for ${dashboard.nearestFundingIssuer}.` : "."}
                </p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
                <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
                  <span className="block text-xs text-slate-500">Last 24 hours</span>
                   <strong className="figure text-left text-lg text-slate-950">{dashboard.arrivalCount24h}</strong>
                </div>
                <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
                  <span className="block text-xs text-slate-500">Affect Arka</span>
                   <strong className="figure text-left text-lg text-slate-950">{dashboard.portfolioEventCount}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="control-pulse" className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
          <div className="dashboard-panel dashboard-panel--accent">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  <Radio className="h-3.5 w-3.5" />
                  Control pulse
                </div>
                <h2 id="control-pulse" className="mt-2 text-lg font-semibold tracking-tight text-foreground">Portfolio coverage at a glance</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Live ledger
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <VisualMetric label="Notices" value={dashboard.arrivalCount24h} detail="last 24 hours" />
              <VisualMetric label="Schemes touched" value={`${dashboard.impactedSchemeCount}/${dashboard.totalSchemeCount}`} detail="portfolio coverage" />
              <VisualMetric label="Needs attention" value={attentionCount} detail="decision or exception" />
            </div>
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Scheme coverage</span>
                <span className="figure-inline">{dashboard.impactedSchemeCount} impacted · {unaffectedSchemeRows.length} unaffected</span>
              </div>
              <div className="flex h-3 gap-1" aria-label={`${dashboard.impactedSchemeCount} of ${dashboard.totalSchemeCount} schemes impacted`}>
                {schemeRows.map(({ scheme, openActions }) => (
                  <div key={scheme.id} title={`${scheme.name}: ${openActions.length ? "Impacted" : "Unaffected"}`} className={`min-w-2 flex-1 rounded-sm ${openActions.length ? "bg-primary" : "bg-border"}`} />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" /> Impacted</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-border" /> Unaffected</span>
              </div>
            </div>
          </div>

          <div className="dashboard-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Action queue</div>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">What needs a look</h2>
              </div>
              <Link href="/events" className="text-xs font-semibold text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-1">
              {sortedEvents.slice(0, 4).map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted">
                  <span className={`h-8 w-1 rounded-full ${event.attention ? "bg-warning" : "bg-success"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{event.issuer}</span>
                    <span className="block truncate text-xs text-muted-foreground">{actionName(event.eventType)} · {relativeArrival(event.receivedAt)}</span>
                  </span>
                  {event.attention ? <CircleAlert className="h-4 w-4 shrink-0 text-warning" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="inbound-actions">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="inbound-actions" className="text-lg font-semibold text-slate-950">Inbound corporate actions</h2>
              <p className="mt-1 text-sm text-slate-500">What arrived, what it touches, and what Arka needs to do.</p>
            </div>
            <Link href="/events" className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground gap-1.5">
              Corporate actions <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                   <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Issuer + ISIN</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Arrived</TableHead>
                     <TableHead className="text-right">Schemes impacted</TableHead>
                     <TableHead>Impact</TableHead>
                     <TableHead className="text-right">Materiality</TableHead>
                     <TableHead>Attention</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEvents.map((event) => {
                    const impacted = event.schemeImpacts.filter((impact) => impact.affected).length;
                    const impact = impactCopy(event);
                    return (
                      <TableRow key={event.id} className="group align-top">
                         <TableCell className="figure">
                          <div className="font-semibold text-slate-950">{event.issuer}</div>
                          <div className="mt-1 font-mono text-[11px] text-slate-500">{isinFromSecurity(event.security)}</div>
                        </TableCell>
                        <TableCell className="font-medium text-slate-700">{actionName(event.eventType)}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-slate-700">{relativeArrival(event.receivedAt)}</div>
                          <div className="mt-1 max-w-36 text-xs leading-4 text-slate-500">{event.source}</div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/events/${event.id}`} className="font-semibold text-primary hover:underline">
                             {impacted} of {dashboard.totalSchemeCount}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{impact.label}</div>
                           <div className={`figure mt-1 font-semibold ${impact.tone}`}>{impact.value}</div>
                        </TableCell>
                         <TableCell className="figure">{navImpactCopy(event)}</TableCell>
                        <TableCell>
                          {event.attention
                            ? <span className="inline-flex rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{event.attention}</span>
                            : <span className="text-slate-500">{needsFromYou(event)}</span>}
                        </TableCell>
                        <TableCell>
                          <Link href={`/events/${event.id}`} className="inline-flex h-8 w-8 items-center justify-center whitespace-nowrap rounded-md text-sm font-medium text-slate-400 transition-colors hover:bg-accent hover:text-primary group-hover:text-primary">
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        <section aria-labelledby="scheme-impact">
          <div className="mb-3">
            <h2 id="scheme-impact" className="text-lg font-semibold text-slate-950">Your schemes</h2>
            <p className="mt-1 text-sm text-slate-500">The same corporate actions viewed from each fund you manage.</p>
          </div>
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                   <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Scheme</TableHead>
                    <TableHead>Open corporate actions touching it</TableHead>
                    <TableHead>Total NAV impact</TableHead>
                    <TableHead>Funding gap</TableHead>
                    <TableHead>Flag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affectedSchemeRows.map(({ scheme, openActions, funding, cashAvailable, shortfall, navImpact, flag }) => (
                    <TableRow key={scheme.id}>
                      <TableCell>
                        <Link href={`/schemes/${scheme.id}`} className="font-semibold text-primary hover:underline">{scheme.name}</Link>
                        <div className="mt-1 text-xs text-slate-500">{scheme.category}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {openActions.map(({ event }) => (
                            <Link key={event.id} href={`/events/${event.id}`} className="inline-flex rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-primary">
                              {event.issuer} {actionName(event.eventType).toLowerCase()}
                            </Link>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                         {navImpact > 0 ? <span className="figure font-semibold">{navImpact.toFixed(2)} paise</span> : <span className="text-muted-foreground">Neutral</span>}
                      </TableCell>
                      <TableCell>
                        {funding > 0 ? (
                          <div className="text-xs leading-5 text-slate-700">
                            <div>Needs <strong>{formatInr(funding)}</strong> · Has <strong>{formatInr(cashAvailable)}</strong></div>
                            <div className={shortfall > 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>
                              {shortfall > 0 ? `Short ${formatInr(shortfall)}` : "Comfortable"}
                            </div>
                          </div>
                        ) : <span className="text-slate-500">No funding gap</span>}
                      </TableCell>
                      <TableCell>
                        {flag ? (
                          <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                            <CircleDollarSign className="h-3.5 w-3.5" /> {flag}
                          </span>
                        ) : <span className="text-slate-400">None</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {unaffectedSchemeRows.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-4 text-sm text-slate-500">
                        {unaffectedSchemeRows.length} schemes unaffected: {unaffectedLabels.join(", ")}.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function VisualMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-md border border-border/80 bg-background/70 px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="figure mt-2 text-left text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}
