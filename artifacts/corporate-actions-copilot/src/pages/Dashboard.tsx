import { useGetDashboard, useListEvents, useListTasks, type EventSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  ListChecks,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "wouter";

const workflowStages = [
  { label: "Notice intake", statuses: ["Received"], color: "bg-slate-400" },
  { label: "Term review", statuses: ["Under review", "Validated"], color: "bg-amber-500" },
  { label: "Election", statuses: ["Election required"], color: "bg-violet-500" },
  { label: "Checker approval", statuses: ["Awaiting approval", "Approved"], color: "bg-blue-500" },
  { label: "Settlement", statuses: ["Awaiting settlement", "Break identified"], color: "bg-cyan-500" },
  { label: "Reconciled", statuses: ["Closed", "Reconciled"], color: "bg-emerald-500" },
];

const attentionOrder: Record<string, number> = {
  "Break identified": 0,
  "Under review": 1, Validated: 1,
  "Election required": 2,
  "Awaiting approval": 3, Approved: 3,
  "Awaiting settlement": 4,
  Received: 5,
  Closed: 6,
  Reconciled: 7,
};

function formatCurrency(amount: number, currency: string) {
  if (currency === "Shares") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} shares`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

type DashboardEvent = EventSummary & {
  shareAmount?: number;
  cashAmount?: number;
  cashCurrency?: string;
  cashDirection?: "Receivable" | "Payable";
};

function formatExposure(event: DashboardEvent) {
  const exposure = event.shareAmount === undefined
    ? formatCurrency(event.amount, event.currency)
    : `${formatCurrency(event.cashAmount ?? event.amount, event.cashCurrency ?? event.currency)} + ${formatCurrency(event.shareAmount, "Shares")}`;
  if (event.cashDirection === "Payable") return `Funding required: ${exposure}`;
  if (event.cashDirection === "Receivable") return `Entitlement: ${exposure}`;
  return exposure;
}

function formatActivityTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getRiskBadge(risk: string) {
  switch (risk.toUpperCase()) {
    case "HIGH":
      return <Badge variant="destructive" className="uppercase text-[10px]">High</Badge>;
    case "MEDIUM":
      return <Badge variant="warning" className="uppercase text-[10px]">Medium</Badge>;
    default:
      return <Badge variant="secondary" className="uppercase text-[10px]">Low</Badge>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "Received":
      return <Badge variant="secondary">Notice received</Badge>;
    case "Under review":
      return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Needs review</Badge>;
    case "Election required":
      return <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">Election required</Badge>;
    case "Awaiting approval":
      return <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Awaiting approval</Badge>;
    case "Awaiting settlement":
      return <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">Awaiting settlement</Badge>;
    case "Closed":
    case "Reconciled":
      return <Badge variant="success">{status}</Badge>;
    case "Break identified":
      return <Badge variant="destructive">Break identified</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getAttentionReason(status: string) {
  switch (status) {
    case "Break identified":
      return "Settlement variance needs investigation";
    case "Under review":
      return "Extracted terms need an analyst decision";
    case "Election required":
      return "Client election is needed before cutoff";
    case "Awaiting approval":
      return "Independent reviewer sign-off is required";
    case "Awaiting settlement":
      return "Monitor custodian settlement confirmation";
    case "Received":
      return "Notice is ready to enter the workbench";
    default:
      return "No action currently required";
  }
}

function getActivityIcon(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("reconcil") || normalized.includes("settle")) return <Banknote className="h-4 w-4" />;
  if (normalized.includes("approv")) return <ShieldCheck className="h-4 w-4" />;
  if (normalized.includes("calcul")) return <CircleDot className="h-4 w-4" />;
  if (normalized.includes("instruction")) return <Send className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
}

export default function Dashboard() {
  const { data: dashboard, isLoading: isDashboardLoading, isError: isDashboardError, refetch: refetchDashboard } = useGetDashboard();
  const { data: events, isLoading: isEventsLoading, isError: isEventsError, refetch: refetchEvents } = useListEvents();
  const { data: tasks, isLoading: isTasksLoading, isError: isTasksError, refetch: refetchTasks } = useListTasks();

  if (isDashboardLoading || isEventsLoading || isTasksLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading workspace...
        </div>
      </div>
    );
  }

  if (isDashboardError || isEventsError || isTasksError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md border-rose-200">
          <CardContent className="space-y-4 p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
            <div>
              <h1 className="font-semibold text-slate-900">Operational data is unavailable</h1>
              <p className="mt-1 text-sm text-slate-500">The dashboard has not substituted missing data with zeros. Retry to reload the active case, task, and control data.</p>
            </div>
            <Button onClick={() => { void refetchDashboard(); void refetchEvents(); void refetchTasks(); }}>Retry dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const eventList = events ?? [];
  const taskList = tasks ?? [];
  const openTasks = taskList.filter((task) => task.status.toUpperCase() === "OPEN");
  const highRiskCount = eventList.filter((event) => event.risk.toUpperCase() === "HIGH").length;
  const mediumRiskCount = eventList.filter((event) => event.risk.toUpperCase() === "MEDIUM").length;
  const lowRiskCount = eventList.filter((event) => event.risk.toUpperCase() === "LOW").length;
  const monitoredEvents = eventList.filter((event) => !["Closed", "Reconciled"].includes(event.status));
  const priorityEvents = [...monitoredEvents]
    .sort((a, b) => (attentionOrder[a.status] ?? 99) - (attentionOrder[b.status] ?? 99))
    .slice(0, 5);
  const stageCount = workflowStages.filter((stage) =>
    eventList.some((event) => stage.statuses.includes(event.status)),
  ).length;
  const riskTotal = Math.max(eventList.length, 1);
  const topTasks = [...openTasks]
    .sort((a, b) => Number(b.priority.toUpperCase() === "HIGH") - Number(a.priority.toUpperCase() === "HIGH"))
    .slice(0, 4);

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto">
      <header className="shrink-0 border-b bg-white px-5 py-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Control room
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Operations dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              A single view of what is moving, what is blocked, and where the synthetic cases are in the corporate-action lifecycle.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/events">
              <Button variant="outline">Open event inbox</Button>
            </Link>
            <Link href="/intake">
              <Button>Process new notice</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-6 bg-slate-50/70 p-5 sm:p-8">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-amber-100 p-1.5 text-amber-700">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-950">Demo dataset: synthetic operational cases</p>
              <p className="mt-0.5 text-xs leading-5 text-amber-900/75">
                {eventList.length} synthetic Indian cases show the full journey from notice intake to settlement. Amounts are INR or explicit security quantities.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-amber-900/80">
            <span>{eventList.length} cases</span>
            <span>{highRiskCount} high risk</span>
            <span>{dashboard?.breaks ?? 0} live break</span>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Cases in workspace</span>
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{eventList.length}</div>
              <p className="mt-1 text-xs text-slate-500">{stageCount} of {workflowStages.length} lifecycle stages currently represented</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Action or monitoring</span>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-amber-600">{monitoredEvents.length}</div>
              <p className="mt-1 text-xs text-slate-500">{dashboard?.needsReview ?? 0} currently need term review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Open tasks</span>
                <ListChecks className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{dashboard?.openTasks ?? openTasks.length}</div>
              <p className="mt-1 text-xs text-slate-500">{dashboard?.dueToday ?? 0} due today</p>
            </CardContent>
          </Card>
          <Card className="border-rose-200 bg-rose-50/70">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-rose-700">Settlement breaks</span>
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-rose-700">{dashboard?.breaks ?? 0}</div>
              <p className="mt-1 text-xs text-rose-700/75">Requires investigation, not auto-close</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <Card>
            <CardHeader className="border-b border-slate-100 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base text-slate-900">Priority queue</CardTitle>
                  <CardDescription className="mt-1">The next operational reason for each non-closed case.</CardDescription>
                </div>
                <Link href="/events">
                  <Button variant="ghost" size="sm" className="gap-1 text-primary">
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {priorityEvents.length === 0 ? (
                <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  All demo cases are closed or reconciled.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {priorityEvents.map((event) => (
                    <Link key={event.id} href={`/events/${event.id}`}>
                      <div className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-slate-50">
                        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${event.status === "Break identified" ? "bg-rose-500" : event.risk.toUpperCase() === "HIGH" ? "bg-amber-500" : "bg-blue-500"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{event.reference}</p>
                            {getRiskBadge(event.risk)}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{event.security} · {getAttentionReason(event.status)}</p>
                        </div>
                        <div className="hidden shrink-0 text-right sm:block">
                          <div className="text-xs font-medium text-slate-700">{event.internalDeadline}</div>
                          <div className="mt-1">{getStatusBadge(event.status)}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-primary" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100 bg-white">
              <CardTitle className="text-base text-slate-900">Demo coverage</CardTitle>
              <CardDescription className="mt-1">Where the seeded cases sit in the workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {workflowStages.map((stage) => {
                const count = eventList.filter((event) => stage.statuses.includes(event.status)).length;
                return (
                  <div key={stage.label} className="flex items-center gap-3">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${stage.color}`} />
                    <span className="min-w-0 flex-1 text-sm text-slate-700">{stage.label}</span>
                    <span className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${count ? "bg-slate-100 text-slate-700" : "text-slate-300"}`}>
                      {count}
                    </span>
                  </div>
                );
              })}
              <div className="border-t border-slate-100 pt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">Risk mix</span>
                  <span className="text-slate-400">{eventList.length} total cases</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="bg-rose-500" style={{ width: `${(highRiskCount / riskTotal) * 100}%` }} />
                  <div className="bg-amber-400" style={{ width: `${(mediumRiskCount / riskTotal) * 100}%` }} />
                  <div className="bg-slate-300" style={{ width: `${(lowRiskCount / riskTotal) * 100}%` }} />
                </div>
                <div className="mt-2 flex gap-4 text-[11px] text-slate-500">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />{highRiskCount} high</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />{mediumRiskCount} medium</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-300" />{lowRiskCount} low</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
          <Card>
            <CardHeader className="border-b border-slate-100 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base text-slate-900">Workload to clear</CardTitle>
                  <CardDescription className="mt-1">Open tasks generated from the demo workflow.</CardDescription>
                </div>
                <Link href="/tasks">
                  <Button variant="outline" size="sm">Open task list</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {topTasks.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No open tasks.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {topTasks.map((task, index) => (
                    <div key={`${task.id}-${index}`} className="flex items-start gap-3 px-5 py-3.5">
                      <div className="mt-0.5">
                        {task.priority.toUpperCase() === "HIGH" ? <AlertTriangle className="h-4 w-4 text-rose-500" /> : <Clock3 className="h-4 w-4 text-amber-500" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{task.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{task.eventReference ?? task.eventId} · owner {task.owner}</p>
                      </div>
                      <span className="shrink-0 text-right text-xs text-slate-500">{task.due}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100 bg-white">
              <CardTitle className="text-base text-slate-900">Recent control activity</CardTitle>
              <CardDescription className="mt-1">The latest actions recorded in the audit history.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(dashboard?.recentActivity ?? []).length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No recent activity.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(dashboard?.recentActivity ?? []).slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 px-5 py-3.5">
                      <div className="mt-0.5 rounded-full bg-blue-50 p-1.5 text-blue-600">{getActivityIcon(activity.action)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{activity.action}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{activity.actor} · {activity.detail}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400">{formatActivityTime(activity.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader className="border-b border-slate-100 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base text-slate-900">All demo cases</CardTitle>
                <CardDescription className="mt-1">Every row is a separate event with its own notice, holdings, calculations, controls, and settlement state.</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" />
                {eventList.reduce((total, event) => total + (event.affectedAccounts ?? 0), 0).toLocaleString()} affected accounts
              </div>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 bg-slate-50 hover:bg-slate-50">
                  <TableHead className="w-[125px] text-xs font-semibold uppercase tracking-wider text-slate-500">Reference</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Security</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Event</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Risk</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">Deadline</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Exposure</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500">State</TableHead>
                  <TableHead className="w-[55px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-slate-500">No demo cases loaded.</TableCell>
                  </TableRow>
                ) : (
                  eventList.map((event) => (
                    <TableRow key={event.id} className="group hover:bg-slate-50/80">
                      <TableCell className="font-mono text-xs font-medium text-slate-600">{event.reference}</TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{event.security}</div>
                        <div className="text-xs text-slate-500">{event.issuer}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-slate-700">{event.eventType}</div>
                        <div className="text-xs text-slate-500">{event.processingType}</div>
                      </TableCell>
                      <TableCell>{getRiskBadge(event.risk)}</TableCell>
                      <TableCell className="text-sm text-slate-600">{event.internalDeadline}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-slate-700">{formatExposure(event)}</TableCell>
                      <TableCell>{getStatusBadge(event.status)}</TableCell>
                      <TableCell>
                        <Link href={`/events/${event.id}`}>
                          <Button variant="ghost" size="icon" className="text-slate-400 opacity-60 group-hover:text-primary group-hover:opacity-100" aria-label={`Open ${event.reference}`}>
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
}