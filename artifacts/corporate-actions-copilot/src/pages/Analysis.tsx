import { useGetAnalysis } from "@workspace/api-client-react";
import { Link } from "wouter";
import { AlertTriangle, Download, GitCompareArrows, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { InfoHint } from "@/components/InfoHint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export default function Analysis() {
  const { data: analysis, isLoading, isError } = useGetAnalysis();

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading analysis...</div>;
  if (isError || !analysis) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">Analysis could not be loaded.</div>;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-4 sm:px-8">
        <h1 className="mt-2 flex items-center gap-2.5 text-[28px] font-semibold tracking-tight text-foreground"><GitCompareArrows className="h-6 w-6 text-primary" />Cross-event analysis
          <InfoHint title="This page">
            Each case is checked on its own when it arrives. This page checks them all together: whether several actions in the same company would push a scheme past the SEBI 10% single-company limit, how much cash you would need if everything completes at once, and how past cases went.
          </InfoHint>
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Use this page to check all open corporate actions together: whether any scheme is getting too concentrated in one company, how much cash you would need if everything completes at once, and how past cases went.</p>
      </header>
      
      <main className="flex-1 space-y-5 p-4 sm:p-5">
        <section aria-labelledby="analysis-conclusion" className="rounded-md border border-primary/30 bg-accent-soft p-4 sm:p-5">
          <h2 id="analysis-conclusion" className="text-xs font-bold uppercase tracking-[0.15em] text-primary">The finding</h2>
          <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-foreground">{analysis.conclusion}</p>
          <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-600">{analysis.purpose}</p>
        </section>

        <section aria-labelledby="historical-performance">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="historical-performance" className="text-lg font-semibold text-slate-950">Decisions and outcomes</h2>
            <a
              href={`${import.meta.env.BASE_URL}api/audit/export`}
              download
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-stone-50"
            >
              <Download className="h-3.5 w-3.5 text-primary" /> Compliance export (full audit trail, CSV)
            </a>
          </div>

          {analysis.decisions.length > 0 && (
            <Card className="mb-4 overflow-hidden border border-stone-200 shadow-sm">
              <div className="border-b border-stone-200 bg-muted/50 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-900">What we decided</h3>
                <p className="mt-0.5 text-xs text-slate-500">Every election on record: the choice, who made it, who approved it, and what it was worth.</p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-transparent hover:bg-transparent">
                      <TableHead>Event</TableHead>
                      <TableHead>Scheme</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Decided by</TableHead>
                      <TableHead>Approved by</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.decisions.map((decision, idx) => (
                      <TableRow key={`${decision.eventId}-${idx}`}>
                        <TableCell><Link href={`/events/${decision.eventId}`} className="font-medium text-slate-900 hover:text-primary hover:underline">{decision.eventLabel}</Link></TableCell>
                        <TableCell className="text-sm text-slate-700">{decision.schemeName}</TableCell>
                        <TableCell className="text-sm text-slate-700">{decision.decision}</TableCell>
                        <TableCell className="text-sm text-slate-700">{decision.decidedBy || "Recorded"}</TableCell>
                        <TableCell className="text-sm text-slate-700">{decision.approvedBy || "Pending"}</TableCell>
                        <TableCell className="figure text-right font-medium">{decision.valueAmount > 0 ? formatInr(decision.valueAmount) : "No cash"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
          
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded border border-stone-200 bg-card p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Value captured</div>
              <div className="figure text-xl font-semibold text-emerald-700">{formatInr(analysis.history.capturedAmount)}</div>
            </div>
            <div className="rounded border border-stone-200 bg-card p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Value forfeited</div>
              <div className="figure text-xl font-semibold text-rose-700">{formatInr(analysis.history.forfeitedAmount)}</div>
            </div>
            <div className="rounded border border-stone-200 bg-card p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Lapsed entitlements</div>
              <div className="figure text-xl font-semibold text-slate-900">{analysis.history.lapsedCount}</div>
            </div>
            <div className="rounded border border-stone-200 bg-card p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Deadlines met</div>
              <div className="figure text-xl font-semibold text-slate-900">{analysis.history.deadlinesMet} / {analysis.history.deadlinesTotal}</div>
            </div>
          </div>

          <Card className="overflow-hidden border border-stone-200 shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Captured</TableHead>
                    <TableHead className="text-right">Forfeited</TableHead>
                    <TableHead>Lapsed</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Reconciliation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.history.closedEvents.map(evt => (
                    <TableRow key={evt.eventId}>
                      <TableCell>
                        <div className="font-medium text-slate-900"><Link href={`/events/${evt.eventId}`} className="hover:text-primary hover:underline">{evt.issuer}</Link></div>
                        <div className="mt-0.5 text-xs text-slate-500">{evt.eventType}</div>
                      </TableCell>
                      <TableCell className="figure font-medium text-emerald-700">{evt.capturedAmount > 0 ? formatInr(evt.capturedAmount) : "None"}</TableCell>
                      <TableCell className="figure font-medium text-rose-700">{evt.forfeitedAmount > 0 ? formatInr(evt.forfeitedAmount) : "None"}</TableCell>
                      <TableCell>
                        {evt.lapsed ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Lapsed</Badge> : <span className="text-sm text-slate-400">No</span>}
                      </TableCell>
                      <TableCell>
                        <span className={evt.deadlineOutcome === 'Met' ? 'text-sm text-emerald-700' : 'text-sm font-medium text-rose-700'}>{evt.deadlineOutcome}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-700">{evt.reconciliationStatus}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {analysis.history.closedEvents.length === 0 && (
                     <TableRow>
                       <TableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">No closed events in the selected period.</TableCell>
                     </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </section>

        <section aria-labelledby="cross-event-risks">
          <div className="mb-4">
            <h2 id="cross-event-risks" className="text-lg font-semibold text-slate-950">Cross-event concentration and funding <span className="text-sm font-normal text-slate-500">(10% issuer cap)</span></h2>
          </div>
          
          <div className="space-y-4">
            {analysis.schemes.filter(scheme => scheme.openEventCount > 0).map(scheme => (
               <Card key={scheme.schemeId} className="overflow-hidden border border-stone-200 shadow-sm">
                 <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-muted/50 px-5 py-4">
                   <div>
                     <h3 className="font-semibold text-slate-900"><Link href={`/schemes/${scheme.schemeId}`} className="hover:text-primary hover:underline">{scheme.schemeName}</Link></h3>
                     <p className="mt-1 text-xs text-slate-500">{scheme.openEventCount} open action{scheme.openEventCount !== 1 && 's'}</p>
                   </div>
                   <div className="flex gap-6 text-sm">
                     <div className="figure">
                         <span className="mb-0.5 block text-[11px] uppercase tracking-wider text-slate-500">Aggregate funding needed</span>
                        <span className="font-semibold text-slate-900">{formatInr(scheme.aggregateFundingNeeded)}</span>
                         <span className="mt-0.5 block font-sans text-[11px] font-normal text-slate-500">{scheme.aggregateFundingNeeded === scheme.largestSingleEventFunding ? "One funding event" : "Multiple funding events combined"}</span>
                     </div>
                     <div className="figure">
                         <span className="mb-0.5 block text-[11px] uppercase tracking-wider text-slate-500">Cash available</span>
                         {scheme.cashAvailable == null ? <span className="font-sans text-sm text-slate-500">Not measured</span> : <span className={(scheme.shortfall ?? 0) > 0 ? "font-semibold text-rose-600" : "font-semibold text-slate-900"}>{formatInr(scheme.cashAvailable)}</span>}
                     </div>
                     <div className="figure">
                        <span className="mb-0.5 block text-[11px] uppercase tracking-wider text-slate-500">Status</span>
                         <span className={(scheme.shortfall ?? 0) > 0 ? "font-medium text-rose-600" : "font-medium text-emerald-600"}>{scheme.fundingStatus}</span>
                     </div>
                   </div>
                 </div>
                 
                 <CardContent className="p-0">
                   {scheme.issuerExposures.length > 0 ? (
                     <div className="overflow-x-auto">
                       <Table>
                         <TableHeader>
                           <TableRow className="bg-transparent hover:bg-transparent">
                              <TableHead className="w-1/3">Issuer exposure</TableHead>
                             <TableHead className="text-right">Current</TableHead>
                              <TableHead className="text-right">Post-action</TableHead>
                             <TableHead className="text-right">Headroom</TableHead>
                             <TableHead>Status</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {scheme.issuerExposures.map((exp, idx) => (
                              <TableRow key={idx} className={exp.status === "Breach" || (exp.includesMandatory && ["Critical", "Tight"].includes(exp.status)) ? "bg-rose-50/60" : ""}>
                               <TableCell>
                                 <div className="font-medium text-slate-900">{exp.issuer}</div>
                                 <div className="mt-0.5 text-[11px] text-slate-500">{exp.eventCount} concurrent event{exp.eventCount !== 1 && 's'} {exp.includesMandatory && '(includes mandatory)'}</div>
                               </TableCell>
                               <TableCell className="figure">{exp.currentPercent.toFixed(2)}%</TableCell>
                               <TableCell className="figure font-semibold">{exp.postActionPercent.toFixed(2)}%</TableCell>
                               <TableCell className="figure">
                                  <span className={["Breach", "Critical"].includes(exp.status) ? "font-medium text-rose-600" : ""}>
                                     {exp.distanceToCapPercent.toFixed(2)}%
                                 </span>
                               </TableCell>
                               <TableCell>
                                  {exp.status === "Breach" ? (
                                   <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                                      <ShieldAlert className="h-3.5 w-3.5" /> Breach
                                   </span>
                                 ) : (
                                    <span className={["Critical", "Tight"].includes(exp.status) ? "text-xs font-semibold text-rose-700" : "text-xs text-slate-500"}>{exp.status}{exp.includesMandatory && exp.status !== "OK" ? " · mandatory" : ""}</span>
                                 )}
                               </TableCell>
                             </TableRow>
                           ))}
                         </TableBody>
                       </Table>
                     </div>
                   ) : (
                     <div className="p-5 text-sm text-slate-500">No active issuer concentration risks identified.</div>
                   )}
                   
                   {scheme.combinedOnlyBreaches.length > 0 && (
                     <div className="border-t border-rose-100 bg-rose-50/50 p-4">
                       <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-800">
                          <AlertTriangle className="h-3.5 w-3.5" /> Combined event breaches
                       </h4>
                       <ul className="space-y-2 text-sm text-rose-900">
                         {scheme.combinedOnlyBreaches.map((breach, idx) => (
                           <li key={idx}>
                             <strong>{breach.issuer}</strong> concentration reaches <strong>{breach.postActionPercent.toFixed(2)}%</strong> (limit {breach.capPercent.toFixed(2)}%), an excess of {breach.excessPercent.toFixed(2)}%, but only if all {breach.eventIds.length} open events execute at maximum entitlement.
                           </li>
             ))}
                       </ul>
                     </div>
                   )}
                 </CardContent>
               </Card>
            ))}
            {analysis.schemes.some(scheme => scheme.openEventCount === 0) && (
            <div className="rounded border border-stone-200 bg-card px-5 py-3 text-sm text-slate-600">
            {analysis.schemes.filter(scheme => scheme.openEventCount === 0).length} schemes have no open corporate actions: {analysis.schemes.filter(scheme => scheme.openEventCount === 0).map(scheme => scheme.schemeName.replace(/^Arka /, "").replace(/ Fund$/, "")).join(", ")}.
            </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
