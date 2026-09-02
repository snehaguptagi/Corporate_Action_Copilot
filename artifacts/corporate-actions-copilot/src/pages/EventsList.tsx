import { useListEvents } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Inbox, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInr } from "@/lib/format";
import { fundManagerStatus, statusOptions } from "@/lib/status";

function cashDirectionLabel(direction?: string) {
  if (direction === "Payable") return "Funding required";
  if (direction === "Receivable") return "Entitlement";
  return "";
}

export default function EventsList() {
  const { data: events, isLoading, isError, refetch } = useListEvents();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [processingType, setProcessingType] = useState("All");

  const filtered = useMemo(() => (events ?? []).filter((event) => {
    const haystack = `${event.reference} ${event.issuer} ${event.security} ${event.eventType}`.toLowerCase();
    return (!search || haystack.includes(search.toLowerCase()))
      && (status === "All" || fundManagerStatus(event.status, event.isEarlySighting) === status)
      && (processingType === "All" || event.processingType === processingType);
  }), [events, processingType, search, status]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading corporate actions...</div>;
  if (isError) return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
      <Card className="max-w-md border-rose-200">
        <CardContent className="space-y-4 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <div><h1 className="font-semibold">Could not load corporate actions</h1><p className="mt-1 text-sm text-slate-500">No empty list has been shown in place of live event data.</p></div>
          <Button onClick={() => void refetch()}>Retry</Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <div className="border-b bg-card px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" />
              <h1 className="text-[28px] font-semibold tracking-tight text-foreground">Corporate actions</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">Decision deadlines first, then constraints and settlement breaks, followed by computed materiality.</p>
          </div>
          <Link href="/intake"><Button>Log an early sighting</Button></Link>
        </div>
      </div>
      <div className="p-8">
        <Card>
          <CardHeader className="border-b bg-card">
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, issuer, security, or event type" />
              </div>
              <select className="h-9 rounded border bg-card px-3 text-sm outline-none transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option>All</option>
                {statusOptions.map((value) => <option key={value}>{value}</option>)}
              </select>
              <select className="h-9 rounded border bg-card px-3 text-sm outline-none transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={processingType} onChange={(event) => setProcessingType(event.target.value)}>
                <option>All</option>
                {[...new Set((events ?? []).map((event) => event.processingType))].map((value) => <option key={value}>{value}</option>)}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead>Event</TableHead><TableHead className="text-right">Schemes impacted</TableHead><TableHead>Classification</TableHead><TableHead className="text-right">Materiality</TableHead><TableHead className="text-right">Cash impact</TableHead><TableHead>Attention</TableHead><TableHead className="text-right">Decision deadline</TableHead><TableHead>Status</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="h-32 text-center text-slate-500">No events match these filters.</TableCell></TableRow> : filtered.map((event) => {
                    const impacted = event.schemeImpacts.filter((impact) => impact.affected).length;
                    const cashTotal = event.schemeImpacts.filter((impact) => impact.affected).reduce((total, impact) => total + impact.cashAmount, 0);
                    return (
                    <TableRow key={event.id} className="group">
                      <TableCell><div className="font-medium">{event.issuer}</div><div className="text-xs text-slate-500">{event.reference} · {event.eventType} · {event.security}</div>{event.isEarlySighting && <div className="mt-1 text-xs font-semibold text-amber-700">Indicative impact</div>}</TableCell>
                      <TableCell className="figure"><strong>{impacted}</strong> of 10</TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.processingType}</Badge>
                        {cashDirectionLabel(event.cashDirection) && <div className="mt-1 text-xs font-medium text-slate-600">{cashDirectionLabel(event.cashDirection)}</div>}
                      </TableCell>
                      <TableCell className="figure font-semibold">{event.materialityPaise === null ? "Neutral" : `${event.materialityPaise.toFixed(2)} paise`}</TableCell>
                      <TableCell className="figure font-medium">{cashTotal > 0 ? formatInr(cashTotal) : "No cash movement"}</TableCell>
                      <TableCell>{event.attention && <Badge variant="warning">{event.attention}</Badge>}</TableCell>
                      <TableCell className="figure text-sm text-muted-foreground">{event.internalDeadline}</TableCell>
                      <TableCell><Badge variant="secondary">{fundManagerStatus(event.status, event.isEarlySighting)}</Badge></TableCell>
                      <TableCell><Link href={`/events/${event.id}`}><Button variant="outline" size="sm" aria-label={`View ${event.reference}`}>View <ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></Link></TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}