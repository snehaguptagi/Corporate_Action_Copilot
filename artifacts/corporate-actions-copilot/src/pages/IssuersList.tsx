import { useListIssuers, type IssuerSummary } from "@workspace/api-client-react";
import { ArrowRight, Building2 } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
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
        <h1 className="flex items-center gap-2.5 text-[30px] font-semibold tracking-[-0.03em] text-foreground"><Building2 className="h-7 w-7 text-primary" />Issuers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Every company the house holds, ranked by what Arka has at stake. {issuers.length} issuers, {openActionCount} open corporate actions, {attentionCount} near or over the SEBI single-issuer cap.
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
                    <TableHead className="text-right">% of AUM</TableHead>
                    <TableHead className="text-right">Schemes holding</TableHead>
                    <TableHead className="text-right">Open actions</TableHead>
                    <TableHead className="text-right">Tightest cap headroom</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issuers.map((issuer) => (
                    <TableRow key={issuer.issuerId} className="group align-top">
                      <TableCell>
                        <Link href={`/issuers/${issuer.issuerId}`} className="font-semibold text-foreground hover:text-primary hover:underline">{issuer.issuer}</Link>
                        <div className="mt-1 font-mono text-[11px] text-slate-500">{issuer.isin}</div>
                      </TableCell>
                      <TableCell className="figure text-right font-semibold text-slate-800">{formatInr(issuer.houseExposureAmount)}</TableCell>
                      <TableCell className="figure text-right text-slate-700">{issuer.percentOfAum.toFixed(2)}%</TableCell>
                      <TableCell className="figure text-right text-slate-700">{issuer.schemesHolding}</TableCell>
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
