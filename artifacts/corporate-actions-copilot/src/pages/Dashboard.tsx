import { useGetDashboard, useListEvents } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Clock, CheckCircle2, AlertTriangle, FileText, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: dashboard, isLoading: isDashboardLoading } = useGetDashboard();
  const { data: events, isLoading: isEventsLoading } = useListEvents();

  if (isDashboardLoading || isEventsLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading workspace...
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "Shares") {
      return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} shares`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  };

  const formatExposure = (event: NonNullable<typeof events>[number]) => {
    if (event.shareAmount === undefined) return formatCurrency(event.amount, event.currency);
    return `${formatCurrency(event.cashAmount ?? event.amount, event.cashCurrency ?? event.currency)} + ${formatCurrency(event.shareAmount, "Shares")}`;
  };

  const getRiskBadge = (risk: string) => {
    switch (risk.toUpperCase()) {
      case 'HIGH': return <Badge variant="destructive" className="uppercase text-[10px]">High</Badge>;
      case 'MEDIUM': return <Badge variant="warning" className="uppercase text-[10px]">Medium</Badge>;
      default: return <Badge variant="secondary" className="uppercase text-[10px]">Low</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING_REVIEW': return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Needs Review</Badge>;
      case 'PROCESSING': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Processing</Badge>;
      case 'APPROVED': return <Badge variant="success">Approved</Badge>;
      case 'RECONCILED': return <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Reconciled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto">
      <div className="border-b bg-white px-8 py-6 shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Operations Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">High-level risk overview and event inbox. <span className="font-medium text-amber-700">POC — Synthetic Data</span></p>
          </div>
          <Link href="/intake"><button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm">Start hero rights issue</button></Link>
        </div>
      </div>

      <div className="flex-1 p-8 space-y-8 bg-slate-50/50">
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6 flex flex-col gap-1">
              <div className="flex items-center text-sm font-medium text-slate-500 mb-2">
                <FileText className="w-4 h-4 mr-2" />
                Active Events
              </div>
              <div className="text-3xl font-semibold tracking-tight">{dashboard?.totalEvents || 0}</div>
              <p className="text-xs text-slate-500 mt-1">{dashboard?.needsReview || 0} need review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex flex-col gap-1">
              <div className="flex items-center text-sm font-medium text-slate-500 mb-2">
                <Clock className="w-4 h-4 mr-2" />
                Due Today
              </div>
              <div className="text-3xl font-semibold tracking-tight text-amber-600">{dashboard?.dueToday || 0}</div>
              <p className="text-xs text-slate-500 mt-1">Approaching market deadline</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex flex-col gap-1">
              <div className="flex items-center text-sm font-medium text-slate-500 mb-2">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Open Tasks
              </div>
              <div className="text-3xl font-semibold tracking-tight">{dashboard?.openTasks || 0}</div>
              <p className="text-xs text-slate-500 mt-1">Requires intervention</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-6 flex flex-col gap-1">
              <div className="flex items-center text-sm font-medium text-destructive mb-2">
                <AlertCircle className="w-4 h-4 mr-2" />
                Reconciliation Breaks
              </div>
              <div className="text-3xl font-semibold tracking-tight text-destructive">{dashboard?.breaks || 0}</div>
              <p className="text-xs text-destructive/80 mt-1">Immediate action required</p>
            </CardContent>
          </Card>
        </div>

        {/* Inbox */}
        <Card className="shadow-xs border-slate-200">
          <CardHeader className="bg-white px-6 py-5 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">Event Inbox</CardTitle>
            <CardDescription>Prioritised by internal deadline and risk.</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 border-slate-100">
                  <TableHead className="w-[120px] text-xs font-semibold text-slate-500 uppercase tracking-wider">Reference</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Security</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Risk</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Internal Deadline</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Exposure</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                      No events matching criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  events?.map((event) => (
                    <TableRow key={event.id} className="group hover:bg-slate-50/80 cursor-pointer">
                      <TableCell className="font-mono text-xs text-slate-600 font-medium">
                        {event.reference}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{event.security}</div>
                        <div className="text-xs text-slate-500">{event.issuer}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-slate-700">{event.eventType}</div>
                        <div className="text-xs text-slate-500">{event.processingType}</div>
                      </TableCell>
                      <TableCell>{getRiskBadge(event.risk)}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {event.internalDeadline}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-slate-700">
                        {formatExposure(event)}
                      </TableCell>
                      <TableCell>{getStatusBadge(event.status)}</TableCell>
                      <TableCell>
                        <Link href={`/events/${event.id}`}>
                          <button className="p-2 hover:bg-slate-200 rounded-md text-slate-400 hover:text-slate-900 transition-colors opacity-0 group-hover:opacity-100">
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
