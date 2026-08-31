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
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  LockKeyhole,
  Play,
  Send,
  ShieldCheck,
  Circle,
  CircleDot,
  FileSearch,
  Users,
  Calculator,
  ThumbsUp,
  Banknote,
  ListChecks,
  Activity
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getDemoRole } from "@/lib/demo-role";
import { getCaseStages, getPriorityReason } from "@/lib/case-journey";

const money = (amount: number, currency: string) => currency === "Shares"
  ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(amount)} shares`
  : new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

const demoPdfPath = `${import.meta.env.BASE_URL}demo-notices/rights-issue-notice.pdf`;

const VIEWS = [
  { id: "tasks", label: "Tasks & Controls", icon: ListChecks },
  { id: "audit", label: "Audit Trail", icon: Activity }
];

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

  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  
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
  const isCashDividend = data.eventType === "Cash dividend";
  const missingTerms = data.validation?.missingTerms ?? [];
  const canCalculate = data.validation?.isReady && isAnalyst;

  // Determine active flow stage
  const getRecommendedStage = () => {
    if (data.status === "Received" || data.status === "Under review" || data.status === "Validated") {
      if (missingTerms.length > 0) return "validate";
      if (data.status === "Validated") return "impact";
      if (data.impacts.length === 0) return "impact";
    }
    if (data.status === "Election required") return "decision";
    if (data.status === "Awaiting approval") return "decision";
    
    // For Mandatory events, execution might be the next direct step or settlement
    if (data.processingType === "Mandatory" && data.impacts.length > 0 && missingTerms.length === 0) {
      if (data.status === "Awaiting settlement" || data.status === "Break identified" || data.status === "Reconciled" || data.status === "Closed") return "reconcile";
      if (data.status === "Approved" && !data.instruction.simulated) return "execute";
      return "execute"; 
    }

    if (data.status === "Approved" && !data.instruction.simulated) return "execute";
    if (data.status === "Awaiting settlement" || data.status === "Break identified" || data.status === "Reconciled" || data.status === "Closed") return "reconcile";
    
    return "notice";
  };

  const recommendedStage = getRecommendedStage();
  const currentStageId = activeStageId || recommendedStage;

  const updateTerm = (term: any) => {
    const nextValue = values[term.key] ?? term.value;
    const changed = nextValue !== term.value;
    updateEvent.mutate({
      eventId,
      data: {
        terms: [{ key: term.key, value: nextValue, reason: changed ? reasons[term.key] ?? "" : undefined }],
        reason: changed ? reasons[term.key] ?? "" : "",
      },
    }, {
      onSuccess: () => { toast({ title: changed ? "Term corrected" : "Term validated" }); setValues((current) => ({ ...current, [term.key]: nextValue })); setActiveStageId(null); refresh(); },
      onError: (error) => mutateError("Term update blocked", error),
    });
  };

  const runCalculation = () => calculateEvent.mutate({ eventId, data: {} }, {
    onSuccess: () => { toast({ title: "Deterministic impacts calculated" }); setActiveStageId(null); refresh(); },
    onError: (error) => mutateError("Calculation blocked", error),
  });

  const saveAnElection = (impact: any) => {
    const optionId = electionOptions[impact.id];
    const quantityElected = Number(electionQuantities[impact.id] ?? "");
    if (!optionId || Number.isNaN(quantityElected)) {
      toast({ title: "Election details needed", description: "Select an option and enter a valid quantity.", variant: "destructive" });
      return;
    }
    saveElection.mutate({ eventId, data: { impactId: impact.id, optionId, quantityElected, comment: electionComments[impact.id] ?? "" } }, {
      onSuccess: () => { toast({ title: "Election submitted for approval" }); refresh(); },
      onError: (error) => mutateError("Election blocked", error),
    });
  };

  const approve = (approved: boolean) => approveEvent.mutate({ eventId, data: { approved, note: approved ? "Independent reviewer approval recorded." : "Returned for analyst review." } }, {
    onSuccess: () => { toast({ title: approved ? "Checker approval recorded" : "Event returned" }); refresh(); },
    onError: (error) => mutateError("Approval blocked", error),
  });

  const simulate = () => updateInstruction.mutate({ eventId, data: { status: "SIMULATED - NOT SENT" } }, {
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
    } }, {
      onSuccess: () => { toast({ title: "Settlement reconciled" }); refresh(); },
      onError: (error) => mutateError("Reconciliation blocked", error),
    });
  };

  // Next Action Logic
  let nextAction = { title: "Up to date", desc: "No immediate action required.", action: <span /> };
  if (data.status === "Received" || data.status === "Under review" || data.status === "Validated") {
    if (missingTerms.length > 0) {
      nextAction = { title: "Validate Terms", desc: `${missingTerms.length} terms require analyst review before calculation.`, action: <Button className="w-full" onClick={() => setActiveStageId("validate")}>Review Terms</Button> };
    } else {
      nextAction = { title: "Ready for Calculation", desc: "All terms validated. Run deterministic impact calculation.", action: <Button className="w-full" onClick={runCalculation} disabled={!canCalculate || calculateEvent.isPending}><Play className="mr-2 h-4 w-4" />Calculate Impacts</Button> };
    }
  } else if (data.status === "Election required") {
    nextAction = { title: "Submit Elections", desc: "Process client instructions and submit for approval.", action: <Button className="w-full" onClick={() => setActiveStageId("decision")}>Go to Elections</Button> };
  } else if (data.status === "Awaiting approval") {
    nextAction = { title: "Independent Review Required", desc: "Maker-checker control requires Reviewer approval.", action: isReviewer ? <div className="flex gap-2 w-full"><Button className="flex-1" onClick={() => approve(true)} disabled={approveEvent.isPending}><ShieldCheck className="mr-2 h-4 w-4" />Approve</Button><Button className="flex-1" variant="outline" onClick={() => approve(false)} disabled={approveEvent.isPending}>Return</Button></div> : <Badge variant="warning" className="w-full justify-center py-1.5">Requires Reviewer Role</Badge> };
  } else if (data.status === "Approved" && !data.instruction?.simulated && data.processingType !== "Mandatory") {
    nextAction = { title: "Simulate Instruction", desc: "Generate outgoing simulated message.", action: <Button className="w-full" onClick={simulate} disabled={updateInstruction.isPending}><Send className="mr-2 h-4 w-4" />Simulate Instruction</Button> };
  } else if (data.status === "Awaiting settlement" || data.status === "Approved" || data.status === "Break identified") {
    nextAction = { title: "Reconcile Settlement", desc: "Compare actual cash/securities against expected.", action: <Button className="w-full" onClick={() => setActiveStageId("reconcile")}>Record Settlement</Button> };
  } else if (data.status === "Reconciled" || data.status === "Closed") {
    nextAction = { title: "Case Closed", desc: "All operational tasks are completed.", action: <Button className="w-full" variant="outline" disabled>Lifecycle Complete</Button> };
  }

  // Determine completed stages up to the recommended
  const caseStages = getCaseStages(data);

  const renderStageContent = () => {
    switch (currentStageId) {
      case "notice": {
        const sourcePreview = data.notice.previewUrl || (data.isHero ? demoPdfPath : "");
        return (
          <div className="space-y-4">
            <Card className="border-primary/20 bg-white">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4 text-primary" />
                      Uploaded source document
                    </CardTitle>
                    <CardDescription className="mt-1">
                      The PDF remains visible beside the extracted terms so every review decision can be checked against source evidence.
                    </CardDescription>
                  </div>
                  {sourcePreview && (
                    <a href={sourcePreview} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        Open PDF
                      </Button>
                    </a>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.6fr)]">
                <div className="overflow-hidden rounded border bg-slate-100">
                  {sourcePreview ? (
                    <iframe title="Original corporate action source" src={sourcePreview} className="h-[520px] w-full bg-white" />
                  ) : (
                    <div className="flex h-[520px] items-center justify-center text-sm text-slate-500 bg-white">
                      Document preview unavailable
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="rounded border bg-slate-50 p-4 text-sm">
                    <div className="flex items-center gap-2 font-medium text-slate-900">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Uploaded and linked
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Document</dt>
                        <dd className="text-right font-medium text-slate-700">{data.notice.documentName}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Source</dt>
                        <dd className="text-right font-medium text-slate-700">{data.notice.source}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">State</dt>
                        <dd className="text-right font-medium text-emerald-700">{data.notice.uploadState}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Pages</dt>
                        <dd className="text-right font-medium text-slate-700">{data.notice.pages?.length ?? 0}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded border border-primary/20 bg-primary/5 p-4 text-xs leading-5 text-primary">
                    <strong>Review rule</strong>
                    <br />
                    Terms are not trusted until the analyst validates them against the page evidence. Corrections require a reason and remain in the audit trail.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }
      
      case "validate":
        return (
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Source evidence and extracted terms</CardTitle>
                <CardDescription>Every value links to a source page. Manual corrections require a reason.</CardDescription>
              </CardHeader>
            </Card>
            {data.terms.map((current: any) => {
              const currentValue = values[current.key] ?? current.value;
              const changed = currentValue !== current.value;
              return (
                <Card key={current.key} className="bg-white">
                  <CardContent className="grid gap-4 p-5 md:grid-cols-[0.9fr,1.6fr]">
                    <div>
                      <div className="font-medium">{current.label}</div>
                      <div className="mt-1 text-xs text-slate-400">{current.key} · {Math.round(current.confidence * 100)}% confidence</div>
                      <Badge className="mt-3" variant={current.reviewStatus === "Validated" ? "secondary" : "warning"}>{current.reviewStatus}</Badge>
                    </div>
                    <div className="space-y-3">
                      <Input value={currentValue} disabled={!isAnalyst} onChange={(change) => setValues((existing) => ({ ...existing, [current.key]: change.target.value }))} />
                      <div className="rounded border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                        <strong>Evidence · {current.page}</strong>
                        <br />
                        “{current.evidence}”
                      </div>
                      {changed && <Input placeholder="Reason for manual correction (required)" value={reasons[current.key] ?? ""} onChange={(change) => setReasons((existing) => ({ ...existing, [current.key]: change.target.value }))} />}
                      {isAnalyst && <Button size="sm" disabled={updateEvent.isPending} onClick={() => updateTerm(current)}>{changed ? "Save correction" : "Validate term"}</Button>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );

      case "exposure":
        return (
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Affected positions and eligibility</CardTitle>
                <CardDescription>Matching uses the notice ISIN, record date, quantity, and account status. Excluded rows show why they were not used.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fund / account</TableHead>
                      <TableHead>ISIN</TableHead>
                      <TableHead>Position date</TableHead>
                      <TableHead className="text-right">Eligible quantity</TableHead>
                      <TableHead>Eligibility</TableHead>
                      <TableHead>Data quality</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.positions.map((position: any) => (
                      <TableRow key={position.id}>
                        <TableCell>
                          <div className="font-medium">{position.fund}</div>
                          <div className="text-xs text-slate-500">{position.account}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{position.isin}</TableCell>
                        <TableCell>{position.positionDate}</TableCell>
                        <TableCell className="text-right font-mono">{position.eligibleQuantity.toLocaleString()}</TableCell>
                        <TableCell><Badge variant={position.eligibilityStatus === "Eligible" ? "secondary" : "outline"}>{position.eligibilityStatus}</Badge></TableCell>
                        <TableCell className="text-xs text-amber-700">{position.dataQualityWarning || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );

      case "impact":
        return (
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Deterministic impact calculation</CardTitle>
                <CardDescription>{data.calculation.rounding} {data.calculation.assumptions}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Last run: {data.calculation.calculationRunAt ? new Date(data.calculation.calculationRunAt).toLocaleString("en-GB") : "Not run"}</span>
                {isAnalyst && <Button onClick={runCalculation} disabled={!canCalculate || calculateEvent.isPending}><Play className="mr-2 h-4 w-4" />{data.impacts.length ? "Re-run calculation" : "Calculate eligibility and impact"}</Button>}
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Fund / account</TableHead>
                      <TableHead className="text-right">Eligible qty</TableHead>
                      <TableHead>Formula</TableHead>
                      {isCashDividend ? (
                        <>
                          <TableHead className="text-right">Gross cash</TableHead>
                          <TableHead className="text-right">Withholding</TableHead>
                          <TableHead className="text-right">Net cash</TableHead>
                        </>
                      ) : (
                        <TableHead className="text-right">Expected cash</TableHead>
                      )}
                      <TableHead className="text-right">Expected securities</TableHead>
                      <TableHead>Assumption</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.impacts.length === 0 ? (
                      <TableRow><TableCell colSpan={isCashDividend ? 8 : 6} className="h-24 text-center text-slate-500">Validate required terms, then run calculation to produce impacts.</TableCell></TableRow>
                    ) : data.impacts.map((impact: any) => (
                      <TableRow key={impact.id}>
                        <TableCell>
                          <div className="font-medium">{impact.fund}</div>
                          <div className="text-xs text-slate-500">{impact.account}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{impact.eligibleQuantity.toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-xs">{impact.formula}</TableCell>
                        {isCashDividend ? (
                          <>
                            <TableCell className="text-right font-mono">{money(impact.grossCash ?? 0, data.currency)}</TableCell>
                            <TableCell className="text-right font-mono">
                              <div>{money(impact.withholdingAmount ?? 0, data.currency)}</div>
                              <div className="text-xs text-slate-500">{Number((impact.withholdingRate ?? 0) * 100).toLocaleString("en-GB", { maximumFractionDigits: 4 })}%</div>
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">{money(impact.netCash ?? impact.expectedCash ?? 0, data.currency)}</TableCell>
                          </>
                        ) : (
                          <TableCell className="text-right font-mono">{money(impact.expectedCash ?? 0, data.currency === "Shares" ? "EUR" : data.currency)}</TableCell>
                        )}
                        <TableCell className="text-right font-mono">{(impact.expectedSecurityQuantity ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{impact.securityMovement}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );

      case "decision":
        if (data.processingType === "Mandatory") {
          return (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Decision Not Required</CardTitle>
                <CardDescription>
                  This is a mandatory event. No investor election or separate instruction is required; the workflow proceeds to settlement monitoring after the impact is confirmed.
                </CardDescription>
              </CardHeader>
            </Card>
          );
        }
        return (
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Election management</CardTitle>
                <CardDescription>Quantities cannot exceed the calculated entitlement. The analyst prepares; an independent reviewer must approve.</CardDescription>
              </CardHeader>
            </Card>
            {data.impacts.map((impact: any) => (
              <Card key={impact.id} className="bg-white">
                <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr,1fr,1fr,auto]">
                  <div>
                    <div className="font-medium">{impact.fund}</div>
                    <div className="text-xs text-slate-500">{impact.account} · eligible entitlement {Number(impact.entitlement ?? impact.eligibleQuantity).toLocaleString()}</div>
                    {impact.electionDecision && <Badge className="mt-2" variant="secondary">{impact.electionDecision.optionLabel} · {impact.electionDecision.quantityElected.toLocaleString()} · {impact.approval}</Badge>}
                  </div>
                  <Select disabled={!isAnalyst || Boolean(impact.electionDecision)} value={electionOptions[impact.id] ?? impact.election ?? ""} onValueChange={(value) => setElectionOptions((existing) => ({ ...existing, [impact.id]: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select option" /></SelectTrigger>
                    <SelectContent>
                      {data.options.map((option: any) => <SelectItem key={option.id} value={option.id}>{option.label}{option.default ? " (Default)" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="space-y-2">
                    <Input disabled={!isAnalyst || Boolean(impact.electionDecision)} type="number" min="0" max={impact.entitlement ?? impact.eligibleQuantity} placeholder="Quantity elected" value={electionQuantities[impact.id] ?? ""} onChange={(change) => setElectionQuantities((existing) => ({ ...existing, [impact.id]: change.target.value }))} />
                    <Input disabled={!isAnalyst || Boolean(impact.electionDecision)} placeholder="Comment / decision source" value={electionComments[impact.id] ?? ""} onChange={(change) => setElectionComments((existing) => ({ ...existing, [impact.id]: change.target.value }))} />
                  </div>
                  {isAnalyst && !impact.electionDecision && <Button onClick={() => saveAnElection(impact)} disabled={saveElection.isPending}>Submit</Button>}
                </CardContent>
              </Card>
            ))}
            {data.status === "Awaiting approval" && (
              <Card className="border-primary bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" />Maker-checker control</CardTitle>
                  <CardDescription>Only a Reviewer who did not prepare the election can approve it.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-3">
                  {isReviewer ? (
                    <>
                      <Button onClick={() => approve(true)} disabled={approveEvent.isPending}><ShieldCheck className="mr-2 h-4 w-4" />Approve election</Button>
                      <Button variant="outline" onClick={() => approve(false)} disabled={approveEvent.isPending}>Return to analyst</Button>
                    </>
                  ) : (
                    <Badge variant="warning" className="text-sm py-1.5 px-4">Switch to Reviewer Role to approve.</Badge>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        );

      case "execute":
        if (data.processingType === "Mandatory") {
          return (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Execution Not Required</CardTitle>
                <CardDescription>This mandatory event does not require an election or outbound instruction. Monitor the expected settlement in the final stage.</CardDescription>
              </CardHeader>
            </Card>
          );
        }
        return (
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Simulated instruction</CardTitle>
                <CardDescription>External connectivity is disabled. The only actionable status is SIMULATED - NOT SENT.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 rounded border bg-slate-50 p-4 text-sm md:grid-cols-3">
                  <div><span className="text-xs uppercase text-slate-400">Status</span><br /><Badge variant={data.instruction.simulated ? "secondary" : "outline"}>{data.instruction.status}</Badge></div>
                  <div><span className="text-xs uppercase text-slate-400">Destination</span><br />{data.instruction.destination}</div>
                  <div><span className="text-xs uppercase text-slate-400">Reference</span><br />{data.instruction.reference}</div>
                </div>
                <pre className="whitespace-pre-wrap rounded border bg-slate-950 p-4 text-xs leading-5 text-slate-100">{data.instruction.content}</pre>
                
                {isAnalyst && data.status === "Approved" && <Button onClick={simulate} disabled={updateInstruction.isPending}><Send className="mr-2 h-4 w-4" />Create simulated instruction</Button>}
                {data.status !== "Approved" && !data.instruction.simulated && <p className="text-sm text-amber-700">Instruction remains blocked until calculation, election (when required), and independent approval are complete.</p>}
              </CardContent>
            </Card>
          </div>
        );

      case "reconcile":
        return (
          <div className="space-y-4">
            <div className={`grid gap-4 ${isCashDividend ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
              {isCashDividend && <Card className="bg-white"><CardHeader className="pb-2"><CardDescription>Expected gross cash</CardDescription><CardTitle className="text-lg">{money(data.reconciliation.expectedGrossCash ?? 0, data.reconciliation.expectedCurrency ?? data.currency)}</CardTitle></CardHeader></Card>}
              {isCashDividend && <Card className="bg-white"><CardHeader className="pb-2"><CardDescription>Expected withholding</CardDescription><CardTitle className="text-lg">{money(data.reconciliation.expectedWithholdingAmount ?? 0, data.reconciliation.expectedCurrency ?? data.currency)}</CardTitle></CardHeader></Card>}
              <Card className="bg-white"><CardHeader className="pb-2"><CardDescription>{isCashDividend ? "Expected net cash" : "Expected cash"}</CardDescription><CardTitle className="text-lg">{money(data.reconciliation.expectedCash ?? data.reconciliation.expected, data.reconciliation.expectedCurrency ?? data.currency)}</CardTitle></CardHeader></Card>
              <Card className="bg-white"><CardHeader className="pb-2"><CardDescription>Expected securities</CardDescription><CardTitle className="text-lg">{Number(data.reconciliation.expectedSecurityQuantity ?? 0).toLocaleString()}</CardTitle></CardHeader></Card>
              <Card className="bg-white"><CardHeader className="pb-2"><CardDescription>Actual cash</CardDescription><CardTitle className="text-lg">{money(data.reconciliation.actualCash ?? data.reconciliation.actual, data.reconciliation.actualCurrency ?? data.currency)}</CardTitle></CardHeader></Card>
              <Card className={data.reconciliation.classification === "Matched" ? "bg-white" : "border-rose-300 bg-rose-50/40"}>
                <CardHeader className="pb-2"><CardDescription>Classification</CardDescription><CardTitle className="text-lg text-slate-800">{data.reconciliation.classification}</CardTitle></CardHeader>
              </Card>
            </div>
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Record synthetic settlement</CardTitle>
                <CardDescription>Compare cash, securities, currency, date, and account. Any difference creates an investigation task.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Actual cash</Label><Input type="number" value={actual} placeholder={String(data.reconciliation.actualCash ?? 0)} onChange={(change) => setActual(change.target.value)} /></div>
                <div className="space-y-2"><Label>Actual security quantity</Label><Input type="number" value={actualSecurity} placeholder={String(data.reconciliation.actualSecurityQuantity ?? 0)} onChange={(change) => setActualSecurity(change.target.value)} /></div>
                <div className="space-y-2 md:col-span-2"><Label>Reconciliation note</Label><Textarea value={reconNote} onChange={(change) => setReconNote(change.target.value)} placeholder="Describe the synthetic custodian result; the system will classify, not infer a cause." /></div>
                <div className="md:col-span-2">{(isAnalyst || actor.role === "Operations Manager") && <Button onClick={reconcile} disabled={saveReconciliation.isPending}>Record and classify settlement</Button>}</div>
              </CardContent>
            </Card>
            {data.reconciliation.investigationSteps?.length > 0 && (
              <Card className="border-rose-300 bg-white">
                <CardHeader><CardTitle className="text-base text-rose-900">Suggested investigation steps</CardTitle></CardHeader>
                <CardContent><ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{data.reconciliation.investigationSteps.map((step: string) => <li key={step}>{step}</li>)}</ul></CardContent>
              </Card>
            )}
          </div>
        );

      case "tasks":
        return (
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Operational checklist</CardTitle>
                <CardDescription>Tasks are generated from the event type and the control rules; dependencies explain what must complete first.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Task</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Dependency</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.tasks.map((current: any, index: number) => (
                      <TableRow key={`${current.id}-${index}`}>
                        <TableCell>
                          <div className="font-medium">{current.title}</div>
                          <div className="text-xs text-slate-500">{current.detail}</div>
                        </TableCell>
                        <TableCell>{current.owner}</TableCell>
                        <TableCell>{current.due}</TableCell>
                        <TableCell className="text-xs">{current.dependency || "N/A"}</TableCell>
                        <TableCell><Badge variant={current.status === "Resolved" ? "secondary" : "warning"}>{current.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );

      case "audit":
        return (
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Audit Trail</CardTitle>
                <CardDescription>Append-only log of every state change, calculation, and manual intervention.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {(data.audit ?? []).map((entry: any) => (
                    <div key={entry.id} className="p-4 flex gap-4">
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Activity className="h-3 w-3" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">{entry.action}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{entry.actor} · {new Date(entry.timestamp).toLocaleString("en-GB")}</div>
                        {entry.detail && <div className="text-sm text-slate-700 mt-2">{entry.detail}</div>}
                      </div>
                    </div>
                  ))}
                  {(!data.audit || data.audit.length === 0) && (
                    <div className="p-8 text-center text-sm text-slate-500">No audit events recorded yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return <div>Select a stage</div>;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 border-b bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/events"><Button variant="ghost" size="icon" aria-label="Back to inbox"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-lg font-bold text-slate-800">{data.reference}</h1>
                <Badge variant={data.risk === "High" ? "destructive" : data.risk === "Medium" ? "warning" : "secondary"}>{data.risk} risk</Badge>
                <Badge variant="outline">{data.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">{data.eventType} · {data.processingType} · {data.security}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right text-xs">
              <div className="uppercase tracking-wide text-slate-400">Internal deadline</div>
              <div className="font-medium text-slate-700">{data.internalDeadline}</div>
            </div>
            <Badge variant="secondary" className="px-3 py-1 bg-slate-100">{actor.name} · {actor.role}</Badge>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col xl:flex-row overflow-hidden">
        {/* Conditional operational journey */}
        <aside className="w-full xl:w-64 border-b xl:border-b-0 xl:border-r bg-white shrink-0 overflow-x-auto xl:overflow-x-hidden overflow-y-auto flex xl:flex-col py-2 xl:py-6">
          <div className="hidden xl:block px-6 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Operational journey</div>
          <div className="hidden xl:block px-6 mb-4 text-xs text-slate-400">The current control point is selected automatically; open any stage to review its evidence.</div>
          <nav className="flex xl:flex-col px-2 xl:px-4 gap-1 min-w-max xl:min-w-0">
            {caseStages.map((stage) => {
              const isActive = currentStageId === stage.id;
              const stateClass = {
                completed: "text-emerald-700 hover:bg-emerald-50",
                current: "bg-primary text-primary-foreground",
                attention: "bg-amber-50 text-amber-900 hover:bg-amber-100",
                blocked: "bg-rose-50 text-rose-800 hover:bg-rose-100",
                "not-required": "text-slate-400 hover:bg-slate-50",
                future: "text-slate-400 hover:bg-slate-50",
              }[stage.state];
              
              return (
                <button
                  key={stage.id}
                  onClick={() => setActiveStageId(stage.id)}
                  title={`${stage.label}: ${stage.detail}`}
                  className={`flex items-center xl:w-full gap-3 px-3 xl:px-4 py-2.5 rounded-md text-left transition-colors ${isActive ? "bg-primary text-primary-foreground" : stateClass}`}
                >
                  <div className="shrink-0 flex items-center justify-center">
                    {stage.state === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : stage.state === "attention" || stage.state === "blocked" ? (
                      <AlertTriangle className={`h-4 w-4 ${isActive ? "text-primary-foreground/80" : stage.state === "blocked" ? "text-rose-600" : "text-amber-600"}`} />
                    ) : isActive ? (
                      <CircleDot className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  <span className="text-sm font-medium hidden sm:block xl:block">
                    <span>{stage.label}</span>
                    {stage.state === "not-required" && <span className="ml-1 text-[10px] font-normal opacity-70">Not required</span>}
                  </span>
                  <span className="text-sm font-medium sm:hidden block">
                    {stage.label.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="hidden xl:block px-6 mt-8 mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Case Views</div>
          <nav className="flex xl:flex-col px-2 xl:px-4 gap-1 min-w-max xl:min-w-0 border-l ml-2 xl:border-l-0 xl:ml-0 pl-2 xl:pl-4">
            {VIEWS.map(view => {
              const isActive = currentStageId === view.id;
              const Icon = view.icon;
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveStageId(view.id)}
                  className={`flex items-center xl:w-full gap-3 px-3 xl:px-4 py-2 rounded-md text-left transition-colors ${
                    isActive ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white/80" : "text-slate-400"}`} />
                  <span className="text-sm font-medium hidden sm:block xl:block">{view.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Sidebar: Control Panel (Appears at top on mobile) */}
        <aside className="w-full xl:w-80 border-b xl:border-b-0 xl:border-l bg-slate-50/80 p-4 shrink-0 overflow-y-auto order-2 xl:order-3">
          <div className="space-y-6">
            <Card className="border-primary bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary">Next action</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{nextAction.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">{nextAction.desc}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3 text-xs">
                  <div><p className="uppercase tracking-wide text-slate-400">Owner</p><p className="mt-1 font-medium text-slate-700">{data.tasks?.find((task: any) => task.status === "Open")?.owner ?? actor.role}</p></div>
                  <div><p className="uppercase tracking-wide text-slate-400">Due</p><p className="mt-1 font-medium text-slate-700">{data.tasks?.find((task: any) => task.status === "Open")?.due ?? data.internalDeadline}</p></div>
                  <div className="col-span-2 border-t pt-2"><p className="uppercase tracking-wide text-slate-400">Blocking reason</p><p className="mt-1 font-medium text-slate-700">{getPriorityReason(data)}</p></div>
                </div>
                <div>
                  {nextAction.action}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-transparent">
              <CardHeader className="px-0 pt-0 pb-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">Event Profile</CardTitle>
              </CardHeader>
              <CardContent className="px-0 space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Event Type</p>
                  <p className="text-sm font-medium text-slate-800">{data.eventType}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Processing Type</p>
                  <p className="text-sm font-medium text-slate-800">{data.processingType}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Impact Scope</p>
                  <p className="text-sm font-medium text-slate-800">{data.impacts?.length || 0} accounts affected</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 order-3 xl:order-2">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6 flex items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-800">
                {caseStages.find(s => s.id === currentStageId)?.label || VIEWS.find(v => v.id === currentStageId)?.label}
              </h2>
            </div>
            {renderStageContent()}
          </div>
        </main>
      </div>
    </div>
  );
}