import { useListSchemes } from "@workspace/api-client-react";
import { ArrowRight, AlertCircle, CheckCircle2, CircleDollarSign, Layers3, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
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
  const exceptionSchemes = schemes.filter((scheme) => scheme.shortfall > 0);
  const reviewSchemes = schemes.filter((scheme) => scheme.shortfall <= 0 && Boolean(scheme.flag));
  const coveredSchemes = schemes.filter((scheme) => scheme.openActions.length > 0 && scheme.shortfall <= 0 && !scheme.flag);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-4 sm:px-8">
        <h1 className="flex items-center gap-2.5 text-[30px] font-semibold tracking-[-0.03em] text-foreground"><Layers3 className="h-7 w-7 text-primary" />Portfolio</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Ten schemes ranked by corporate-action exposure, concentration headroom, and cash readiness. Every row opens into its control view.</p>
      </header>
      <main className="flex-1 p-4 sm:p-5">
        <section className="mb-4 grid gap-3 md:grid-cols-[1.35fr_0.9fr]">
          <div className="dashboard-panel dashboard-panel--accent">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  <Layers3 className="h-3.5 w-3.5" />
                  Portfolio control view
                </div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Exposure across the live book</h2>
              </div>
              <span className="figure-inline text-xs font-medium text-muted-foreground">{schemes.length} schemes</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PortfolioMetric label="Schemes touched" value={`${impactedSchemeCount}/${schemes.length}`} icon={<Layers3 className="h-4 w-4" />} />
              <PortfolioMetric label="Open actions" value={openActionCount} icon={<CheckCircle2 className="h-4 w-4" />} />
              <PortfolioMetric label="Flagged" value={flaggedSchemeCount} icon={<ShieldAlert className="h-4 w-4" />} />
              <PortfolioMetric label="Funding shortfall" value={totalShortfall > 0 ? formatInr(totalShortfall) : "None"} icon={<CircleDollarSign className="h-4 w-4" />} />
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Scheme coverage</span>
                <span className="figure-inline">{impactedSchemeCount} impacted · {schemes.length - impactedSchemeCount} clear</span>
              </div>
              <div className="flex h-3 gap-1" aria-label={`${impactedSchemeCount} of ${schemes.length} schemes have open corporate actions`}>
                {schemes.map((scheme) => (
                  <div key={scheme.id} title={`${scheme.name}: ${scheme.openActions.length ? "Open actions" : "No open actions"}`} className={`min-w-2 flex-1 rounded-sm ${scheme.openActions.length ? "bg-primary" : "bg-border"}`} />
                ))}
              </div>
            </div>
          </div>
          <div className="dashboard-panel">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Where to focus first</div>
            <div className="mt-3 space-y-2">
              <TriageRow
                icon={<ShieldAlert className="h-4 w-4" />}
                toneClass="border-destructive/30 bg-destructive/5 text-destructive"
                label="Exception"
                hint="Funding shortfall blocks settlement"
                schemes={exceptionSchemes}
              />
              <TriageRow
                icon={<AlertCircle className="h-4 w-4" />}
                toneClass="border-warning/40 bg-warning/5 text-warning"
                label="Review"
                hint="Flagged for concentration or eligibility"
                schemes={reviewSchemes}
              />
              <TriageRow
                icon={<CheckCircle2 className="h-4 w-4" />}
                toneClass="border-success/30 bg-success/5 text-success"
                label="Covered"
                hint="Open actions funded and within limits"
                schemes={coveredSchemes}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Work from the top down. Each scheme name opens its control view.</p>
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
                    <TableHead className="text-right">NAV Impact</TableHead>
                    <TableHead className="text-right">Aggregate Funding</TableHead>
                    <TableHead>Flag</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemes.map((scheme) => {
                    const sortedActions = [...scheme.openActions].sort((a, b) => b.materialityPaise - a.materialityPaise);
                    const mostMaterial = sortedActions[0];

                    return (
                      <TableRow key={scheme.id} className="group">
                        <TableCell>
                          <Link href={`/schemes/${scheme.id}`} className="font-semibold text-primary hover:underline">{scheme.name}</Link>
                          <div className="mt-1 text-xs text-slate-500">{scheme.category} · {scheme.holdingCount} holdings</div>
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
                        <TableCell className="figure">
                          {scheme.totalNavImpactPaise > 0 ? (
                            <div className="font-semibold text-slate-900">{scheme.totalNavImpactPaise.toFixed(2)} p</div>
                          ) : (
                             <span className="text-slate-400">Neutral</span>
                          )}
                        </TableCell>
                        <TableCell className="figure">
                          {scheme.fundingNeeded > 0 ? (
                            <div className="text-xs leading-5 text-slate-700">
                              <div>Needs <strong className="text-slate-900">{formatInr(scheme.fundingNeeded)}</strong></div>
                              <div>Has <strong className="text-slate-900">{formatInr(scheme.cashAvailable)}</strong></div>
                              <div className={scheme.shortfall ? "mt-0.5 font-semibold text-rose-700" : "mt-0.5 font-semibold text-emerald-700"}>
                                {scheme.shortfall ? `Short ${formatInr(scheme.shortfall)}` : "Comfortable"}
                              </div>
                            </div>
                          ) : (
                             <span className="text-slate-400">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {scheme.flag ? (
                            <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {scheme.flag}
                            </span>
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

function TriageRow({ icon, toneClass, label, hint, schemes }: { icon: React.ReactNode; toneClass: string; label: string; hint: string; schemes: { id: string; name: string }[] }) {
  return (
    <div className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${toneClass}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{label}</span>
          <span className="figure-inline text-sm font-semibold">{schemes.length}</span>
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
        {schemes.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
            {schemes.slice(0, 3).map((scheme) => (
              <Link key={scheme.id} href={`/schemes/${scheme.id}`} className="font-medium text-primary hover:underline">{scheme.name}</Link>
            ))}
            {schemes.length > 3 && <span className="text-muted-foreground">+{schemes.length - 3} more</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function PortfolioMetric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/80 bg-background/70 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{icon}{label}</div>
      <div className="figure mt-1 text-left text-xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}
