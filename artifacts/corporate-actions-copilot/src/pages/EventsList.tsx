import { useListEvents } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, ArrowRight, Inbox } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function EventsList() {
  const { data: events, isLoading, isError } = useListEvents();
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("All");
  const [status, setStatus] = useState("All");

  const filtered = useMemo(() => (events ?? []).filter((event) => {
    const haystack = `${event.reference} ${event.issuer} ${event.security} ${event.eventType}`.toLowerCase();
    return (!search || haystack.includes(search.toLowerCase()))
      && (risk === "All" || event.risk === risk)
      && (status === "All" || event.status === status);
  }), [events, risk, search, status]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading event inbox…</div>;
  if (isError) return <div className="p-8 text-sm text-destructive">Could not load the event inbox.</div>;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <div className="border-b bg-white px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Event Inbox</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">Search, prioritise, and open the same persisted cases used across the workbench.</p>
          </div>
          <Link href="/intake"><Button>Upload synthetic notice</Button></Link>
        </div>
      </div>
      <div className="p-8">
        <Card>
          <CardHeader className="border-b bg-white">
            <CardTitle className="text-base">Operational cases</CardTitle>
            <CardDescription>POC — Synthetic Data. All instructions remain draft or simulated.</CardDescription>
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, issuer, security, or event type" />
              </div>
              <select className="h-9 rounded-md border bg-white px-3 text-sm" value={risk} onChange={(event) => setRisk(event.target.value)}>
                <option>All</option><option>High</option><option>Medium</option><option>Low</option>
              </select>
              <select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option>All</option>
                {[...new Set((events ?? []).map((event) => event.status))].map((value) => <option key={value}>{value}</option>)}
              </select>
              <Button variant="outline" size="icon" title="Filters are applied locally"><SlidersHorizontal className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead>Reference</TableHead><TableHead>Event</TableHead><TableHead>Classification</TableHead><TableHead>Risk</TableHead><TableHead>Internal deadline</TableHead><TableHead>Status</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-500">No events match these filters.</TableCell></TableRow> : filtered.map((event) => (
                  <TableRow key={event.id} className="group">
                    <TableCell className="font-mono text-xs">{event.reference}</TableCell>
                    <TableCell><div className="font-medium">{event.issuer}</div><div className="text-xs text-slate-500">{event.eventType} · {event.security}</div></TableCell>
                    <TableCell><Badge variant="outline">{event.processingType}</Badge></TableCell>
                    <TableCell><Badge variant={event.risk === "High" ? "destructive" : event.risk === "Medium" ? "warning" : "secondary"}>{event.risk}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-600">{event.internalDeadline}</TableCell>
                    <TableCell><Badge variant="secondary">{event.status}</Badge></TableCell>
                    <TableCell><Link href={`/events/${event.id}`}><Button variant="ghost" size="icon" aria-label={`Open ${event.reference}`}><ArrowRight className="h-4 w-4" /></Button></Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}