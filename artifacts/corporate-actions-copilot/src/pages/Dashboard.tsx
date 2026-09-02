import { useGetArkaDesk, useListEvents, type EventSummary } from "@workspace/api-client-react";
import { AlertCircle, ArrowRight, CalendarClock, CircleDollarSign, FileInput } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const IST_TIME_ZONE = "Asia/Kolkata";
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function istDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function relativeArrival(timestamp: string) {
  const arrival = new Date(timestamp);
  if (Number.isNaN(arrival.getTime())) return "Arrival unavailable";
  const diffMinutes = Math.max(0, Math.round((Date.now() - arrival.getTime()) / 60_000));
  if (diffMinutes < 60) return `${diffMinutes || 1} min ago`;
  if (diffMinutes < 1_440) return `${Math.round(diffMinutes / 60)} hr ago`;
  const days = Math.round(diffMinutes / 1_440);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatCrore(amount: number) {
  return `₹${(amount / 10_000_000).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} cr`;
}

function formatInr(amount: number) {
  if (amount >= 10_000_000) return formatCrore(amount);
  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} lakh`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
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
  return event.status === "Election required";
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
  if (["Closed", "Reconciled"].includes(event.status)) return "Settled";
  if (event.status === "Awaiting approval") return "With Compliance";
  if (needsDecision(event) || event.status === "Under review") return `Decide by ${event.internalDeadline}`;
  if (event.processingType === "Mandatory") return "Nothing, mandatory";
  if (event.status === "Break identified") return "Exception under review";
  return "Nothing required";
}

function isinFromSecurity(security: string) {
  return security.match(/ISIN\s+([^·\s]+)/)?.[1] ?? security;
}

export default function Dashboard() {
  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsError,
    refetch: refetchEvents,
  } = useListEvents();
  const {
    data: desk,
    isLoading: deskLoading,
    isError: deskError,
    refetch: refetchDesk,
  } = useGetArkaDesk();

  if (eventsLoading || deskLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-stone-50 p-8">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading portfolio corporate actions...
        </div>
      </div>
    );
  }

  if (eventsError || deskError || !desk) {
    return (
      <div className="flex flex-1 items-center justify-center bg-stone-50 p-6">
        <Card className="max-w-md border-rose-200">
          <CardContent className="space-y-4 p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
            <div>
              <h1 className="font-semibold text-slate-900">Portfolio impact is unavailable</h1>
              <p className="mt-1 text-sm text-slate-500">The dashboard will not replace missing corporate-action or scheme data with zeroes.</p>
            </div>
            <Button onClick={() => { void refetchEvents(); void refetchDesk(); }}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const eventList = events ?? [];
  const todayKey = istDateKey(new Date());
  const arrivedToday = eventList.filter((event) => istDateKey(new Date(event.receivedAt)) === todayKey);
  const eventsAffectingSchemes = eventList.filter((event) => event.schemeImpacts.some((impact) => impact.affected));
  const impactedSchemeIds = new Set(
    eventList.flatMap((event) => event.schemeImpacts.filter((impact) => impact.affected).map((impact) => impact.schemeId)),
  );
  const fundingEvents = eventList
    .filter((event) => event.schemeImpacts.some((impact) => impact.direction === "Funding" && impact.cashAmount > 0))
    .sort((a, b) => {
      const da = a.internalDeadlineAt ? new Date(a.internalDeadlineAt).getTime() : Number.POSITIVE_INFINITY;
      const db = b.internalDeadlineAt ? new Date(b.internalDeadlineAt).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
  const nearestFunding = fundingEvents[0];
  const totalFunding = eventList.flatMap((event) => event.schemeImpacts)
    .filter((impact) => impact.direction === "Funding")
    .reduce((total, impact) => total + impact.cashAmount, 0);
  const sortedEvents = eventList;

  const schemeRows = desk.schemes.map((scheme) => {
    const impacts = eventList
      .flatMap((event) => event.schemeImpacts.map((impact) => ({ event, impact })))
      .filter(({ impact }) => impact.schemeId === scheme.id && impact.affected);
    const openActions = impacts.filter(({ event }) => !["Closed", "Reconciled"].includes(event.status));
    const funding = impacts
      .filter(({ impact }) => impact.direction === "Funding")
      .reduce((total, { impact }) => total + impact.cashAmount, 0);
    const navImpact = impacts.reduce((total, { impact }) => total + (impact.navImpactPaise ?? 0), 0);
    const flag = impacts.find(({ impact }) => impact.flag)?.impact.flag ?? null;
    const cashAvailable = scheme.cashAvailableCrore * 10_000_000;
    const shortfall = Math.max(0, funding - cashAvailable);
    return { scheme, openActions, funding, cashAvailable, shortfall, navImpact, flag };
  });
  const affectedSchemeRows = schemeRows
    .filter(({ openActions }) => openActions.length > 0)
    .sort((left, right) => right.navImpact - left.navImpact);
  const unaffectedSchemeRows = schemeRows.filter(({ openActions }) => openActions.length === 0);
  const unaffectedLabels = unaffectedSchemeRows.map(({ scheme }) => (
    scheme.category === "Banking" ? "Banking & Financial" : scheme.category
  ));

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-5 py-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Arka Mutual Fund</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Portfolio corporate actions</h1>
          </div>
          <Link href="/intake" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 gap-2">
            <FileInput className="h-4 w-4" /> Add manually
          </Link>
        </div>
      </header>

      <main className="flex-1 space-y-6 p-5 sm:p-8">
        <section aria-labelledby="morning-status">
          <div className="overflow-hidden rounded-lg border border-orange-200 bg-white shadow-sm">
            <div className="h-1 bg-gradient-to-r from-[#dc6900] via-[#eb8c00] to-[#ffb600]" />
            <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#a32020]">
                  <CalendarClock className="h-4 w-4" />
                  Today
                </div>
                <p id="morning-status" className="max-w-5xl text-xl font-semibold leading-8 text-slate-950 sm:text-2xl">
                  {arrivedToday.length} notices arrived today. {eventsAffectingSchemes.length} affect your schemes.{" "}
                  {impactedSchemeIds.size} of {desk.schemes.length} schemes impacted.{" "}
                  {totalFunding > 0 ? `${formatInr(totalFunding)} to fund` : "No funding required"}
                  {nearestFunding ? ` by ${nearestFunding.internalDeadline} for ${nearestFunding.issuer}.` : "."}
                </p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-2">
                <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
                  <span className="block text-xs text-slate-500">Arrived today</span>
                  <strong className="text-lg text-slate-950">{arrivedToday.length}</strong>
                </div>
                <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2">
                  <span className="block text-xs text-slate-500">Affect Arka</span>
                  <strong className="text-lg text-slate-950">{eventsAffectingSchemes.length}</strong>
                </div>
              </div>
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
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#f7f3f0] hover:bg-[#f7f3f0]">
                    <TableHead>Issuer + ISIN</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Arrived</TableHead>
                    <TableHead>Schemes impacted</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Materiality</TableHead>
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
                        <TableCell>
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
                            {impacted} of {desk.schemes.length}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{impact.label}</div>
                          <div className={`mt-1 font-semibold ${impact.tone}`}>{impact.value}</div>
                        </TableCell>
                        <TableCell className="font-medium text-slate-700">{navImpactCopy(event)}</TableCell>
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
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#f7f3f0] hover:bg-[#f7f3f0]">
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
                        {navImpact > 0 ? <span className="font-semibold text-[#a32020]">{navImpact.toFixed(2)} paise</span> : <span className="text-slate-500">Neutral</span>}
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
