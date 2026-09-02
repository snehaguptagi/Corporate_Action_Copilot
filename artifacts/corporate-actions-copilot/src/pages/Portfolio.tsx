import { useListSchemes } from "@workspace/api-client-react";
import { ArrowRight, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";

export default function Portfolio() {
  const { data: schemes, isLoading, isError } = useListSchemes();

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading portfolio...</div>;
  if (isError || !schemes) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">The portfolio could not be loaded.</div>;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-6 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Arka Mutual Fund</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-foreground">Portfolio</h1>
        <p className="mt-2 text-sm text-slate-600">All schemes ranked by current NAV impact and concentration risk. Every scheme remains openable.</p>
      </header>
      <main className="flex-1 p-5 sm:p-8">
        <Card className="overflow-hidden border border-stone-200 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Scheme</TableHead>
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
                          <div className="mt-1 text-xs text-slate-500">{scheme.category}</div>
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
