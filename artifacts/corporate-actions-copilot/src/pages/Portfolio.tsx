import { useListSchemes } from "@workspace/api-client-react";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";

export default function Portfolio() {
  const { data: schemes, isLoading, isError } = useListSchemes();

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading portfolio...</div>;
  if (isError || !schemes) return <div className="flex flex-1 items-center justify-center text-sm text-rose-700">The portfolio could not be loaded.</div>;

  const rows = schemes;

  return (
    <div className="flex-1 overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-5 py-6 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Arka Mutual Fund</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-foreground">Portfolio</h1>
        <p className="mt-2 text-sm text-slate-600">All ten schemes ranked by current NAV impact. Every scheme remains openable, even when nothing is happening.</p>
      </header>
      <main className="p-5 sm:p-8">
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted">
                  <TableHead>Scheme</TableHead><TableHead>Open corporate actions touching it</TableHead><TableHead className="text-right">Total NAV impact</TableHead><TableHead className="text-right">Funding gap</TableHead><TableHead>Flag</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((scheme) => (
                    <TableRow key={scheme.id}>
                      <TableCell><Link href={`/schemes/${scheme.id}`} className="font-semibold text-primary hover:underline">{scheme.name}</Link><div className="mt-1 text-xs text-slate-500">{scheme.category}</div></TableCell>
                      <TableCell>{scheme.openActions.length ? <div className="flex flex-wrap gap-1">{scheme.openActions.map((event) => <Link key={event.eventId} href={`/events/${event.eventId}`} className="rounded border bg-stone-50 px-2 py-1 text-xs hover:text-primary">{event.issuer}</Link>)}</div> : <span className="text-slate-500">Nothing open</span>}</TableCell>
                      <TableCell className="figure">{scheme.totalNavImpactPaise > 0 ? <strong>{scheme.totalNavImpactPaise.toFixed(2)} paise</strong> : <span className="text-muted-foreground">Neutral</span>}</TableCell>
                      <TableCell className="figure">{scheme.fundingNeeded > 0 ? <div className="text-xs leading-5">Needs <strong>{formatInr(scheme.fundingNeeded)}</strong> · Has <strong>{formatInr(scheme.cashAvailable)}</strong><div className={scheme.shortfall ? "font-semibold text-destructive" : "font-semibold text-success"}>{scheme.shortfall ? `Short ${formatInr(scheme.shortfall)}` : "Comfortable"}</div></div> : <span className="text-muted-foreground">No funding gap</span>}</TableCell>
                      <TableCell>{scheme.flag ? <span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{scheme.flag}</span> : <span className="text-slate-400">None</span>}</TableCell>
                      <TableCell><Link href={`/schemes/${scheme.id}`} aria-label={`Open ${scheme.name}`}><ArrowRight className="h-4 w-4 text-primary" /></Link></TableCell>
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