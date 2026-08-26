import {
  useApproveEvent,
  useCalculateEvent,
  useGetEvent,
  useSaveElection,
  useSaveReconciliation,
  useUpdateEvent,
  useUpdateInstruction,
  getGetEventQueryKey,
  getGetDashboardQueryKey,
  getListEventsQueryKey,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, CheckCircle2, ExternalLink, FileSearch, FileText, LockKeyhole, Play, Send, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getDemoRole } from "@/lib/demo-role";

const money = (amount: number, currency: string) => currency === "Shares"
  ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(amount)} shares`
  : new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

const demoPdfPath = `${import.meta.env.BASE_URL}demo-notices/rights-issue-notice.pdf`;
const heroJourney = ["Notice", "Terms", "Holdings", "Calculation", "Election", "Approval", "Instruction", "Settlement", "Audit"];

function getHeroJourneyIndex(status: string) {
  if (status === "Received") return 0;
  if (status === "Under review") return 1;
  if (status === "Election required") return 4;
  if (status === "Awaiting approval") return 5;
  if (status === "Approved") return 5;
  if (status === "Awaiting settlement") return 7;
  if (status === "Break identified" || status === "Reconciled") return 8;
  return 1;
}

export default function EventWorkbench() {
  const { eventId = "" } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: event, isLoading, isError } = useGetEvent(eventId);
  const updateEvent = useUpdateEvent();
  const calculateEvent = useCalculateEvent();
  const saveElection = useSaveElection();
  const approveEvent = useApproveEvent();
  const updateInstruction = useUpdateInstruction();
  const saveReconciliation = useSaveReconciliation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [electionOptions, setElectionOptions] = useState<Record<string, string>>({});
  const [electionQuantities, setElectionQuantities] = useState<Record<string, string>>({});
  const [electionComments, setElectionComments] = useState<Record<string, string>>({});
  const [actual, setActual] = useState("");
  const [actualSecurity, setActualSecurity] = useState("");
  const [reconNote, setReconNote] = useState("");
  const [actor, setActor] = useState(getDemoRole);

  useEffect(() => {
    const refreshActor = () => setActor(getDemoRole());
    window.addEventListener("demo-role-change", refreshActor);
    return () => window.removeEventListener("demo-role-change", refreshActor);
  }, []);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
  };

  const mutateError = (title: string, error: unknown) => toast({
    title,
    description: error instanceof Error ? error.message : "The workflow control blocked this action.",
    variant: "destructive",
  });

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading workbench…</div>;
  if (isError || !event) return <div className="flex flex-1 items-center justify-center text-sm text-destructive">The workbench could not be loaded.</div>;

  const data = event as any;
  const isAnalyst = actor.role === "Operations Analyst";
  const isReviewer = actor.role === "Reviewer";
  const missingTerms = data.validation?.missingTerms ?? [];
  const canCalculate = data.validation?.isReady && isAnalyst;

  const updateTerm = (term: any) => {
    const nextValue = values[term.key] ?? term.value;
    const changed = nextValue !== term.value;
    updateEvent.mutate({
      eventId,
      data: {
        terms: [{ key: term.key, value: nextValue, reason: changed ? reasons[term.key] ?? "" : undefined }],
        actorId: actor.id,
        actorRole: actor.role,
        reason: changed ? reasons[term.key] ?? "" : "",
      },
    }, {
      onSuccess: () => { toast({ title: changed ? "Term corrected" : "Term validated" }); setValues((current) => ({ ...current, [term.key]: nextValue })); refresh(); },
      onError: (error) => mutateError("Term update blocked", error),
    });
  };

  const runCalculation = () => calculateEvent.mutate({ eventId, data: { actorId: actor.id, actorRole: actor.role } }, {
    onSuccess: () => { toast({ title: "Deterministic impacts calculated" }); refresh(); },
    onError: (error) => mutateError("Calculation blocked", error),
  });

  const saveAnElection = (impact: any) => {
    const optionId = electionOptions[impact.id];
    const quantityElected = Number(electionQuantities[impact.id] ?? "");
    if (!optionId || Number.isNaN(quantityElected)) {
      toast({ title: "Election details needed", description: "Select an option and enter a valid quantity.", variant: "destructive" });
      return;
    }
    saveElection.mutate({ eventId, data: { impactId: impact.id, optionId, quantityElected, comment: electionComments[impact.id] ?? "", actorId: actor.id, actorRole: actor.role } }, {
      onSuccess: () => { toast({ title: "Election submitted for approval" }); refresh(); },
      onError: (error) => mutateError("Election blocked", error),
    });
  };

  const approve = (approved: boolean) => approveEvent.mutate({ eventId, data: { approved, note: approved ? "Independent reviewer approval recorded." : "Returned for analyst review.", actorId: actor.id, actorRole: actor.role } }, {
    onSuccess: () => { toast({ title: approved ? "Checker approval recorded" : "Event returned" }); refresh(); },
    onError: (error) => mutateError("Approval blocked", error),
  });

  const simulate = () => updateInstruction.mutate({ eventId, data: { status: "SIMULATED — NOT SENT", actorId: actor.id, actorRole: actor.role } }, {
    onSuccess: () => { toast({ title: "Instruction simulated", description: "No external instruction was sent." }); refresh(); },
    onError: (error) => mutateError("Instruction blocked", error),
  });

  const reconcile = () => {
    const amount = Number(actual);
    if (Number.isNaN(amount)) {
      toast({ title: "Actual cash is required", variant: "destructive" });
      return;
    }
    saveReconciliation.mutate({ eventId, data: {
      actual: amount,
      actualSecurityQuantity: actualSecurity ? Number(actualSecurity) : undefined,
      actualCurrency: data.reconciliation.expectedCurrency,
      actualSettlementDate: data.reconciliation.expectedSettlementDate,
      actualAccount: data.reconciliation.expectedAccount,
      note: reconNote || "Synthetic settlement result recorded.",
      actorId: actor.id,
      actorRole: actor.role,
    } }, {
      onSuccess: () => { toast({ title: "Settlement reconciled" }); refresh(); },
      onError: (error) => mutateError("Reconciliation blocked", error),
    });
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-slate-50/50">
      <header className="border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/events"><Button variant="ghost" size="icon" aria-label="Back to inbox"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-lg font-bold">{data.reference}</h1><Badge variant={data.risk === "High" ? "destructive" : data.risk === "Medium" ? "warning" : "secondary"}>{data.risk} risk</Badge><Badge variant="outline">{data.status}</Badge>{data.isHero && <Badge className="bg-primary">Hero case</Badge>}</div>
              <p className="mt-1 text-sm text-slate-500">{data.eventType} · {data.processingType} · {data.security}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs"><div className="uppercase tracking-wide text-slate-400">Internal deadline</div><div className="font-medium text-slate-700">{data.internalDeadline}</div></div>
            <Badge variant="secondary">{actor.name} · {actor.role}</Badge>
            {data.status === "Awaiting approval" && <Button disabled={!isReviewer || approveEvent.isPending} onClick={() => approve(true)}><UserRoundCheck className="mr-2 h-4 w-4" />Approve</Button>}
          </div>
        </div>
      </header>

      {data.isHero && (
        <div className="shrink-0 border-b bg-slate-50 px-6 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <FileSearch className="h-3.5 w-3.5 text-primary" />
              Hero journey
            </div>
            <span className="text-xs text-slate-500">
              Current control point: <strong className="text-slate-700">{data.status}</strong>
            </span>
          </div>
          <div className="flex min-w-max items-center gap-1 overflow-x-auto pb-1">
            {heroJourney.map((step, index) => {
              const currentStep = getHeroJourneyIndex(data.status);
              const complete = index < currentStep;
              const active = index === currentStep;
              return (
                <div key={step} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    active ? "bg-primary text-primary-foreground" : complete ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-400"
                  }`}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                      active ? "bg-white/20" : complete ? "bg-emerald-200" : "bg-slate-100"
                    }`}>{complete ? "✓" : index + 1}</span>
                    {step}
                  </div>
                  {index < heroJourney.length - 1 && <span className={`text-xs ${complete ? "text-emerald-500" : "text-slate-300"}`}>→</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="overview" className="flex h-full flex-col">
          <div className="overflow-x-auto border-b bg-white px-4 pt-2">
            <TabsList className="h-auto min-w-max bg-transparent">
              {["overview", "evidence", "positions", "calculation", "elections", "tasks", "instruction", "reconciliation", "audit"]
                .filter((tab) => tab !== "elections" || data.processingType !== "Mandatory")
                .map((tab) => <TabsTrigger key={tab} value={tab} className="capitalize">{tab === "instruction" ? "Instruction" : tab}</TabsTrigger>)}
            </TabsList>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="overview" className="m-0 space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader className="pb-2"><CardDescription>Source truth</CardDescription><CardTitle className="text-base">{data.notice.documentName}</CardTitle></CardHeader><CardContent className="text-sm text-slate-600">{data.notice.source}<br />Received {new Date(data.notice.receivedAt).toLocaleString("en-GB")}</CardContent></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Eligibility</CardDescription><CardTitle className="text-base">{data.impacts.length} affected accounts</CardTitle></CardHeader><CardContent className="text-sm text-slate-600">Positions are filtered by ISIN, account state, quantity, and record date.</CardContent></Card>
                <Card><CardHeader className="pb-2"><CardDescription>Control state</CardDescription><CardTitle className="text-base">{data.status}</CardTitle></CardHeader><CardContent className="text-sm text-slate-600">{data.processingType === "Mandatory" ? "No election workflow is presented for this mandatory event." : "Election, independent approval, and instruction are gated."}</CardContent></Card>
              </div>
              <Card className={missingTerms.length ? "border-amber-300 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/30"}>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base">{missingTerms.length ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}Calculation gate</CardTitle><CardDescription>{missingTerms.length ? `Calculation is blocked until ${missingTerms.join(", ")} is validated.` : "All required terms are validated. Deterministic calculation may be run or re-run."}</CardDescription></CardHeader>
                <CardContent>{isAnalyst && <Button onClick={runCalculation} disabled={!canCalculate || calculateEvent.isPending}><Play className="mr-2 h-4 w-4" />{data.impacts.length ? "Re-run deterministic calculation" : "Calculate eligibility and impact"}</Button>}</CardContent>
              </Card>
              {data.isHero && <Card><CardHeader><CardTitle className="text-base">Hero journey</CardTitle><CardDescription>Upload → validate terms → match holdings → calculate → enter election → reviewer approval → simulated instruction → reconcile → audit.</CardDescription></CardHeader></Card>}
            </TabsContent>

              <TabsContent value="evidence" className="m-0 space-y-4">
               {data.isHero && <Card className="overflow-hidden border-primary/20"><CardHeader className="border-b border-slate-100 bg-white"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-primary" />Uploaded source document</CardTitle><CardDescription className="mt-1">The PDF remains visible beside the extracted terms so every review decision can be checked against source evidence.</CardDescription></div><a href={demoPdfPath} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><ExternalLink className="mr-2 h-3.5 w-3.5" />Open PDF</Button></a></div></CardHeader><CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.6fr)]"><div className="overflow-hidden rounded border bg-slate-100"><iframe title="Uploaded synthetic rights issue notice" src={demoPdfPath} className="h-[520px] w-full bg-white" /></div><div className="space-y-4"><div className="rounded border bg-slate-50 p-4 text-sm"><div className="flex items-center gap-2 font-medium text-slate-900"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Uploaded and linked</div><dl className="mt-3 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Document</dt><dd className="text-right font-medium text-slate-700">{data.notice.documentName}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Source</dt><dd className="text-right font-medium text-slate-700">{data.notice.source}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">State</dt><dd className="text-right font-medium text-emerald-700">{data.notice.uploadState}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Pages</dt><dd className="text-right font-medium text-slate-700">{data.notice.pages?.length ?? 0}</dd></div></dl></div><div className="rounded border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><strong>Review rule</strong><br />Terms are not trusted until the analyst validates them against the page evidence. Corrections require a reason and remain in the audit trail.</div></div></CardContent></Card>}
              <Card><CardHeader><CardTitle>Source evidence and extracted terms</CardTitle><CardDescription>Every value links to a source page. Manual corrections require a reason.</CardDescription></CardHeader></Card>
              {data.terms.map((current: any) => {
                const currentValue = values[current.key] ?? current.value;
                const changed = currentValue !== current.value;
                return <Card key={current.key}><CardContent className="grid gap-4 p-5 md:grid-cols-[0.9fr,1.6fr]"><div><div className="font-medium">{current.label}</div><div className="mt-1 text-xs text-slate-400">{current.key} · {Math.round(current.confidence * 100)}% confidence</div><Badge className="mt-3" variant={current.reviewStatus === "Validated" ? "secondary" : "warning"}>{current.reviewStatus}</Badge></div><div className="space-y-3"><Input value={currentValue} disabled={!isAnalyst} onChange={(change) => setValues((existing) => ({ ...existing, [current.key]: change.target.value }))} /><div className="rounded border border-amber-100 bg-amber-50 p-3 text-xs text-amber-950"><strong>Evidence · {current.page}</strong><br />“{current.evidence}”</div>{changed && <Input placeholder="Reason for manual correction (required)" value={reasons[current.key] ?? ""} onChange={(change) => setReasons((existing) => ({ ...existing, [current.key]: change.target.value }))} />} {isAnalyst && <Button size="sm" disabled={updateEvent.isPending} onClick={() => updateTerm(current)}>{changed ? "Save correction" : "Validate term"}</Button>}</div></CardContent></Card>;
              })}
              <Card><CardHeader><CardTitle className="text-base">Document pages</CardTitle></CardHeader><CardContent className="space-y-3">{data.notice.pages?.map((page: any) => <pre key={page.page} className="whitespace-pre-wrap rounded border bg-slate-50 p-4 text-xs leading-5 text-slate-700">Page {page.page}{"\n"}{page.text}</pre>)}</CardContent></Card>
            </TabsContent>

            <TabsContent value="positions" className="m-0 space-y-4">
              <Card><CardHeader><CardTitle>Affected positions and eligibility</CardTitle><CardDescription>Matching uses the notice ISIN, record date, quantity, and account status. Excluded rows show why they were not used.</CardDescription></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Fund / account</TableHead><TableHead>ISIN</TableHead><TableHead>Position date</TableHead><TableHead className="text-right">Eligible quantity</TableHead><TableHead>Eligibility</TableHead><TableHead>Data quality</TableHead></TableRow></TableHeader><TableBody>{data.positions.map((position: any) => <TableRow key={position.id}><TableCell><div className="font-medium">{position.fund}</div><div className="text-xs text-slate-500">{position.account}</div></TableCell><TableCell className="font-mono text-xs">{position.isin}</TableCell><TableCell>{position.positionDate}</TableCell><TableCell className="text-right font-mono">{position.eligibleQuantity.toLocaleString()}</TableCell><TableCell><Badge variant={position.eligibilityStatus === "Eligible" ? "secondary" : "outline"}>{position.eligibilityStatus}</Badge></TableCell><TableCell className="text-xs text-amber-700">{position.dataQualityWarning || "—"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
            </TabsContent>

            <TabsContent value="calculation" className="m-0 space-y-4">
              <Card><CardHeader><CardTitle>Deterministic impact calculation</CardTitle><CardDescription>{data.calculation.rounding} {data.calculation.assumptions}</CardDescription></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-slate-600">Last run: {data.calculation.calculationRunAt ? new Date(data.calculation.calculationRunAt).toLocaleString("en-GB") : "Not run"}</span>{isAnalyst && <Button onClick={runCalculation} disabled={!canCalculate || calculateEvent.isPending}><Play className="mr-2 h-4 w-4" />Re-run calculation</Button>}</CardContent></Card>
              <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Fund / account</TableHead><TableHead className="text-right">Eligible qty</TableHead><TableHead>Formula</TableHead><TableHead className="text-right">Expected cash</TableHead><TableHead className="text-right">Expected securities</TableHead><TableHead>Assumption</TableHead></TableRow></TableHeader><TableBody>{data.impacts.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">Validate required terms, then run calculation to produce impacts.</TableCell></TableRow> : data.impacts.map((impact: any) => <TableRow key={impact.id}><TableCell><div className="font-medium">{impact.fund}</div><div className="text-xs text-slate-500">{impact.account}</div></TableCell><TableCell className="text-right font-mono">{impact.eligibleQuantity.toLocaleString()}</TableCell><TableCell className="font-mono text-xs">{impact.formula}</TableCell><TableCell className="text-right font-mono">{money(impact.expectedCash ?? 0, data.currency === "Shares" ? "EUR" : data.currency)}</TableCell><TableCell className="text-right font-mono">{(impact.expectedSecurityQuantity ?? 0).toLocaleString()}</TableCell><TableCell className="text-xs">{impact.securityMovement}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
            </TabsContent>

            <TabsContent value="elections" className="m-0 space-y-4">
              {data.processingType === "Mandatory" ? <Card><CardHeader><CardTitle>No election required</CardTitle><CardDescription>This is a mandatory event. The controlled workflow moves from validated calculation to instruction or settlement without an investor choice.</CardDescription></CardHeader></Card> : <>
                <Card><CardHeader><CardTitle>Election management</CardTitle><CardDescription>Quantities cannot exceed the calculated entitlement. The analyst prepares; an independent reviewer must approve.</CardDescription></CardHeader></Card>
                {data.impacts.map((impact: any) => <Card key={impact.id}><CardContent className="grid gap-4 p-5 md:grid-cols-[1fr,1fr,1fr,auto]"><div><div className="font-medium">{impact.fund}</div><div className="text-xs text-slate-500">{impact.account} · eligible entitlement {Number(impact.entitlement ?? impact.eligibleQuantity).toLocaleString()}</div>{impact.electionDecision && <Badge className="mt-2" variant="secondary">{impact.electionDecision.optionLabel} · {impact.electionDecision.quantityElected.toLocaleString()} · {impact.approval}</Badge>}</div><Select disabled={!isAnalyst || Boolean(impact.electionDecision)} value={electionOptions[impact.id] ?? impact.election ?? ""} onValueChange={(value) => setElectionOptions((existing) => ({ ...existing, [impact.id]: value }))}><SelectTrigger><SelectValue placeholder="Select option" /></SelectTrigger><SelectContent>{data.options.map((option: any) => <SelectItem key={option.id} value={option.id}>{option.label}{option.default ? " (Default)" : ""}</SelectItem>)}</SelectContent></Select><div className="space-y-2"><Input disabled={!isAnalyst || Boolean(impact.electionDecision)} type="number" min="0" max={impact.entitlement ?? impact.eligibleQuantity} placeholder="Quantity elected" value={electionQuantities[impact.id] ?? ""} onChange={(change) => setElectionQuantities((existing) => ({ ...existing, [impact.id]: change.target.value }))} /><Input disabled={!isAnalyst || Boolean(impact.electionDecision)} placeholder="Comment / decision source" value={electionComments[impact.id] ?? ""} onChange={(change) => setElectionComments((existing) => ({ ...existing, [impact.id]: change.target.value }))} /></div>{isAnalyst && !impact.electionDecision && <Button onClick={() => saveAnElection(impact)} disabled={saveElection.isPending}>Submit</Button>}</CardContent></Card>)}
                {data.status === "Awaiting approval" && <Card className="border-primary/30"><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" />Maker-checker control</CardTitle><CardDescription>Only a Reviewer who did not prepare the election can approve it.</CardDescription></CardHeader><CardContent className="flex gap-3">{isReviewer ? <><Button onClick={() => approve(true)} disabled={approveEvent.isPending}><ShieldCheck className="mr-2 h-4 w-4" />Approve election</Button><Button variant="outline" onClick={() => approve(false)} disabled={approveEvent.isPending}>Return to analyst</Button></> : <Badge variant="warning">Switch to Daniel Reed · Reviewer to approve.</Badge>}</CardContent></Card>}
              </>}
            </TabsContent>

            <TabsContent value="tasks" className="m-0 space-y-4"><Card><CardHeader><CardTitle>Operational checklist</CardTitle><CardDescription>Tasks are generated from the event type and the control rules; dependencies explain what must complete first.</CardDescription></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Owner</TableHead><TableHead>Due</TableHead><TableHead>Dependency</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{data.tasks.map((current: any) => <TableRow key={current.id}><TableCell><div className="font-medium">{current.title}</div><div className="text-xs text-slate-500">{current.detail}</div></TableCell><TableCell>{current.owner}</TableCell><TableCell>{current.due}</TableCell><TableCell className="text-xs">{current.dependency || "—"}</TableCell><TableCell><Badge variant={current.status === "Resolved" ? "secondary" : "warning"}>{current.status}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

            <TabsContent value="instruction" className="m-0 space-y-4"><Card><CardHeader><CardTitle>Simulated instruction</CardTitle><CardDescription>External connectivity is disabled. The only actionable status is SIMULATED — NOT SENT.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 rounded border bg-slate-50 p-4 text-sm md:grid-cols-3"><div><span className="text-xs uppercase text-slate-400">Status</span><br /><Badge variant={data.instruction.simulated ? "secondary" : "outline"}>{data.instruction.status}</Badge></div><div><span className="text-xs uppercase text-slate-400">Destination</span><br />{data.instruction.destination}</div><div><span className="text-xs uppercase text-slate-400">Reference</span><br />{data.instruction.reference}</div></div><pre className="whitespace-pre-wrap rounded border bg-slate-950 p-4 text-xs leading-5 text-slate-100">{data.instruction.content}</pre>{isAnalyst && data.status === "Approved" && <Button onClick={simulate} disabled={updateInstruction.isPending}><Send className="mr-2 h-4 w-4" />Create simulated instruction</Button>}{data.status !== "Approved" && !data.instruction.simulated && <p className="text-sm text-amber-700">Instruction remains blocked until calculation, election (when required), and independent approval are complete.</p>}</CardContent></Card></TabsContent>

            <TabsContent value="reconciliation" className="m-0 space-y-4"><div className="grid gap-4 md:grid-cols-4"><Card><CardHeader className="pb-2"><CardDescription>Expected cash</CardDescription><CardTitle className="text-lg">{money(data.reconciliation.expectedCash ?? data.reconciliation.expected, data.reconciliation.expectedCurrency ?? data.currency)}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Expected securities</CardDescription><CardTitle className="text-lg">{Number(data.reconciliation.expectedSecurityQuantity ?? 0).toLocaleString()}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Actual cash</CardDescription><CardTitle className="text-lg">{money(data.reconciliation.actualCash ?? data.reconciliation.actual, data.reconciliation.actualCurrency ?? data.currency)}</CardTitle></CardHeader></Card><Card className={data.reconciliation.classification === "Matched" ? "" : "border-amber-300 bg-amber-50/40"}><CardHeader className="pb-2"><CardDescription>Classification</CardDescription><CardTitle className="text-lg">{data.reconciliation.classification}</CardTitle></CardHeader></Card></div><Card><CardHeader><CardTitle>Record synthetic settlement</CardTitle><CardDescription>Compare cash, securities, currency, date, and account. Any difference creates an investigation task.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Actual cash</Label><Input type="number" value={actual} placeholder={String(data.reconciliation.actualCash ?? 0)} onChange={(change) => setActual(change.target.value)} /></div><div className="space-y-2"><Label>Actual security quantity</Label><Input type="number" value={actualSecurity} placeholder={String(data.reconciliation.actualSecurityQuantity ?? 0)} onChange={(change) => setActualSecurity(change.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label>Reconciliation note</Label><Textarea value={reconNote} onChange={(change) => setReconNote(change.target.value)} placeholder="Describe the synthetic custodian result; the system will classify, not infer a cause." /></div><div className="md:col-span-2">{(isAnalyst || actor.role === "Operations Manager") && <Button onClick={reconcile} disabled={saveReconciliation.isPending}>Record and classify settlement</Button>}</div></CardContent></Card>{data.reconciliation.investigationSteps?.length > 0 && <Card className="border-amber-300"><CardHeader><CardTitle className="text-base">Suggested investigation steps</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{data.reconciliation.investigationSteps.map((step: string) => <li key={step}>{step}</li>)}</ul></CardContent></Card>}</TabsContent>

            <TabsContent value="audit" className="m-0 space-y-3"><Card><CardHeader><CardTitle>Append-only audit history</CardTitle><CardDescription>Every extraction, correction, calculation, election, approval, instruction, reconciliation, and task action is retained.</CardDescription></CardHeader></Card>{data.audit.map((entry: any) => <Card key={entry.id}><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr,2fr,auto]"><div><div className="font-medium">{entry.action}</div><div className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString("en-GB")} · {entry.actor}</div></div><div className="text-sm text-slate-600">{entry.detail}{entry.previousValue && <div className="mt-1 text-xs"><span className="text-slate-400">Before:</span> {entry.previousValue} <span className="ml-2 text-slate-400">After:</span> {entry.newValue}</div>}{entry.reason && <div className="mt-1 text-xs text-slate-500">Reason: {entry.reason}</div>}</div><Badge variant="outline">{entry.workflowStatus}</Badge></CardContent></Card>)}</TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}