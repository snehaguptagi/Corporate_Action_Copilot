import { useListSchemes, type SchemeSummary } from "@workspace/api-client-react";
import { ArrowRight, AlertCircle, Layers3 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { InfoHint } from "@/components/InfoHint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";

export default function Portfolio() {
  const { data: schemes, isLoading, isError } = useListSchemes();

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading portfolio...</div>;
  if (isError || !schemes) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">The portfolio could not be loaded.</div>;

  const impactedSchemeCount = schemes.filter((scheme) => scheme.openActions.length > 0).length;
  const openActionCount = schemes.reduce((total, scheme) => total + scheme.openActions.length, 0);
  const flaggedSchemeCount = schemes.filter((scheme) => Boolean(scheme.flag)).length;
  const totalShortfall = schemes.reduce((total, scheme) => total + scheme.shortfall, 0);
  const triagedSchemes = [...schemes].sort((a, b) => {
    const rank = (s: SchemeSummary) => (s.shortfall > 0 ? 0 : s.flag ? 1 : s.openActions.length > 0 ? 2 : 3);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.shortfall !== b.shortfall) return b.shortfall - a.shortfall;
    if (a.distanceToLimitPercent !== b.distanceToLimitPercent) return a.distanceToLimitPercent - b.distanceToLimitPercent;
    return b.openActions.length - a.openActions.length;
  });

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-4 sm:px-8">
        <h1 className="flex items-center gap-2.5 text-[30px] font-semibold tracking-[-0.03em] text-foreground"><Layers3 className="h-7 w-7 text-primary" />Portfolio
          <InfoHint title="This page">
            A scheme is one mutual fund product, like Arka Large Cap Fund. Arka runs ten. This page shows how much of each scheme is touched by open corporate actions, how close it is to the SEBI single-company limit, and whether it has the cash to take up what it wants. Click a row to open that scheme.
          </InfoHint>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Ten schemes ranked by how much open corporate actions touch them, how close they run to the SEBI limit, and whether cash is ready. Every row opens into its own view.</p>
      </header>
      <main className="flex-1 p-4 sm:p-5">
        <section className="dashboard-panel mb-4" aria-labelledby="scheme-control-board">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="scheme-control-board" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <Layers3 className="h-3.5 w-3.5" />
              Scheme control board
            </h2>
            <p className="figure-inline text-xs text-muted-foreground">
              {impactedSchemeCount} of {schemes.length} touched · {openActionCount} open actions · {flaggedSchemeCount} flagged · {totalShortfall > 0 ? `${formatInr(totalShortfall)} short` : "fully funded"}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Worst first. The track under each scheme shows its largest issuer position against the 10% SEBI cap.</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {triagedSchemes.map((scheme) => <SchemeTile key={scheme.id} scheme={scheme} />)}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-destructive" /> Funding short</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-warning" /> Flagged</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success" /> Covered</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-stone-200" /> Nothing open</span>
          </div>
        </section>
        <Card className="overflow-hidden border border-stone-200 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Scheme</TableHead>
                    <TableHead className="text-right">Fund Size & NAV</TableHead>
                    <TableHead>Open Actions & Deadlines</TableHead>
                    <TableHead className="text-right">Concentration Risk</TableHead>
                    <TableHead className="text-right">Funding Position</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemes.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-sm text-slate-500">Scheme data is not available yet.</TableCell></TableRow>
                  )}
                  {schemes.map((scheme) => {
                    const sortedActions = [...scheme.openActions].sort((a, b) => b.materialityPaise - a.materialityPaise);
                    const mostMaterial = sortedActions[0];

                    return (
                      <TableRow key={scheme.id} className="group">
                        <TableCell>
                          <Link href={`/schemes/${scheme.id}`} className="font-semibold text-primary hover:underline">{scheme.name}</Link>
                          <div className="mt-1 text-xs text-slate-500">{scheme.category} · {scheme.holdingCount} holdings</div>
                          {scheme.flag && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                              <AlertCircle className="h-3 w-3" />
                              {scheme.flag}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="figure text-right">
                          <div className="font-semibold text-slate-900">₹{scheme.aumCrore.toLocaleString("en-IN")} cr</div>
                          <div className="mt-1 text-xs text-slate-500">NAV ₹{scheme.navRupees.toFixed(2)}</div>
                        </TableCell>
                        <TableCell>
                          {scheme.openActions.length > 0 ? (
                            <div className="space-y-1.5">
                              <div className="text-xs text-slate-700">
                                <span className="font-medium text-slate-900">{scheme.openActions.length} open</span>
                                {scheme.closestDeadline && ` · Next deadline ${scheme.closestDeadline}`}
                              </div>
                              {mostMaterial && (
                                <Link href={`/events/${mostMaterial.eventId}`} className="inline-flex items-center gap-1.5 rounded border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-primary">
                                  {mostMaterial.issuer} {mostMaterial.eventType.toLowerCase()}
                                </Link>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">Nothing open</span>
                          )}
                        </TableCell>
                        <TableCell className="figure">
                           {scheme.largestExposurePercent > 0 ? (
                              <div className="space-y-1">
                                <div className="font-semibold text-slate-900">
                                  {scheme.largestExposurePercent.toFixed(2)}% <span className="ml-1 text-[10px] font-normal uppercase tracking-wider text-slate-500">Max</span>
                                </div>
                                <div className="text-xs text-slate-500">
                                   {scheme.largestExposureIssuer}
                                </div>
                                <div className={scheme.distanceToLimitPercent < 1.0 ? "text-[11px] font-medium text-rose-600" : "text-[11px] text-slate-500"}>
                                  {scheme.distanceToLimitPercent.toFixed(2)}% to cap
                                </div>
                              </div>
                           ) : (
                             <span className="text-slate-400">None</span>
                           )}
                        </TableCell>
                        <TableCell className="figure text-right">
                          {scheme.fundingNeeded > 0 ? (
                            <div className="text-xs leading-5 text-slate-700">
                              <div>Needs <strong className="text-slate-900">{formatInr(scheme.fundingNeeded)}</strong></div>
                              <div className={scheme.shortfall ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>
                                {scheme.shortfall ? `Short ${formatInr(scheme.shortfall)}` : "Covered"}
                              </div>
                            </div>
                          ) : (
                             <span className="text-slate-400">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link href={`/schemes/${scheme.id}`} className="inline-flex h-8 w-8 items-center justify-center whitespace-nowrap rounded-md text-sm font-medium text-slate-400 transition-colors hover:bg-accent hover:text-primary group-hover:text-primary">
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function statusLineTitle(scheme: SchemeSummary, state: "exception" | "review" | "covered" | "clear") {
  if (state === "exception") return `${scheme.name}: funding short ${formatInr(scheme.shortfall)}`;
  if (state === "review") return `${scheme.name}: ${scheme.flag ?? "flagged for review"}`;
  if (state === "covered") return `${scheme.name}: funded, within limits`;
  return `${scheme.name}: nothing open`;
}

function SchemeTile({ scheme }: { scheme: SchemeSummary }) {
  const state = scheme.shortfall > 0 ? "exception" : scheme.flag ? "review" : scheme.openActions.length > 0 ? "covered" : "clear";
  const railTone = {
    exception: "bg-destructive",
    review: "bg-warning",
    covered: "bg-success",
    clear: "bg-stone-200",
  }[state];
  const statusLine = {
    exception: <span className="figure-inline font-semibold text-destructive">Short {formatInr(scheme.shortfall)}</span>,
    review: <span className="font-semibold text-warning">{scheme.flag}</span>,
    covered: <span className="font-semibold text-success">Funded, within limits</span>,
    clear: <span className="text-muted-foreground">Nothing open</span>,
  }[state];
  const shortName = scheme.name.replace(/^Arka /, "").replace(/ Fund$/, "");
  const capUsedPercent = Math.min(100, (scheme.largestExposurePercent / 10) * 100);
  const gaugeTone = scheme.distanceToLimitPercent < 1 ? "bg-destructive" : scheme.distanceToLimitPercent < 2 ? "bg-warning" : "bg-primary";

  return (
    <Link
      href={`/schemes/${scheme.id}`}
      className="group relative flex flex-col overflow-hidden rounded-md border border-stone-200 bg-card py-2.5 pl-4 pr-3 shadow-sm transition-colors hover:border-primary/50"
      aria-label={`${scheme.name}: ${scheme.openActions.length} open actions`}
      title={statusLineTitle(scheme, state)}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${railTone}`} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{shortName}</span>
        <span className="figure-inline shrink-0 text-xs text-muted-foreground">{scheme.openActions.length ? `${scheme.openActions.length} open` : ""}</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] leading-4">{statusLine}</div>
      {scheme.largestExposurePercent > 0 && (
        <div className="mt-2 flex items-center gap-2" title={`${scheme.largestExposureIssuer}: ${scheme.largestExposurePercent.toFixed(2)}% of the 10% cap`}>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/70">
            <div className={`h-full rounded-full ${gaugeTone}`} style={{ width: `${capUsedPercent}%` }} />
          </div>
          <span className="figure-inline shrink-0 text-[10px] text-muted-foreground">{scheme.largestExposurePercent.toFixed(1)}%</span>
        </div>
      )}
    </Link>
  );
}
