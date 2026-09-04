import { useMemo, type ReactNode } from "react";
import { useGetDashboard, useListSchemes, type EventSummary } from "@workspace/api-client-react";
import { AlertCircle, ArrowRight, CalendarClock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CapHeadroom, DeadlinesAndFunding, VolumeVersusValue, openEventsOf } from "@/components/dashboard/charts";
import { formatInr } from "@/lib/format";
import { fundManagerStatus, isComplete, isDecisionNeeded, journeyStageIndex } from "@/lib/status";
import { JourneyStrip } from "@/components/CaseJourney";
import { InfoHint } from "@/components/InfoHint";

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

function StatTile({ label, value, sub, tone, hint }: { label: string; value: string; sub: string; tone: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center bg-card px-4 py-4 text-center">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}{hint && <InfoHint title={label}>{hint}</InfoHint>}</p>
      <p className={`figure mt-1.5 text-2xl font-semibold tracking-tight ${tone}`}>{value}</p>
      <p className="figure-inline mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/** A band is a visual reading group. Every band after the first opens with a rule so the eye can see where one ends. */
const BAND = "mt-7 border-t border-stone-300/80 pt-6";

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
  const queue = [...openEvents].sort((left, right) => {
    // Overdue work outranks everything, then urgency, then the nearest deadline.
    const leftAt = Date.parse(left.internalDeadlineAt);
    const rightAt = Date.parse(right.internalDeadlineAt);
    const leftOverdue = Number.isFinite(leftAt) && leftAt < now ? 0 : 1;
    const rightOverdue = Number.isFinite(rightAt) && rightAt < now ? 0 : 1;
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
    const leftUrgent = left.attention || isDecisionNeeded(left.status) ? 0 : 1;
    const rightUrgent = right.attention || isDecisionNeeded(right.status) ? 0 : 1;
    if (leftUrgent !== rightUrgent) return leftUrgent - rightUrgent;
    return leftAt - rightAt;
  });

  const stageCounts = [0, 0, 0, 0, 0];
  for (const event of sortedEvents) {
    const stage = journeyStageIndex(event.status, event.isEarlySighting);
    if (stage < 5) stageCounts[stage] += 1; // only open cases; settled ones live in history
  }

  const headline = dashboard.needsYouCount > 0
    ? `${dashboard.needsYouCount} corporate action${dashboard.needsYouCount === 1 ? " needs" : "s need"} you.${dashboard.totalFunding > 0 && dashboard.nearestDeadline ? ` ${formatInr(dashboard.totalFunding)} to fund by ${shortDeadline(dashboard.nearestDeadline)}.` : ""}`
    : dashboard.totalFunding > 0 && dashboard.nearestDeadline
      ? `Nothing needs a decision. ${formatInr(dashboard.totalFunding)} to fund by ${shortDeadline(dashboard.nearestDeadline)}.`
      : "Nothing needs a decision right now.";

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-6 text-center sm:px-8">
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Corporate Actions Copilot
          <InfoHint title="This dashboard">
            Your morning summary. It reads every open corporate action and tells you whether anything needs a decision, how much money is at stake, and what arrived recently. A corporate action is something a company does that affects its shareholders, such as paying a dividend, issuing new shares, or buying shares back.
          </InfoHint>
        </p>
        <h1 className="figure mx-auto mt-1.5 max-w-3xl text-[28px] font-semibold leading-9 tracking-[-0.03em] text-foreground">{headline}</h1>
        <p className="mt-1.5 flex items-center justify-center gap-2 text-sm leading-6 text-muted-foreground">
          <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
          {dashboard.arrivalCount24h} notice{dashboard.arrivalCount24h === 1 ? "" : "s"} arrived in the last 24 hours; {dashboard.arrivalsAffectingSchemes24h} of them touch{dashboard.arrivalsAffectingSchemes24h === 1 ? "es" : ""} your schemes.
        </p>
      </header>

      <main className="flex-1 px-5 py-5 sm:px-8">
        {/* Band 1 · Now */}
        <section aria-label="Today's numbers" className="overflow-hidden rounded-lg border border-stone-200 bg-card shadow-sm">
          <div className="grid grid-cols-2 gap-px bg-stone-200 lg:grid-cols-4">
            <StatTile
              label="Needs you"
              value={String(dashboard.needsYouCount)}
              sub={`${dashboard.needsNothingCount} need nothing from you${dashboard.awaitingConfirmationCount > 0 ? `, ${dashboard.awaitingConfirmationCount} awaiting custodian confirmation` : ""}`}
              tone={dashboard.needsYouCount > 0 ? "text-amber-700" : "text-foreground"}
              hint="Cases where the next move is yours: a decision to make, a term to confirm, or a break to resolve."
            />
            <StatTile
              label="Forfeited if you do nothing"
              value={dashboard.atStakeAmount > 0 ? formatInr(dashboard.atStakeAmount) : "Nothing"}
              sub="Entitlement value lost if every optional deadline lapses"
              tone={dashboard.atStakeAmount > 0 ? "text-rose-700" : "text-foreground"}
              hint="Some corporate actions are optional, like a rights issue or a buyback. Each has a deadline. If the deadline passes with no decision, the offer lapses and this value is forfeited. This is narrower than the value in play figure at the bottom of the page, which counts all cash moving through every open action."
            />
            <StatTile
              label="Due within 3 days"
              value={String(dashboard.dueWithin3DaysCount)}
              sub={dashboard.dueWithin3DaysCount > 0 ? "Internal deadlines inside 72 hours" : "No deadline inside 72 hours"}
              tone={dashboard.dueWithin3DaysCount > 0 ? "text-amber-700" : "text-foreground"}
              hint="Arka sets its own internal deadline earlier than the market deadline, to leave time for approval and submission. This counts cases whose internal deadline is within the next three days."
            />
            <StatTile
              label="Open settlement breaks"
              value={String(dashboard.settlementBreakCount)}
              sub={dashboard.settlementBreakCount > 0 ? "Custodian cash does not match" : "Settlements match"}
              tone={dashboard.settlementBreakCount > 0 ? "text-rose-700" : "text-foreground"}
              hint="The custodian is the bank that holds the fund's shares and receives the money. A settlement break means the cash or shares that arrived do not match what was calculated, and someone must find out why."
            />
          </div>
          <div className="border-t border-stone-200 bg-stone-50 px-4 py-2">
            <p className="figure-inline text-[11px] leading-5 text-muted-foreground">
              Last quarter: {formatInr(dashboard.lastQuarter.capturedAmount)} captured, {dashboard.lastQuarter.forfeitedAmount > 0 ? formatInr(dashboard.lastQuarter.forfeitedAmount) : "nothing"} forfeited, {dashboard.lastQuarter.lapsedCount} lapsed, {dashboard.lastQuarter.deadlinesMet} of {dashboard.lastQuarter.deadlinesTotal} deadlines met
              {" · "}
              {dashboard.dataTrust.conflictingSourceCount > 0
                ? `${dashboard.dataTrust.conflictingSourceCount} notice${dashboard.dataTrust.conflictingSourceCount === 1 ? "" : "s"} with disagreeing sources`
                : "no source disagreements"}
              {dashboard.dataTrust.lastDeliveryChannel ? ` · latest delivery ${relativeArrival(dashboard.dataTrust.lastDeliveryAt)} via ${dashboard.dataTrust.lastDeliveryChannel.toLowerCase()}` : ""}
            </p>
          </div>
        </section>

        {/* Band 2 · Act */}
        <section aria-label="What needs a look" className={`${BAND} dashboard-panel`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                What needs a look
                <InfoHint title="What needs a look">Open cases sorted by urgency and deadline, showing only those requiring your attention.</InfoHint>
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Ranked by urgency, then deadline.</p>
            </div>
            <Link href="/events" className="text-xs font-semibold text-primary hover:underline">View all</Link>
          </div>
          {queue.length === 0 && (
            <p className="mt-6 pb-3 text-center text-sm text-muted-foreground">Nothing needs a look. Fetch and capture notices from the Corporate actions page to build the queue.</p>
          )}
          <div className="-mx-2 mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {queue.slice(0, 6).map((event) => {
              const deadlineAt = Date.parse(event.internalDeadlineAt);
              const overdueDays = Number.isFinite(deadlineAt) && deadlineAt < now ? Math.max(1, Math.floor((now - deadlineAt) / (24 * 60 * 60 * 1000))) : 0;
              return (
                <Link key={event.id} href={`/events/${event.id}`} className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted">
                  <span className={`h-8 w-1 rounded-full ${overdueDays > 0 ? "bg-destructive" : event.attention || isDecisionNeeded(event.status) ? "bg-warning" : "bg-success"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{event.issuer}</span>
                    <span className="block truncate text-xs text-muted-foreground">{actionName(event.eventType)} · {relativeArrival(event.receivedAt)}</span>
                  </span>
                  {overdueDays > 0
                    ? <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">Overdue by {overdueDays} day{overdueDays === 1 ? "" : "s"}</span>
                    : <span className="figure-inline shrink-0 text-xs text-muted-foreground">{shortDeadline(event.internalDeadline)}</span>}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* Band 3 · Plan: one chart, one time axis */}
        <section aria-label="Deadlines and funding" className={BAND}>
          <DeadlinesAndFunding events={sortedEvents} now={now} />
        </section>

        {/* Band 4 · Risk */}
        <section aria-label="Concentration risk" className={BAND}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                Concentration risk
                <InfoHint title="Concentration risk">Monitoring schemes nearing the SEBI 10% single-issuer limit, where a corporate action could push the exposure over the cap.</InfoHint>
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Where a single company runs close to, or past, the SEBI 10% single-issuer cap.</p>
            </div>
            <Link href="/issuers" className="text-xs font-semibold text-primary hover:underline">All issuers</Link>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {schemes ? <CapHeadroom schemes={schemes} dense /> : <div className="dashboard-panel text-sm text-muted-foreground">Loading scheme headroom...</div>}
            <div className="dashboard-panel">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Top house exposures
                <InfoHint title="House exposure">The total holding in an issuer across all Arka schemes combined.</InfoHint>
              </h3>
              <Table className="mt-2">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 px-2">Issuer</TableHead>
                    <TableHead className="h-8 px-2 text-right">Exposure</TableHead>
                    <TableHead className="h-8 px-2 text-right">Schemes</TableHead>
                    <TableHead className="h-8 px-2 text-right whitespace-nowrap">
                      Cap headroom
                      <InfoHint title="Cap headroom" className="ml-1 align-bottom">Distance to the SEBI 10% limit for the scheme closest to breaching it.</InfoHint>
                    </TableHead>
                    <TableHead className="h-8 px-2 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.topHouseExposures.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="h-16 text-center text-xs text-slate-400">No issuer exposures to show yet.</TableCell></TableRow>
                  )}
                  {dashboard.topHouseExposures.map((row) => (
                    <TableRow key={row.issuerId} className="hover:bg-muted">
                      <TableCell className="px-2 py-2">
                        <Link href={`/issuers/${row.issuerId}`} className="font-semibold text-foreground hover:text-primary hover:underline">{row.issuer}</Link>
                      </TableCell>
                      <TableCell className="figure px-2 py-2 text-right font-semibold text-slate-800">{formatInr(row.houseExposureAmount)}</TableCell>
                      <TableCell className="px-2 py-2 text-right text-slate-600"><span className="figure">{row.schemesHolding}</span> hold{row.schemesAffected > 0 ? <span className="text-xs text-slate-500"> · <span className="figure">{row.schemesAffected}</span> affected</span> : null}</TableCell>
                      <TableCell className="px-2 py-2 text-right">
                        {row.tightestHeadroomPercent === null
                          ? <span className="text-xs text-slate-400">No open exposure</span>
                          : <span className={`figure font-semibold ${row.attention === "Breach" || row.attention === "Critical" ? "text-destructive" : row.attention === "Tight" ? "text-amber-700" : "text-slate-700"}`}>{row.tightestHeadroomPercent.toFixed(2)}%</span>}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right">
                        {row.attention === "Breach" || row.attention === "Critical"
                          ? <span className="inline-flex rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">{row.attention === "Breach" ? "Cap breached" : "Critical"}</span>
                          : row.attention === "Tight"
                            ? <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Tight</span>
                            : <span className="text-xs text-slate-400">Within cap</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        {/* Band 5 · Everything */}
        <section aria-labelledby="inbound-actions" className={BAND}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 id="inbound-actions" className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                Inbound corporate actions
                <InfoHint title="Inbound corporate actions">The full queue of open cases, including those that do not require your attention.</InfoHint>
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">What arrived, what it touches, and what Arka needs to do.</p>
            </div>
            <Link href="/events" className="text-xs font-semibold text-primary hover:underline">View all</Link>
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
                     <TableHead className="text-right whitespace-nowrap">Materiality<InfoHint title="Materiality" className="ml-1 align-bottom">The expected change in Net Asset Value per unit, calculated across the affected schemes.</InfoHint></TableHead>
                     <TableHead className="whitespace-nowrap">Attention<InfoHint title="Attention" className="ml-1 align-bottom">The current blocker or required action for the case.</InfoHint></TableHead>
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
                        <TableCell className="text-right">
                          <Link href={`/events/${event.id}`} className="font-semibold text-primary hover:underline">
                             {impacted} of {dashboard.totalSchemeCount}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className={`figure font-semibold ${impact.tone}`}>{impact.value}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{impact.label}</div>
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

        {/* Context, after everything: background reading, not part of the action path */}
        <section aria-label="Context" className={BAND}>
          <div className="grid gap-4 lg:grid-cols-2">
            <VolumeVersusValue events={sortedEvents} />
            <div className="dashboard-panel">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                How a corporate action moves
                <InfoHint title="Workflow">The standard five-step lifecycle of every corporate action case.</InfoHint>
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">Every case walks the same five steps, left to right. Open a case to see exactly where it stands.</p>
              <JourneyStrip counts={stageCounts} className="mt-3" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
