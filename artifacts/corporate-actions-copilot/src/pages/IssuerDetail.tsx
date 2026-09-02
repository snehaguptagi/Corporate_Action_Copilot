import { useGetIssuer } from "@workspace/api-client-react";
import { ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";
import { formatIstDate } from "@/lib/date";

function SectionTitle({ number, children }: { number: string; children: string }) {
  return <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">{number}. {children}</h2>;
}

function IssuerFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="figure mt-1 text-left text-base font-semibold tracking-tight text-foreground">{value}</dd>
    </div>
  );
}

export default function IssuerDetail() {
  const { issuerId = "" } = useParams();
  const { data: issuer, isLoading, isError } = useGetIssuer(issuerId);

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading issuer...</div>;
  if (isError || !issuer) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">The issuer could not be loaded.</div>;

  const { summary } = issuer;
  const summaryLine = `${summary.actionsLastQuarter} corporate action${summary.actionsLastQuarter === 1 ? "" : "s"} in the last quarter. ${formatInr(summary.receivedAmount)} received, ${summary.forfeitedAmount > 0 ? formatInr(summary.forfeitedAmount) : "nothing"} forfeited, ${summary.openDecisionCount === 0 ? "no decisions open" : `${summary.openDecisionCount} decision${summary.openDecisionCount === 1 ? "" : "s"} still open`}.`;

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-4 sm:px-8">
        <Link href="/issuers" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><ArrowLeft className="h-3.5 w-3.5" />All issuers</Link>
        <h1 className="mt-2 flex items-center gap-2.5 text-[30px] font-semibold tracking-[-0.03em] text-foreground"><Building2 className="h-7 w-7 text-primary" />{issuer.issuer}</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{issuer.isin}</p>
        <p className="figure-inline mt-3 max-w-3xl text-sm leading-6 text-slate-700">{issuer.situation}</p>
      </header>

      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <section aria-labelledby="house-exposure">
          <SectionTitle number="1">House exposure</SectionTitle>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <IssuerFact label="Total position" value={formatInr(issuer.houseExposure.totalAmount)} />
            <IssuerFact label="Share of house AUM" value={`${issuer.houseExposure.percentOfAum.toFixed(2)}%`} />
            <IssuerFact label="Schemes holding" value={`${issuer.houseExposure.schemeCount} of ${issuer.houseExposure.totalSchemeCount}`} />
            <IssuerFact label="Largest position" value={`${issuer.houseExposure.largestSchemeName} · ${formatInr(issuer.houseExposure.largestSchemeAmount)}`} />
          </dl>
        </section>

        <section aria-labelledby="per-scheme">
          <SectionTitle number="2">Position by scheme</SectionTitle>
          <Card className="overflow-hidden border border-stone-200 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead>Scheme</TableHead>
                      <TableHead className="text-right">Holding</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">% of scheme NAV</TableHead>
                      <TableHead className="text-right">Headroom to 10% cap</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issuer.perScheme.map((row) => (
                      <TableRow key={row.schemeId} className="group">
                        <TableCell>
                          <Link href={`/schemes/${row.schemeId}`} className="font-semibold text-foreground hover:text-primary hover:underline">{row.schemeName}</Link>
                        </TableCell>
                        <TableCell className="figure text-right text-slate-700">{row.holdingQuantity.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="figure text-right font-semibold text-slate-800">{formatInr(row.valueAmount)}</TableCell>
                        <TableCell className="figure text-right text-slate-700">{row.percentOfNav.toFixed(2)}%</TableCell>
                        <TableCell className="text-right">
                          {row.headroomPercent === null
                            ? <span className="text-xs text-slate-400">No open exposure</span>
                            : <span className={`figure font-semibold ${row.headroomPercent < 0 ? "text-rose-700" : row.headroomPercent < 2 ? "text-amber-700" : "text-slate-700"}`}>{row.headroomPercent.toFixed(2)}%</span>}
                        </TableCell>
                        <TableCell>
                          <Link href={`/schemes/${row.schemeId}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-accent hover:text-primary group-hover:text-primary" aria-label={`Open ${row.schemeName}`}>
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
        </section>

        <section aria-labelledby="issuer-actions">
          <SectionTitle number="3">Corporate actions from this issuer</SectionTitle>
          <Card className="overflow-hidden border border-stone-200 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead>Action</TableHead>
                      <TableHead>Arrived</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Cost or earned</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {issuer.events.map((event) => (
                      <TableRow key={event.eventId} className="group">
                        <TableCell>
                          <Link href={`/events/${event.eventId}`} className="font-semibold text-foreground hover:text-primary hover:underline">{event.eventName}</Link>
                        </TableCell>
                        <TableCell className="figure text-sm text-slate-600">{formatIstDate(event.receivedAt)}</TableCell>
                        <TableCell className="text-sm text-slate-700">{event.status}</TableCell>
                        <TableCell className="figure text-right">
                          {event.open
                            ? <span className="text-xs text-slate-400">Open</span>
                            : (
                              <span>
                                {event.capturedAmount ? <span className="font-semibold text-emerald-700">{formatInr(event.capturedAmount)} earned</span> : null}
                                {event.capturedAmount && event.forfeitedAmount ? <span className="text-slate-400"> · </span> : null}
                                {event.forfeitedAmount ? <span className="font-semibold text-rose-700">{formatInr(event.forfeitedAmount)} forfeited</span> : null}
                                {!event.capturedAmount && !event.forfeitedAmount ? <span className="text-slate-500">No cash effect</span> : null}
                              </span>
                            )}
                        </TableCell>
                        <TableCell>
                          <Link href={`/events/${event.eventId}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-accent hover:text-primary group-hover:text-primary" aria-label={`Open ${event.eventName}`}>
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
        </section>

        <section aria-labelledby="issuer-summary">
          <SectionTitle number="4">What this issuer has done to us</SectionTitle>
          <p className="figure-inline dashboard-panel text-sm leading-6 text-slate-700">{summaryLine}</p>
        </section>
      </main>
    </div>
  );
}
