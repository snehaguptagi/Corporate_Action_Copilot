import { useGetScheme } from "@workspace/api-client-react";
import { ArrowLeft, ArrowRight, Briefcase } from "lucide-react";
import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { InfoHint } from "@/components/InfoHint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr, issuerIdFor } from "@/lib/format";
import { formatIstDate } from "@/lib/date";

function SectionTitle({ number, children, hint }: { number: string; children: string; hint?: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-1.5 text-xl font-semibold tracking-tight text-foreground">
      {number}. {children}
      {hint && <InfoHint title={children}>{hint}</InfoHint>}
    </h2>
  );
}

function SchemeFact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
        {hint && <InfoHint title={label}>{hint}</InfoHint>}
      </dt>
      <dd className="figure mt-1 text-left text-base font-semibold tracking-tight text-foreground">{value}</dd>
    </div>
  );
}

export default function SchemeDetail() {
  const { schemeId = "" } = useParams();
  const { data: scheme, isLoading, isError } = useGetScheme(schemeId);

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading scheme...</div>;
  if (isError || !scheme) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">The scheme could not be loaded.</div>;

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-card px-5 py-4 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/portfolio" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Portfolio
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{scheme.category}</p>
           <h1 className="mt-2 flex flex-wrap items-center gap-2.5 text-[28px] font-semibold tracking-tight text-foreground"><Briefcase className="h-6 w-6 text-primary" />{scheme.name}
             <InfoHint title="This page">
               Everything the open corporate actions mean for this one scheme: the effect on its NAV (the price of one unit), the cash it must pay or will receive, how close it runs to the SEBI single-company limit, and only the holdings currently in play.
             </InfoHint>
           </h1>
           <p className="mt-4 max-w-4xl text-base leading-7 text-foreground">{scheme.situation}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SchemeFact label="Fund size" value={`₹${scheme.aumCrore.toLocaleString("en-IN")} cr`} hint="Total Assets Under Management for this scheme." />
            <SchemeFact label="NAV per unit" value={`₹${scheme.navRupees.toFixed(2)}`} hint="Net Asset Value, updated daily." />
            <SchemeFact label="Holdings" value={`${scheme.totalHoldings}`} hint="Total number of distinct securities held." />
            <SchemeFact label="Open actions" value={`${scheme.contributions.length}`} hint="Pending corporate actions requiring attention." />
            <SchemeFact label="Cash available" value={formatInr(scheme.funding.available)} hint="Liquid cash currently available to fund corporate action choices." />
          </dl>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-5 py-4 sm:px-8">
        <section>
          <SectionTitle number="1" hint="Every open corporate action touching this scheme and its expected per-unit impact.">What is moving it</SectionTitle>
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="p-0">
              {scheme.contributions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead>Corporate action</TableHead>
                       <TableHead className="text-right whitespace-nowrap">NAV contribution<InfoHint title="NAV contribution" className="ml-1 align-bottom">The expected change to the scheme's NAV from this action.</InfoHint></TableHead>
                       <TableHead className="text-right">Cash</TableHead>
                       <TableHead className="text-right">Deadline</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheme.contributions.map((contribution) => (
                      <TableRow key={contribution.eventId}>
                        <TableCell>
                          <Link href={`/events/${contribution.eventId}`} className="font-semibold text-primary hover:underline">{contribution.eventName}</Link>
                        </TableCell>
                        <TableCell className="figure font-semibold">
                          {contribution.navImpactPaise > 0 ? `${contribution.navImpactPaise.toFixed(2)} paise` : "Neutral"}
                        </TableCell>
                        <TableCell className="figure">
                          {contribution.cashAmount > 0 ? `${formatInr(contribution.cashAmount)} ${contribution.cashDirection.toLowerCase()}` : "No cash movement"}
                        </TableCell>
                        <TableCell className="figure">{contribution.deadline}</TableCell>
                        <TableCell><Link href={`/events/${contribution.eventId}`}><ArrowRight className="h-4 w-4 text-primary" /></Link></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="p-5 text-sm text-slate-500">No open corporate actions.</p>}
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionTitle number="2" hint="Compares available cash against the total cash required to fully subscribe to all open actions.">The funding gap</SectionTitle>
          <Card className="shadow-sm">
             <CardContent className="figure p-5 text-left text-base font-semibold text-foreground">
              Needs {formatInr(scheme.funding.needed)}. Has {formatInr(scheme.funding.available)}.{" "}
               <span className={scheme.funding.shortfall > 0 ? "text-destructive" : "text-success"}>
                {scheme.funding.shortfall > 0 ? `Short ${formatInr(scheme.funding.shortfall)}.` : "Comfortable."}
              </span>
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionTitle number="3" hint="Tracks the highest single-issuer concentration against the regulatory 10% maximum.">SEBI headroom</SectionTitle>
          <Card className="shadow-sm">
            <CardContent className="p-5 text-sm leading-7 text-slate-700">
              {scheme.headroom.maximumRights > 0 ? (
                <p>
                  {scheme.headroom.issuer} is <strong className="figure-inline">{scheme.headroom.currentPercent.toFixed(2)}% of NAV</strong>. Exercising in full takes it to{" "}
                  <strong className="figure-inline">{scheme.headroom.postActionPercent.toFixed(2)}%</strong> and breaches the <span className="figure-inline">{scheme.headroom.capPercent}%</span> cap.
                  Maximum you can take is <strong className="figure-inline">{scheme.headroom.maximumRights.toLocaleString("en-IN")} rights</strong>.
                </p>
              ) : scheme.contributions.length > 0 ? (
                <p>The largest open corporate action leaves <span className="figure-inline">{scheme.headroom.distanceToCapPercent.toFixed(2)}</span> percentage points to the <span className="figure-inline">10%</span> single-issuer cap.</p>
              ) : <p>No open corporate action is consuming issuer headroom.</p>}
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionTitle number="4" hint="The exact portfolio positions driving the impact numbers.">Holdings</SectionTitle>
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="p-0">
              <p className="border-b border-stone-200 bg-stone-50 px-5 py-3 text-sm font-medium text-slate-700">
                {scheme.holdings.length} of {scheme.totalHoldings} holdings have open corporate actions.
              </p>
              {scheme.holdings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead>Security in play</TableHead>
                      <TableHead>ISIN</TableHead>
                      <TableHead className="text-right">Holding</TableHead>
                       <TableHead className="text-right whitespace-nowrap">Position date<InfoHint title="Position date" className="ml-1 align-bottom">The date of the holding snapshot used for calculations.</InfoHint></TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheme.holdings.map((holding) => (
                      <TableRow key={holding.eventId} className="group">
                        <TableCell><Link href={`/issuers/${issuerIdFor(holding.issuer)}`} className="font-semibold text-primary hover:underline">{holding.issuer}</Link></TableCell>
                        <TableCell className="font-mono text-xs">{holding.isin}</TableCell>
                        <TableCell className="text-right">{holding.quantity.toLocaleString("en-IN")} shares</TableCell>
                        <TableCell className="figure">{formatIstDate(`${holding.asOfDate}T00:00:00+05:30`)}</TableCell>
                        <TableCell>
                          <Link href={`/events/${holding.eventId}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-accent hover:text-primary group-hover:text-primary" aria-label="Open corporate action">
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="p-5 text-sm text-slate-500">No holdings are currently in play.</p>}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}