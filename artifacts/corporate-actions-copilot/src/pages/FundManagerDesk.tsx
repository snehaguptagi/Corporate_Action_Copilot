import { useEffect, useMemo, useState } from "react";
import {
  getGetEventQueryKey,
  useApproveEvent,
  useGetEvent,
  useGetSession,
  useSaveElection,
  useUpdateEvent,
  useUpdateInstruction,
  useSaveReconciliation,
  type EventDetail,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
  AlertTriangle,
  ArrowDownRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Gauge,
  IndianRupee,
  Landmark,
  Scale,
  ShieldCheck,
  WalletCards,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function rupees(value: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function crore(value: number) {
  return `₹${decimal.format(value)} cr`;
}

function SectionHeading({ index, eyebrow, title, description }: { index: string; eyebrow: string; title: string; description: string; }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#dc6900] text-xs font-bold text-white">{index}</div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#dc6900]">{eyebrow}</div>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-[#5b1235]">{title}</h2>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function FundManagerDesk() {
  const { eventId = "" } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: event, isLoading, isError } = useGetEvent(eventId);
  const { data: actor } = useGetSession();

  const [electionOptions, setElectionOptions] = useState<Record<string, string>>({});
  const [electionQuantities, setElectionQuantities] = useState<Record<string, string>>({});

  const saveElection = useSaveElection({
    mutation: { onSuccess: () => { toast({ title: "Election submitted" }); queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }); } }
  });
  const updateEvent = useUpdateEvent({
    mutation: { onSuccess: () => { toast({ title: "Term validated" }); queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }); } }
  });
  const updateInstruction = useUpdateInstruction({
    mutation: { onSuccess: () => { toast({ title: "Instruction simulated" }); queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }); } }
  });
  const saveReconciliation = useSaveReconciliation({
    mutation: { onSuccess: () => { toast({ title: "Settlement reconciled" }); queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }); } }
  });
  const approveEvent = useApproveEvent({
    mutation: { onSuccess: () => { toast({ title: "Checker approval recorded" }); queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }); } }
  });

  const [termValues, setTermValues] = useState<Record<string, string>>({});
  const [reconActual, setReconActual] = useState("");

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading event...</div>;
  }
  if (isError || !event) {
    return <div className="flex flex-1 items-center justify-center text-sm text-destructive">The event could not be loaded.</div>;
  }

  const data = event as EventDetail;
  const isFundManager = actor?.role === "Fund Manager";
  const isAnalyst = actor?.role === "Operations Analyst";
  const isReviewer = actor?.role === "Reviewer";
  const isManager = actor?.role === "Operations Manager";

  const isMandatory = data.processingType === "Mandatory" || ["Cash dividend", "Stock split", "Bonus issue"].includes(data.eventType);
  const affectedSchemes = (data.schemeImpacts ?? []).filter((impact) => impact.affected);

  const constraints = affectedSchemes.filter(s => s.flag === "SEBI 10% headroom" || s.flag === "Cash short");

  const saveAnElection = (impact: any) => {
    const optionId = electionOptions[impact.id] ?? data.options.find(o => o.default)?.id;
    const rawQty = electionQuantities[impact.id] ?? String(impact.quantityResult ?? impact.eligibleQuantity ?? 0);
    const quantityElected = Number(rawQty);
    if (!optionId || !Number.isFinite(quantityElected) || quantityElected < 0) {
      toast({ title: "Invalid election", variant: "destructive" });
      return;
    }
    saveElection.mutate({ eventId, data: { impactId: impact.id, optionId, quantityElected, comment: "Submitted from workspace." } });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f7f5f2]">
      <div className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 border-b border-[#d8d1cb] pb-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#dc6900]">
                <Landmark className="h-3.5 w-3.5" />
                Arka Mutual Fund
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#5b1235] sm:text-3xl">{data.issuer} {data.eventType.toLowerCase()}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5b1235] font-medium">
                Status: {data.status} · {affectedSchemes.length} affected scheme{affectedSchemes.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-[#e5a15f] bg-[#fff8ef] text-[#9d4d00]">India · {data.currency} only</Badge>
              <Badge variant="outline">{data.reference}</Badge>
            </div>
          </div>
        </header>

        <div className="space-y-8">
          <section>
            <SectionHeading index="01" eyebrow="Confirmed event" title="What it is" description="Notice terms, calendar, and security details extracted from the source document." />
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <Card className="rounded-md border-[#d8d1cb] shadow-none bg-white">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base text-[#5b1235]">{data.issuer}</CardTitle>
                      <CardDescription>{data.eventType} · {data.securityMaster?.market ?? "Exchange"}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                    <Detail label="Ordinary ISIN" value={data.securityMaster?.isin ?? "N/A"} mono />
                    <Detail label="Ticker" value={data.securityMaster?.ticker ?? "N/A"} />
                    <Detail label="Currency" value={data.currency} />
                    <Detail label="Amount" value={data.amount ? crore(data.amount / 10000000) : "N/A"} />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-md border-[#d8d1cb] shadow-none bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-[#5b1235]"><CalendarDays className="h-4 w-4 text-[#dc6900]" /> Calendar</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs sm:grid-cols-3">
                  <CalendarItem label="Notice received" value={new Date(data.receivedAt).toLocaleDateString("en-GB")} />
                  <CalendarItem label="Market deadline" value={data.marketDeadline ? new Date(data.marketDeadline).toLocaleDateString("en-GB") : "N/A"} emphasis />
                  <CalendarItem label="Internal deadline" value={data.internalDeadline ? new Date(data.internalDeadline).toLocaleDateString("en-GB") : "N/A"} />
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <SectionHeading index="02" eyebrow="Scheme impact" title="What it touches" description="Affected schemes and expected financial impacts." />
            <Card className="rounded-md border-[#d8d1cb] shadow-none bg-white">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#f1eeea] hover:bg-[#f1eeea]">
                      <TableHead>Scheme</TableHead>
                      <TableHead className="text-right">Eligible Quantity</TableHead>
                      <TableHead className="text-right">Expected Cash</TableHead>
                      <TableHead>Direction</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {affectedSchemes.map((scheme) => (
                      <TableRow key={scheme.id} className="text-xs">
                        <TableCell className="font-semibold text-[#5b1235]">{scheme.schemeName}</TableCell>
                        <TableCell className="text-right font-mono">{integer.format(scheme.eligibleQuantity)}</TableCell>
                        <TableCell className="text-right font-mono">{scheme.cashAmount ? crore(scheme.cashAmount / 10000000) : "-"}</TableCell>
                        <TableCell>{scheme.direction}</TableCell>
                      </TableRow>
                    ))}
                    {affectedSchemes.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No affected schemes.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          {!isMandatory && (
            <>
              {data.options && data.options.length > 0 && (
                <section>
                  <SectionHeading index="03" eyebrow="Elections" title="Options" description="Available choices provided by the issuer." />
                  <Card className="rounded-md border-[#d8d1cb] shadow-none bg-white">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[#f1eeea] hover:bg-[#f1eeea]">
                            <TableHead>Label</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Funding Formula</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.options.map((opt) => (
                            <TableRow key={opt.id} className="text-xs">
                              <TableCell className="font-semibold text-[#5b1235]">{opt.label} {opt.default && <Badge variant="secondary" className="ml-2">Default</Badge>}</TableCell>
                              <TableCell>{opt.description}</TableCell>
                              <TableCell className="font-mono">{opt.fundingFormula || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </section>
              )}

              {constraints.length > 0 && (
                <section>
                  <SectionHeading index="04" eyebrow="Limits" title="Constraints" description="Headroom and liquidity limits that block full exercise." />
                  <Card className="rounded-md border-[#d8d1cb] shadow-none bg-[#fffaf4]">
                    <CardContent className="p-4 space-y-2">
                      {constraints.map(c => (
                        <div key={c.id} className="flex items-center gap-2 text-xs text-destructive font-medium">
                          <AlertTriangle className="h-4 w-4" /> {c.schemeName}: {c.flag}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </section>
              )}

              <section>
                <SectionHeading index="05" eyebrow="Your decision" title="Decision" description="Set scheme elections and submit for checker approval." />
                <div className="space-y-4">
                  {affectedSchemes.map((impact: any) => (
                    <Card key={impact.id} className="rounded-md border-[#d8d1cb] shadow-none bg-white">
                      <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr,1.5fr,auto] items-center">
                        <div>
                          <div className="font-semibold text-[#5b1235] text-sm">{impact.schemeName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Entitlement: {integer.format(impact.quantityResult ?? impact.eligibleQuantity)}</div>
                          {impact.electionDecision && <Badge className="mt-2" variant="outline">{impact.electionDecision.optionLabel} · {impact.electionDecision.quantityElected} · {impact.approval}</Badge>}
                        </div>
                        <div className="flex gap-2 items-center">
                          <Select disabled={Boolean(impact.electionDecision)} value={electionOptions[impact.id] ?? (data.options.find((o:any)=>o.default)?.id || "")} onValueChange={(val) => setElectionOptions(prev => ({...prev, [impact.id]: val}))}>
                            <SelectTrigger className="w-[180px] text-xs"><SelectValue placeholder="Option" /></SelectTrigger>
                            <SelectContent>
                              {data.options.map((opt:any) => <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input
                            className="w-[120px] text-xs"
                            type="number"
                            disabled={Boolean(impact.electionDecision)}
                            value={electionQuantities[impact.id] ?? (impact.quantityResult ?? impact.eligibleQuantity)}
                            onChange={(e) => setElectionQuantities(prev => ({...prev, [impact.id]: e.target.value}))}
                          />
                        </div>
                        <div>
                          {!impact.electionDecision && (
                            <Button className="bg-[#dc6900] hover:bg-[#b85700]" onClick={() => saveAnElection(impact)} disabled={saveElection.isPending}>
                              Submit Election
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {data.status === "Awaiting approval" && (
                    <Card className="rounded-md border-[#d8d1cb] shadow-none bg-white">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base text-[#5b1235]"><ShieldCheck className="h-4 w-4 text-[#dc6900]" /> Maker-checker control</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isReviewer ? (
                           <div className="flex gap-2">
                             <Button onClick={() => approveEvent.mutate({ eventId, data: { approved: true, note: "Approved." }})} disabled={approveEvent.isPending}>Approve elections</Button>
                             <Button variant="outline" onClick={() => approveEvent.mutate({ eventId, data: { approved: false, note: "Returned." }})} disabled={approveEvent.isPending}>Return</Button>
                           </div>
                        ) : (
                           <p className="text-xs text-muted-foreground">Only a Reviewer can approve these elections.</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </section>
            </>
          )}

          <section>
            <SectionHeading index={isMandatory ? "03" : "06"} eyebrow="Audit" title="History" description="Immutable ledger of workflow actions." />
            <Card className="rounded-md border-[#d8d1cb] shadow-none bg-white">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#f1eeea] hover:bg-[#f1eeea]">
                      <TableHead>Time</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.audit ?? []).map((entry: any) => (
                      <TableRow key={entry.id} className="text-xs">
                        <TableCell>{new Date(entry.timestamp).toLocaleString("en-GB")}</TableCell>
                        <TableCell>{entry.actor}</TableCell>
                        <TableCell>{entry.action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          {(isAnalyst || isReviewer || isManager) && (
            <details className="mt-8 rounded-md border border-[#d8d1cb] bg-[#faf8f5]">
              <summary className="cursor-pointer p-4 font-semibold text-[#5b1235] outline-none">Operations detail</summary>
              <div className="p-4 pt-0 space-y-6">
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-[#5b1235]">Extracted Terms Validation</h3>
                  <div className="grid gap-3">
                    {data.terms?.map((term: any) => (
                      <div key={term.key} className="flex items-center gap-4 text-xs bg-white p-3 border border-[#d8d1cb] rounded">
                        <div className="w-[200px] font-medium">{term.label}</div>
                        <Input className="w-[200px] h-8 text-xs" value={termValues[term.key] ?? term.value} onChange={e => setTermValues(prev => ({...prev, [term.key]: e.target.value}))} />
                        <Badge variant="outline">{term.reviewStatus}</Badge>
                        <Button size="sm" variant="outline" className="h-8 ml-auto" onClick={() => updateEvent.mutate({ eventId, data: { terms: [{ key: term.key, value: termValues[term.key] ?? term.value }] }})}>Validate</Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator className="bg-[#d8d1cb]" />

                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-[#5b1235]">Simulate Instruction</h3>
                  <div className="text-xs text-muted-foreground mb-2">Simulate an outbound instruction message to the custodian.</div>
                  <Button size="sm" onClick={() => updateInstruction.mutate({ eventId, data: { status: "SIMULATED - NOT SENT" }})} disabled={updateInstruction.isPending || data.status !== "Approved"}>
                    Simulate Instruction
                  </Button>
                </div>

                <Separator className="bg-[#d8d1cb]" />

                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-[#5b1235]">Settlement Reconciliation</h3>
                  <div className="flex items-center gap-4 text-xs">
                    <Input className="w-[200px] h-8 text-xs" placeholder="Actual cash received" value={reconActual} onChange={e => setReconActual(e.target.value)} />
                    <Button size="sm" onClick={() => saveReconciliation.mutate({ eventId, data: { actual: Number(reconActual), note: "Reconciled from workspace." }})} disabled={saveReconciliation.isPending || !["Awaiting settlement", "Break identified"].includes(data.status)}>
                      Reconcile
                    </Button>
                  </div>
                </div>
              </div>
            </details>
          )}

        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 leading-5 text-[#322823] ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}

function CalendarItem({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={emphasis ? "rounded border border-[#edb57e] bg-[#fff8ef] p-2.5" : "p-2.5"}><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 font-mono leading-5 ${emphasis ? "font-semibold text-[#9d4d00]" : "text-[#322823]"}`}>{value}</div></div>;
}
