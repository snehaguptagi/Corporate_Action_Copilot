import { useListIssuers, type IssuerSummary } from "@workspace/api-client-react";
import { ArrowRight, Building2 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { InfoHint } from "@/components/InfoHint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";

export function headroomTone(issuer: Pick<IssuerSummary, "attention">) {
  if (issuer.attention === "Breach") return "text-rose-700";
  if (issuer.attention === "Critical") return "text-rose-700";
  if (issuer.attention === "Tight") return "text-amber-700";
  return "text-slate-700";
}

export default function IssuersList() {
  const { data: issuers, isLoading, isError } = useListIssuers();

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading issuers...</div>;
  if (isError || !issuers) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">The issuer book could not be loaded.</div>;

  const attentionCount = issuers.filter((issuer) => Boolean(issuer.attention)).length;
  const openActionCount = issuers.reduce((total, issuer) => total + issuer.openActionCount, 0);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-4 sm:px-8">
        <h1 className="flex items-center gap-2.5 text-[30px] font-semibold tracking-[-0.03em] text-foreground"><Building2 className="h-7 w-7 text-primary" />Issuers
          <InfoHint title="Issuer">
            An issuer is a company whose shares the fund holds, for example Reliance or TCS. This page totals what all Arka schemes hold in each company, because one company can run several corporate actions at once and it is the combined total that matters for the SEBI limit.
          </InfoHint>
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Use this page to see your total position in each company across all Arka schemes. One company can run several corporate actions at once, and it is the combined total that can push a scheme past the SEBI 10% single-company limit. Right now: {issuers.length} compan{issuers.length === 1 ? "y" : "ies"}, {openActionCount} open corporate action{openActionCount === 1 ? "" : "s"}, {attentionCount} near or over the limit.
        </p>
      </header>
      <main className="flex-1 p-4 sm:p-5">
        <Card className="overflow-hidden border border-stone-200 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Issuer + ISIN</TableHead>
                    <TableHead className="text-right">House exposure</TableHead>
                    <TableHead className="text-right"><span className="inline-flex items-center gap-1">% of AUM<InfoHint title="% of AUM">AUM is assets under management, everything Arka manages across all schemes. This column shows what share of that total sits in this one company.</InfoHint></span></TableHead>
                    <TableHead className="text-right">Schemes holding</TableHead>
                    <TableHead className="text-right"><span className="inline-flex items-center gap-1">Affected by open actions<InfoHint title="Holding vs affected">A scheme can hold the company without being touched by its open corporate actions. This column counts only the holders that are eligible for an open action, so it is never more than the holders.</InfoHint></span></TableHead>
                    <TableHead className="text-right">Open actions</TableHead>
                    <TableHead className="text-right"><span className="inline-flex items-center gap-1">Tightest cap headroom<InfoHint title="Cap headroom">SEBI caps how much of one scheme can sit in a single company at 10%. Headroom is the distance left before that cap, shown for whichever scheme is closest to it. Small or negative headroom needs attention.</InfoHint></span></TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issuers.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center text-sm text-slate-500">No issuers with open corporate actions yet. Capture a notice to see house exposure here.</TableCell></TableRow>
                  )}
                  {issuers.map((issuer) => (
                    <TableRow key={issuer.issuerId} className="group align-top">
                      <TableCell>
                        <Link href={`/issuers/${issuer.issuerId}`} className="font-semibold text-foreground hover:text-primary hover:underline">{issuer.issuer}</Link>
                        <div className="mt-1 font-mono text-[11px] text-slate-500">{issuer.isin}</div>
                      </TableCell>
                      <TableCell className="figure text-right font-semibold text-slate-800">{formatInr(issuer.houseExposureAmount)}</TableCell>
                      <TableCell className="figure text-right text-slate-700">{issuer.percentOfAum.toFixed(2)}%</TableCell>
                      <TableCell className="figure text-right text-slate-700">{issuer.schemesHolding}</TableCell>
                      <TableCell className="figure text-right text-slate-700">{issuer.openActionCount > 0 ? issuer.schemesAffected : <span className="text-slate-400">0</span>}</TableCell>
                      <TableCell className="figure text-right text-slate-700">{issuer.openActionCount > 0 ? issuer.openActionCount : <span className="text-slate-400">0</span>}</TableCell>
                      <TableCell className="text-right">
                        {issuer.tightestHeadroomPercent === null
                          ? <span className="text-xs text-slate-400">No open exposure</span>
                          : (
                            <span className={`figure font-semibold ${headroomTone(issuer)}`}>
                              {issuer.tightestHeadroomPercent.toFixed(2)}%
                              {issuer.attention ? <span className="ml-2 inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 align-middle">{issuer.attention}</span> : null}
                            </span>
                          )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/issuers/${issuer.issuerId}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-accent hover:text-primary group-hover:text-primary" aria-label={`Open ${issuer.issuer}`}>
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
