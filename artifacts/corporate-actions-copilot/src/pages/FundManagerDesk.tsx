import { useState } from "react";
import {
  getGetEventQueryKey,
  useGetEvent,
  useSaveElection,
  type EventDetail,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatIstDate } from "@/lib/date";

const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function crore(value: number) {
  return `₹${decimal.format(value)} cr`;
}

function SectionHeading({ index, eyebrow, title, description }: { index: string; eyebrow: string; title: string; description: string; }) {
  void eyebrow;
  void description;
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#dc6900] text-xs font-bold text-white">{index}</div>
      <h2 className="text-lg font-semibold tracking-tight text-[#5b1235]">{title}</h2>
    </div>
  );
}

function termValue(data: EventDetail, key: string) {
  return data.terms?.find((term) => term.key === key)?.value ?? "";
}

function actionStatement(data: EventDetail) {
  const quantity = data.schemeImpacts.filter((impact) => impact.affected).reduce((total, impact) => total + impact.eligibleQuantity, 0);
  const resultQuantity = data.schemeImpacts.filter((impact) => impact.affected).reduce((total, impact) => total + (impact.quantityResult ?? 0), 0);
  if (data.eventType === "Cash dividend") {
    return `${data.issuer} is paying ${termValue(data, "rate")} per share. Record date ${termValue(data, "recordDate")}. Nothing to decide.`;
  }
  if (data.eventType === "Stock split") {
    return `${data.issuer} is splitting each share into ${termValue(data, "splitRatio").replace(" for 1", "")}. Your ${integer.format(quantity)} shares become ${integer.format(resultQuantity)}. Nothing to decide.`;
  }
  if (data.eventType === "Bonus issue") {
    return `${data.issuer} is issuing ${termValue(data, "bonusRatio").replace(" for ", " bonus share for every ")} held. Nothing to decide.`;
  }
  if (data.eventType === "Tender offer") {
    return `${data.issuer} is buying back up to ${termValue(data, "maximumAcceptance")} at ${termValue(data, "offerPrice")}.`;
  }
  if (data.eventType === "Rights issue") {
    const discount = data.discountPercentage && data.referencePrice
      ? `, a ${data.discountPercentage.toFixed(1)}% discount to the ₹${integer.format(data.referencePrice)} close`
      : "";
    return `${data.issuer} is offering ${termValue(data, "rightsRatio").replace(" for ", " new share for every ")} you hold, at ${termValue(data, "subscriptionPrice")}${discount}.`;
  }
  if (data.eventType === "Merger / demerger") {
    return `${data.issuer} is merging under a scheme where you receive ${termValue(data, "shareExchangeRatio")} shares plus ${termValue(data, "cashRate")} per share.`;
  }
  return `${data.issuer} announced a ${data.eventType.toLowerCase()}.`;
}

function daysUntil(isoInstant: string) {
  const deadline = new Date(isoInstant).getTime();
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 86_400_000));
}

export default function FundManagerDesk() {
  const { eventId = "" } = useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: event, isLoading, isError } = useGetEvent(eventId);

  const [electionOptions, setElectionOptions] = useState<Record<string, string>>({});
  const [electionQuantities, setElectionQuantities] = useState<Record<string, string>>({});

  const saveElection = useSaveElection({
    mutation: { onSuccess: () => { toast({ title: "Election submitted" }); queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }); } }
  });

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading event...</div>;
  }
  if (isError || !event) {
    return <div className="flex flex-1 items-center justify-center text-sm text-destructive">The event could not be loaded.</div>;
  }

  const data = event as EventDetail;

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

  const primarySource = data.sourceRecords.find((source) => source.primary);
  const daysLeft = daysUntil(data.internalDeadlineAt);
  const statement1 = actionStatement(data);
  const statement2 = `${daysLeft ?? "No"} day${daysLeft === 1 ? "" : "s"} left. Decide by ${data.internalDeadline}.`;
  const statement3 = primarySource
    ? `Received ${formatIstDate(primarySource.receivedAt)} from your custodian (${primarySource.provider}, ${primarySource.messageType}). ${data.sourceAgreement}`
    : `Received ${formatIstDate(data.receivedAt)} from ${data.source}. ${data.sourceAgreement}`;
  const statusCopy = data.status === "Awaiting approval"
    ? "With Compliance"
    : !isMandatory && ["Validated", "Election required"].includes(data.status)
      ? "Awaiting your decision"
      : data.status === "Under review"
        ? "Terms being confirmed"
        : data.status === "Break identified"
          ? "Settlement difference found"
          : data.status;

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
                {statusCopy} · {affectedSchemes.length} affected scheme{affectedSchemes.length === 1 ? "" : "s"}
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
            <Card className="rounded-md border-[#d8d1cb] shadow-none bg-white">
              <CardContent className="p-6">
                <div className="space-y-3 text-sm text-[#322823] leading-relaxed">
                  <p>{statement1}</p>
                  <p>{statement2}</p>
                  <p>{statement3}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#d8d1cb]/50 text-xs font-mono text-muted-foreground flex gap-4">
                  <span>ISIN: {data.securityMaster?.isin ?? "N/A"}</span>
                  <span>Ticker: {data.securityMaster?.ticker ?? "N/A"}</span>
                  <span>Ref: {data.reference}</span>
                </div>
              </CardContent>
            </Card>
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
                        <TableCell><Link href={`/schemes/${scheme.schemeId}`} className="font-semibold text-primary hover:underline">{scheme.schemeName}</Link></TableCell>
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
                </div>
              </section>
            </>
          )}

          <section>
            <SectionHeading index={isMandatory ? "03" : "06"} eyebrow="History" title="History" description="A short record of what has happened." />
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
                        <TableCell>{formatIstDate(entry.timestamp)}</TableCell>
                        <TableCell>{entry.actor}</TableCell>
                        <TableCell>{entry.action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
