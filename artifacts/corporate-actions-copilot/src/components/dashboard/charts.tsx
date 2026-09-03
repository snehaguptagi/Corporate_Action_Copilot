import type { ReactNode } from "react";
import { Link } from "wouter";
import type { EventSummary, SchemeSummary } from "@workspace/api-client-react";
import { formatInr } from "@/lib/format";
import { isComplete, isDecisionNeeded } from "@/lib/status";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Categorical palette for event types. Fixed order, never cycled, never status colours. */
const EVENT_TYPE_ORDER = ["Rights issue", "Tender offer", "Merger / demerger", "Cash dividend", "Stock split", "Bonus issue"] as const;
const EVENT_TYPE_COLORS: Record<string, string> = {
  "Rights issue": "#D04A02",
  "Tender offer": "#EB8C00",
  "Merger / demerger": "#FFB600",
  "Cash dividend": "#B08968",
  "Stock split": "#7D6B5D",
  "Bonus issue": "#4E4038",
  Other: "#A8A29E",
};

function shortDay(date: Date) {
  // Deadlines are IST operational dates; render them in IST regardless of the viewer's browser timezone.
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

function crore(value: number) {
  return `${(value / 10_000_000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cr`;
}

export function openEventsOf(events: EventSummary[]) {
  return events.filter((event) => !isComplete(event.status));
}

function fundingAmount(event: EventSummary) {
  return event.schemeImpacts
    .filter((impact) => impact.affected && impact.direction === "Funding")
    .reduce((total, impact) => total + impact.cashAmount, 0);
}

function valueAtRisk(event: EventSummary) {
  return event.schemeImpacts
    .filter((impact) => impact.affected)
    .reduce((total, impact) => total + Math.abs(impact.cashAmount), 0);
}

function ChartPanel({ title, subtitle, dense = false, children, fallback }: { title: string; subtitle?: string; dense?: boolean; children: ReactNode; fallback: ReactNode }) {
  return (
    <div className="dashboard-panel">
      {dense ? (
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      ) : (
        <>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </>
      )}
      <div className="mt-4">{children}</div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-primary">View as table</summary>
        <div className="mt-2 overflow-x-auto">{fallback}</div>
      </details>
    </div>
  );
}

function FallbackTable({ head, rows }: { head: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          {head.map((label) => <th key={label} className="py-1.5 pr-4 font-medium">{label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, index) => (
          <tr key={index} className="border-b border-border/50">
            {cells.map((cell, cellIndex) => <td key={cellIndex} className="figure py-1.5 pr-4">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* A. Deadlines and funding on one shared six-week time axis.
   Top row: one dot per open action at its decision deadline (beeswarm on crowded days).
   Bottom row: bars of cash due that week, vertically aligned under the deadlines that create it. */
export function DeadlinesAndFunding({ events, now }: { events: EventSummary[]; now: number }) {
  const horizonDays = 42;
  const horizon = horizonDays * DAY_MS;
  const open = openEventsOf(events);
  const sorted = open
    .map((event) => ({ event, at: Date.parse(event.internalDeadlineAt) }))
    .filter(({ at }) => Number.isFinite(at) && at > now && at <= now + horizon)
    .sort((left, right) => left.at - right.at);
  // Beeswarm layout: dots sit on the axis and stack upward when deadlines crowd together.
  // Only decision-required events get a text label, on two alternating rows with a minimum gap.
  const STACK_GAP_PERCENT = 1.8;
  const LABEL_GAP_PERCENT = 11;
  const levels: number[] = [];
  const lastLabelAtRow: number[] = [-Infinity, -Infinity];
  const markers = sorted.map((entry, index) => {
    const left = ((entry.at - now) / horizon) * 100;
    let level = 0;
    for (let prior = 0; prior < index; prior++) {
      const priorLeft = ((sorted[prior].at - now) / horizon) * 100;
      if (left - priorLeft < STACK_GAP_PERCENT && levels[prior] >= level) level = levels[prior] + 1;
    }
    levels[index] = level;
    const decision = isDecisionNeeded(entry.event.status);
    let labelRow = -1;
    if (decision) {
      labelRow = lastLabelAtRow.findIndex((last) => left - last >= LABEL_GAP_PERCENT);
      if (labelRow >= 0) lastLabelAtRow[labelRow] = left;
    }
    return { ...entry, left, level, decision, labelRow };
  });

  const buckets = Array.from({ length: 6 }, (_, index) => ({
    start: new Date(now + index * WEEK_MS),
    end: new Date(now + (index + 1) * WEEK_MS - DAY_MS),
    total: 0,
  }));
  for (const event of open) {
    const at = Date.parse(event.internalDeadlineAt);
    if (!Number.isFinite(at) || at <= now) continue;
    const index = Math.floor((at - now) / WEEK_MS);
    if (index >= 0 && index < 6) buckets[index].total += fundingAmount(event);
  }
  const max = Math.max(...buckets.map((bucket) => bucket.total), 1);
  const gridDays = [0, 7, 14, 21, 28, 35, 42];

  return (
    <ChartPanel
      title="Decision deadlines and the cash they demand, next six weeks"
      subtitle="One shared time axis. Each dot is an open action at its decision deadline; the bars beneath show the cash due that same week. Hover anything for detail."
      fallback={
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Deadlines</p>
            <FallbackTable
              head={["Deadline", "Issuer", "Action", "Decision"]}
              rows={markers.map(({ event }) => [
                event.internalDeadline,
                <Link key={event.id} href={`/events/${event.id}`} className="text-primary hover:underline">{event.issuer}</Link>,
                event.eventType,
                isDecisionNeeded(event.status) ? "Decision required" : "No decision needed",
              ])}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Funding due by week</p>
            <FallbackTable
              head={["Week", "Funding due"]}
              rows={buckets.map((bucket) => [`${shortDay(bucket.start)} – ${shortDay(bucket.end)}`, bucket.total > 0 ? formatInr(bucket.total) : "None"])}
            />
          </div>
        </div>
      }
    >
      {markers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open deadlines inside the next six weeks.</p>
      ) : (
        <div>
          {/* Top row: deadline dots */}
          <div className="relative h-24">
            {gridDays.map((day) => (
              <div key={day} className="absolute bottom-0 top-2 w-px bg-border/50" style={{ left: `${(day / horizonDays) * 100}%` }} />
            ))}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-stone-300" />
            {markers.map(({ event, left, level, decision, labelRow }) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="group absolute bottom-0 -translate-x-1/2"
                style={{ left: `${left}%` }}
                title={`${event.issuer} · ${event.eventType}. Deadline ${event.internalDeadline}. ${decision ? "Decision required." : "No decision needed."}`}
              >
                <span
                  className={`absolute left-1/2 block h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 ${decision ? "border-primary bg-primary" : "border-stone-400 bg-card"} group-hover:scale-125 group-hover:border-primary`}
                  style={{ bottom: `${4 + level * 12}px` }}
                />
                {labelRow >= 0 && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold leading-none text-foreground group-hover:text-primary"
                    style={{ bottom: `${44 + labelRow * 14}px` }}
                  >
                    {event.issuer.replace(/ (Ltd|Limited)$/, "")}
                  </span>
                )}
              </Link>
            ))}
          </div>
          {/* Bottom row: funding bars on the same axis */}
          <div className="relative h-28">
            {gridDays.map((day) => (
              <div key={day} className="absolute bottom-5 top-0 w-px bg-border/50" style={{ left: `${(day / horizonDays) * 100}%` }} />
            ))}
            <div className="absolute bottom-5 left-0 right-0 h-px bg-stone-300" />
            {buckets.map((bucket, index) => (
              <div
                key={index}
                className="absolute bottom-5 top-1 flex flex-col items-center justify-end gap-1 px-2"
                style={{ left: `${(index / 6) * 100}%`, width: `${100 / 6}%` }}
                title={`${shortDay(bucket.start)} to ${shortDay(bucket.end)}: ${bucket.total > 0 ? `${formatInr(bucket.total)} due` : "no funding due"}`}
              >
                {bucket.total > 0 && <span className="figure-inline text-[10px] font-semibold text-foreground">₹{crore(bucket.total)}</span>}
                <div
                  className={`w-full max-w-16 rounded-t-sm ${bucket.total > 0 ? "bg-primary" : "bg-stone-200"}`}
                  style={{ height: bucket.total > 0 ? `${Math.max((bucket.total / max) * 78, 6)}%` : "2px" }}
                />
              </div>
            ))}
            {gridDays.map((day) => (
              <span key={day} className={`figure-inline absolute bottom-0 text-[10px] text-muted-foreground ${day === horizonDays ? "-translate-x-full" : day === 0 ? "" : "-translate-x-1/2"}`} style={{ left: `${(day / horizonDays) * 100}%` }}>
                {day === 0 ? "Today" : shortDay(new Date(now + day * DAY_MS))}
              </span>
            ))}
          </div>
          {/* One legend for both rows */}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Decision required</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-stone-400 bg-card" /> No decision, deadline only</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary" /> Cash due that week</span>
          </div>
        </div>
      )}
    </ChartPanel>
  );
}

/* C. Headroom against the 10% SEBI single-issuer cap, per scheme. */
export function CapHeadroom({ schemes, dense = false }: { schemes: SchemeSummary[]; dense?: boolean }) {
  const scaleMax = 12;
  const rows = [...schemes]
    .filter((scheme) => scheme.largestExposurePercent > 0)
    .sort((left, right) => right.largestExposurePercent - left.largestExposurePercent);

  return (
    <ChartPanel
      dense={dense}
      title={dense ? "Headroom against the SEBI 10% cap, per scheme" : "Headroom against the SEBI 10% cap"}
      subtitle="Largest single-issuer position per scheme. Status colour appears only where a scheme is tight or breaching."
      fallback={
        <FallbackTable
          head={["Scheme", "Largest issuer", "Exposure", "Headroom"]}
          rows={rows.map((scheme) => [
            <Link key={scheme.id} href={`/schemes/${scheme.id}`} className="text-primary hover:underline">{scheme.name}</Link>,
            scheme.largestExposureIssuer,
            `${scheme.largestExposurePercent.toFixed(2)}%`,
            `${scheme.distanceToLimitPercent.toFixed(2)}%`,
          ])}
        />
      }
    >
      <div className="relative space-y-1.5">
        {/* the 10% limit rule */}
        <div className="absolute bottom-0 top-0 z-10 w-px bg-stone-500" style={{ left: `calc((100% - 8.5rem) * ${10 / scaleMax} + 8.5rem)` }} title="SEBI 10% single-issuer limit" />
        {rows.map((scheme) => {
          const breach = scheme.largestExposurePercent > 10;
          const tone = breach || scheme.distanceToLimitPercent < 1 ? "bg-destructive" : scheme.distanceToLimitPercent < 2 ? "bg-warning" : "bg-primary/70";
          return (
            <Link key={scheme.id} href={`/schemes/${scheme.id}`} className="group flex items-center gap-2" title={`${scheme.name}: ${scheme.largestExposureIssuer} at ${scheme.largestExposurePercent.toFixed(2)}% of AUM, ${breach ? `${(-scheme.distanceToLimitPercent).toFixed(2)}% over` : `${scheme.distanceToLimitPercent.toFixed(2)}% below`} the 10% cap`}>
              <span className="w-[5.5rem] shrink-0 truncate text-[11px] text-muted-foreground group-hover:text-primary">{scheme.name.replace(/^Arka /, "").replace(/ Fund$/, "")}</span>
              <span className="relative h-3.5 flex-1 rounded-sm bg-stone-100">
                <span className={`absolute inset-y-0 left-0 rounded-sm ${tone}`} style={{ width: `${Math.min((scheme.largestExposurePercent / scaleMax) * 100, 100)}%` }} />
              </span>
              <span className={`figure-inline w-11 shrink-0 text-right text-[11px] ${breach ? "font-semibold text-destructive" : "text-foreground"}`}>{scheme.largestExposurePercent.toFixed(1)}%</span>
            </Link>
          );
        })}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="w-[5.5rem] shrink-0" />
          <span className="relative h-3 flex-1 text-[10px] text-muted-foreground">
            <span className="absolute" style={{ left: `${(10 / scaleMax) * 100}%`, transform: "translateX(-50%)" }}>10% limit</span>
          </span>
          <span className="w-11 shrink-0" />
        </div>
      </div>
    </ChartPanel>
  );
}

/* D. Volume versus money — count by type vs value at risk by type, same categories, same order. */
export function VolumeVersusValue({ events }: { events: EventSummary[] }) {
  const open = openEventsOf(events);
  const categories = EVENT_TYPE_ORDER.filter((type) => open.some((event) => event.eventType === type));
  const other = open.filter((event) => !EVENT_TYPE_ORDER.includes(event.eventType as (typeof EVENT_TYPE_ORDER)[number]));
  const rows = [
    ...categories.map((type) => {
      const matching = open.filter((event) => event.eventType === type);
      return { type: type as string, count: matching.length, value: matching.reduce((total, event) => total + valueAtRisk(event), 0) };
    }),
    ...(other.length > 0 ? [{ type: "Other", count: other.length, value: other.reduce((total, event) => total + valueAtRisk(event), 0) }] : []),
  ];
  const totalCount = rows.reduce((total, row) => total + row.count, 0);
  const totalValue = rows.reduce((total, row) => total + row.value, 0);
  const countLeader = [...rows].sort((left, right) => right.count - left.count)[0];
  const valueLeader = [...rows].sort((left, right) => right.value - left.value)[0];
  const valueLeaderShare = totalValue > 0 && valueLeader ? Math.round((valueLeader.value / totalValue) * 100) : 0;

  const StackedBar = ({ measure }: { measure: "count" | "value" }) => {
    const total = measure === "count" ? totalCount : totalValue;
    return (
      <div className="flex h-6 w-full gap-0.5 overflow-hidden rounded-sm">
        {rows.filter((row) => row[measure] > 0).map((row) => (
          <div
            key={row.type}
            className="h-full"
            style={{ width: `${(row[measure] / Math.max(total, 1)) * 100}%`, backgroundColor: EVENT_TYPE_COLORS[row.type] }}
            title={measure === "count" ? `${row.type}: ${row.count} of ${totalCount} open actions` : `${row.type}: ${formatInr(row.value)} in play`}
          />
        ))}
      </div>
    );
  };

  return (
    <ChartPanel
      title="Volume versus money"
      subtitle="The same open actions measured two ways. Value in play counts the full cash moving through every open action, incoming and outgoing, so it is larger than the forfeit figure in the tiles above."
      fallback={
        <FallbackTable
          head={["Event type", "Open actions", "Value in play"]}
          rows={rows.map((row) => [row.type, String(row.count), row.value > 0 ? formatInr(row.value) : "Neutral"])}
        />
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {rows.map((row) => (
          <span key={row.type} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: EVENT_TYPE_COLORS[row.type] }} />
            {row.type}
          </span>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">By count · {totalCount} open actions</div>
          <StackedBar measure="count" />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">By value in play across all open actions · {formatInr(totalValue)}</div>
          <StackedBar measure="value" />
        </div>
      </div>
      {countLeader && valueLeader && countLeader.type !== valueLeader.type && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Most arrivals are {countLeader.type.toLowerCase()}s that need no decision; {valueLeader.type.toLowerCase()}s carry {valueLeaderShare}% of the value in play.
        </p>
      )}
    </ChartPanel>
  );
}
