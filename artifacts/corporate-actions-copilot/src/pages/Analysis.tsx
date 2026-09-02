import { useGetAnalysis } from "@workspace/api-client-react";
import { Link } from "wouter";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export default function Analysis() {
  const { data: analysis, isLoading, isError } = useGetAnalysis();

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading analysis...</div>;
  if (isError || !analysis) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">Analysis could not be loaded.</div>;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-6 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Arka Mutual Fund</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-foreground">Cross-Event Analysis</h1>
        <p className="mt-2 text-sm text-slate-600">Aggregate concentration risk, cross-event funding obligations, and historical execution performance per scheme.</p>
      </header>
      
      <main className="flex-1 space-y-10 p-5 sm:p-8">
        <section aria-labelledby="historical-performance">
          <div className="mb-4">
            <h2 id="historical-performance" className="text-lg font-semibold text-slate-950">Historical Performance</h2>
            <p className="mt-1 text-sm text-slate-500">Value captured and execution quality for settled corporate actions.</p>
          </div>
          
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded border border-stone-200 bg-card p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Value Captured</div>
              <div className="figure text-xl font-semibold text-emerald-700">{formatInr(analysis.history.capturedAmount)}</div>
            </div>
            <div className="rounded border border-stone-200 bg-card p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Value Forfeited</div>
              <div className="figure text-xl font-semibold text-rose-700">{formatInr(analysis.history.forfeitedAmount)}</div>
            </div>
            <div className="rounded border border-stone-200 bg-card p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Lapsed Entitlements</div>
              <div className="figure text-xl font-semibold text-slate-900">{analysis.history.lapsedCount}</div>
            </div>
            <div className="rounded border border-stone-200 bg-card p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium text-slate-500">Deadlines Met</div>
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
            <h2 id="cross-event-risks" className="text-lg font-semibold text-slate-950">Cross-Event Concentration & Funding</h2>
            <p className="mt-1 text-sm text-slate-500">Evaluating aggregate exposure limits across all concurrent open events per scheme.</p>
          </div>
          
          <div className="space-y-6">
            {analysis.schemes.map(scheme => (
               <Card key={scheme.schemeId} className="overflow-hidden border border-stone-200 shadow-sm">
                 <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-muted/50 px-5 py-4">
                   <div>
                     <h3 className="font-semibold text-slate-900"><Link href={`/schemes/${scheme.schemeId}`} className="hover:text-primary hover:underline">{scheme.schemeName}</Link></h3>
                     <p className="mt-1 text-xs text-slate-500">{scheme.openEventCount} open action{scheme.openEventCount !== 1 && 's'}</p>
                   </div>
                   <div className="flex gap-6 text-sm">
                     <div className="figure">
                        <span className="mb-0.5 block text-[11px] uppercase tracking-wider text-slate-500">Aggregate Funding Needed</span>
                        <span className="font-semibold text-slate-900">{formatInr(scheme.aggregateFundingNeeded)}</span>
                     </div>
                     <div className="figure">
                        <span className="mb-0.5 block text-[11px] uppercase tracking-wider text-slate-500">Cash Available</span>
                        <span className={scheme.shortfall > 0 ? "font-semibold text-rose-600" : "font-semibold text-slate-900"}>{formatInr(scheme.cashAvailable)}</span>
                     </div>
                     <div className="figure">
                        <span className="mb-0.5 block text-[11px] uppercase tracking-wider text-slate-500">Status</span>
                        <span className={scheme.shortfall > 0 ? "font-medium text-rose-600" : "font-medium text-emerald-600"}>{scheme.fundingStatus}</span>
                     </div>
                   </div>
                 </div>
                 
                 <CardContent className="p-0">
                   {scheme.issuerExposures.length > 0 ? (
                     <div className="overflow-x-auto">
                       <Table>
                         <TableHeader>
                           <TableRow className="bg-transparent hover:bg-transparent">
                             <TableHead className="w-1/3">Issuer Exposure</TableHead>
                             <TableHead className="text-right">Current</TableHead>
                             <TableHead className="text-right">Post-Action</TableHead>
                             <TableHead className="text-right">Cap Limit</TableHead>
                             <TableHead className="text-right">Headroom</TableHead>
                             <TableHead>Status</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {scheme.issuerExposures.map((exp, idx) => (
                             <TableRow key={idx} className={exp.breach ? "bg-rose-50/30" : ""}>
                               <TableCell>
                                 <div className="font-medium text-slate-900">{exp.issuer}</div>
                                 <div className="mt-0.5 text-[11px] text-slate-500">{exp.eventCount} concurrent event{exp.eventCount !== 1 && 's'} {exp.includesMandatory && '(includes mandatory)'}</div>
                               </TableCell>
                               <TableCell className="figure">{exp.currentPercent.toFixed(2)}%</TableCell>
                               <TableCell className="figure font-semibold">{exp.postActionPercent.toFixed(2)}%</TableCell>
                               <TableCell className="figure text-slate-500">{exp.capPercent.toFixed(2)}%</TableCell>
                               <TableCell className="figure">
                                 <span className={exp.breach ? "font-medium text-rose-600" : ""}>
                                    {exp.breach ? "Limit exceeded" : `${exp.distanceToCapPercent.toFixed(2)}%`}
                                 </span>
                               </TableCell>
                               <TableCell>
                                 {exp.breach ? (
                                   <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                                     <ShieldAlert className="h-3.5 w-3.5" /> Breach Risk
                                   </span>
                                 ) : (
                                   <span className="text-xs text-slate-500">OK</span>
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
                         <AlertTriangle className="h-3.5 w-3.5" /> Combined Event Breaches
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
          </div>
        </section>
      </main>
    </div>
  );
}
