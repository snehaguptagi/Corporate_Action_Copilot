import { useMemo } from "react";
import { useGetDashboard, useListSchemes, type EventSummary } from "@workspace/api-client-react";
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, CircleAlert } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CapHeadroom, DeadlineTimeline, FundingByWeek, VolumeVersusValue, openEventsOf } from "@/components/dashboard/charts";
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

function needsFromYou(event: EventSummary) {
  if (isComplete(event.status)) return "Settled";
  if (fundManagerStatus(event.status) === "With Compliance") return "With Compliance";
  if (isDecisionNeeded(event.status) || fundManagerStatus(event.status) === "Terms being confirmed") return `Decide by ${event.internalDeadline}`;
  if (event.processingType === "Mandatory") return "Nothing, mandatory";
  if (fundManagerStatus(event.status) === "Settlement break") return "Exception under review";
  return "Nothing required";
}

function isinFromSecurity(security: string) {
  return security.match(/ISIN\s+([^·\s]+)/)?.[1] ?? security;
}

/** "16 Sep 2026 · 15:00 IST" -> "16 Sep" */
function shortDeadline(display: string) {
  const parts = display.split(" ");
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : display;
}

export default function Dashboard() {
  const { data: dashboard, isLoading, isError, refetch } = useGetDashboard();
  const { data: schemes } = useListSchemes();
  const now = useMemo(() => Date.now(), [dashboard]);

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
  const openEvents = openEventsOf(sortedEvents);
  const attentionEvents = openEvents.filter((event) => Boolean(event.attention) || isDecisionNeeded(event.status));
  const queue = [...openEvents].sort((left, right) => {
    const leftUrgent = left.attention || isDecisionNeeded(left.status) ? 0 : 1;
    const rightUrgent = right.attention || isDecisionNeeded(right.status) ? 0 : 1;
    if (leftUrgent !== rightUrgent) return leftUrgent - rightUrgent;
    return Date.parse(left.internalDeadlineAt) - Date.parse(right.internalDeadlineAt);
  });

  const headline = attentionEvents.length > 0
    ? `${attentionEvents.length} corporate actions need you.${dashboard.totalFunding > 0 && dashboard.nearestDeadline ? ` ${formatInr(dashboard.totalFunding)} to fund by ${shortDeadline(dashboard.nearestDeadline)}.` : ""}`
    : dashboard.totalFunding > 0 && dashboard.nearestDeadline
      ? `Nothing needs a decision. ${formatInr(dashboard.totalFunding)} to fund by ${shortDeadline(dashboard.nearestDeadline)}.`
      : "Nothing needs a decision right now.";

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Corporate Actions Copilot</p>
          <h1 className="figure mt-2 text-[28px] font-semibold leading-9 tracking-[-0.03em] text-foreground">{headline}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm leading-6 text-muted-foreground">
            <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
            {dashboard.arrivalCount24h} notices arrived in the last 24 hours; {dashboard.arrivalsAffectingSchemes24h} of them touch your schemes.
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4 sm:p-5">
        <section aria-label="Attention queue" className="dashboard-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">What needs a look</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Ranked by urgency, then deadline.</p>
            </div>
            <Link href="/events" className="text-xs font-semibold text-primary hover:underline">View all</Link>
          </div>
          <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {queue.slice(0, 6).map((event) => (
              <Link key={event.id} href={`/events/${event.id}`} className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted">
                <span className={`h-8 w-1 rounded-full ${event.attention || isDecisionNeeded(event.status) ? "bg-warning" : "bg-success"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{event.issuer}</span>
                  <span className="block truncate text-xs text-muted-foreground">{actionName(event.eventType)} · {relativeArrival(event.receivedAt)}</span>
                </span>
                {event.attention || isDecisionNeeded(event.status) ? <CircleAlert className="h-4 w-4 shrink-0 text-warning" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </section>

        <section aria-label="Funding and headroom" className="grid gap-4 lg:grid-cols-2">
          <FundingByWeek events={sortedEvents} now={now} />
          {schemes ? <CapHeadroom schemes={schemes} /> : <div className="dashboard-panel text-sm text-muted-foreground">Loading scheme headroom...</div>}
        </section>

        <section aria-label="Deadline timeline">
          <DeadlineTimeline events={sortedEvents} now={now} />
        </section>

        <section aria-label="Volume versus money">
          <VolumeVersusValue events={sortedEvents} />
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
                         <TableCell className="figure text-right">
                           {event.materialityPaise === null || event.materialityPaise === 0
                             ? <span className="text-slate-500">Neutral</span>
                             : `${event.materialityPaise.toFixed(2)} paise`}
                         </TableCell>
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
      </main>
    </div>
  );
}
