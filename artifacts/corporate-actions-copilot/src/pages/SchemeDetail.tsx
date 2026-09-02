import { useGetScheme } from "@workspace/api-client-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatInr(amount: number) {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lakh`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function SectionTitle({ number, children }: { number: string; children: string }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#a32020]">{number}. {children}</h2>;
}

export default function SchemeDetail() {
  const { schemeId = "" } = useParams();
  const { data: scheme, isLoading, isError } = useGetScheme(schemeId);

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading scheme...</div>;
  if (isError || !scheme) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">The scheme could not be loaded.</div>;

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Portfolio
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Arka Mutual Fund · {scheme.category}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{scheme.name}</h1>
          <p className="mt-4 max-w-4xl text-lg leading-8 text-slate-700">{scheme.situation}</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-7 px-5 py-8 sm:px-8">
        <section>
          <SectionTitle number="1">What is moving it</SectionTitle>
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="p-0">
              {scheme.contributions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#f7f3f0] hover:bg-[#f7f3f0]">
                      <TableHead>Corporate action</TableHead>
                      <TableHead>NAV contribution</TableHead>
                      <TableHead>Cash</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheme.contributions.map((contribution) => (
                      <TableRow key={contribution.eventId}>
                        <TableCell>
                          <Link href={`/events/${contribution.eventId}`} className="font-semibold text-primary hover:underline">{contribution.eventName}</Link>
                        </TableCell>
                        <TableCell className="font-semibold text-[#a32020]">
                          {contribution.navImpactPaise > 0 ? `${contribution.navImpactPaise.toFixed(2)} paise` : "Neutral"}
                        </TableCell>
                        <TableCell>
                          {contribution.cashAmount > 0 ? `${formatInr(contribution.cashAmount)} ${contribution.cashDirection.toLowerCase()}` : "No cash movement"}
                        </TableCell>
                        <TableCell>Decide by {contribution.deadline.split(" · ")[0]}</TableCell>
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
          <SectionTitle number="2">The funding gap</SectionTitle>
          <Card className="shadow-sm">
            <CardContent className="p-5 text-lg font-semibold text-slate-900">
              Needs {formatInr(scheme.funding.needed)}. Has {formatInr(scheme.funding.available)}.{" "}
              <span className={scheme.funding.shortfall > 0 ? "text-rose-700" : "text-emerald-700"}>
                {scheme.funding.shortfall > 0 ? `Short ${formatInr(scheme.funding.shortfall)}.` : "Comfortable."}
              </span>
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionTitle number="3">SEBI headroom</SectionTitle>
          <Card className="shadow-sm">
            <CardContent className="p-5 text-sm leading-7 text-slate-700">
              {scheme.headroom.maximumRights > 0 ? (
                <p>
                  {scheme.headroom.issuer} is <strong>{scheme.headroom.currentPercent.toFixed(2)}% of NAV</strong>. Exercising in full takes it to{" "}
                  <strong>{scheme.headroom.postActionPercent.toFixed(2)}%</strong> and breaches the {scheme.headroom.capPercent}% cap.
                  Maximum you can take is <strong>{scheme.headroom.maximumRights.toLocaleString("en-IN")} rights</strong>.
                </p>
              ) : scheme.contributions.length > 0 ? (
                <p>The largest open corporate action leaves {scheme.headroom.distanceToCapPercent.toFixed(2)} percentage points to the 10% single-issuer cap.</p>
              ) : <p>No open corporate action is consuming issuer headroom.</p>}
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionTitle number="4">Holdings</SectionTitle>
          <Card className="overflow-hidden shadow-sm">
            <CardContent className="p-0">
              {scheme.holdings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#f7f3f0] hover:bg-[#f7f3f0]">
                      <TableHead>Security in play</TableHead>
                      <TableHead>ISIN</TableHead>
                      <TableHead className="text-right">Holding</TableHead>
                      <TableHead>Position date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheme.holdings.map((holding) => (
                      <TableRow key={holding.eventId}>
                        <TableCell><Link href={`/events/${holding.eventId}`} className="font-semibold text-primary hover:underline">{holding.issuer}</Link></TableCell>
                        <TableCell className="font-mono text-xs">{holding.isin}</TableCell>
                        <TableCell className="text-right font-mono">{holding.quantity.toLocaleString("en-IN")} shares</TableCell>
                        <TableCell>{holding.asOfDate}</TableCell>
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