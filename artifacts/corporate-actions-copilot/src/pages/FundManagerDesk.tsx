import { useState } from "react";
import {
  getGetEventQueryKey,
  getGetArkaDeskQueryKey,
  useGetEvent,
  useGetArkaDesk,
  useSaveArkaDeskDecisions,
  useSubmitArkaDesk,
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
import { formatInr } from "@/lib/format";
import { fundManagerStatus } from "@/lib/status";

const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
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
  const isRightsHero = event?.eventType === "Rights issue" && event?.issuer === "Bharat Renewables Ltd";
  const { data: arkaDesk, isLoading: arkaLoading } = useGetArkaDesk();

  const [electionOptions, setElectionOptions] = useState<Record<string, string>>({});
  const [electionQuantities, setElectionQuantities] = useState<Record<string, string>>({});
  const [rightsChoices, setRightsChoices] = useState<Record<string, string>>({});
  const [rightsQuantities, setRightsQuantities] = useState<Record<string, string>>({});

  const saveElection = useSaveElection({
    mutation: { onSuccess: () => { toast({ title: "Election submitted" }); queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }); } }
  });
  const queryClient2 = useQueryClient();
  const saveArka = useSaveArkaDeskDecisions({
    mutation: {
      onSuccess: () => queryClient2.invalidateQueries({ queryKey: getGetArkaDeskQueryKey() }),
      onError: (error: any) => toast({ title: error?.message ?? "Decision blocked", variant: "destructive" }),
    },
  });
  const submitArka = useSubmitArkaDesk({
    mutation: {
      onSuccess: () => {
        toast({ title: "Submitted to Compliance" });
        queryClient2.invalidateQueries({ queryKey: getGetArkaDeskQueryKey() });
      },
      onError: (error: any) => toast({ title: error?.message ?? "Submission blocked", variant: "destructive" }),
    },
  });

  if (isLoading || (isRightsHero && arkaLoading)) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading event...</div>;
  }
  if (isError || !event) {
    return <div className="flex flex-1 items-center justify-center text-sm text-destructive">The event could not be loaded.</div>;
  }

  const data = event as EventDetail;
  const arka = arkaDesk;

  const isMandatory = data.processingType === "Mandatory" || ["Cash dividend", "Stock split", "Bonus issue"].includes(data.eventType);
  const affectedSchemes = (data.schemeImpacts ?? []).filter((impact) => impact.affected);

  const constraints = affectedSchemes.filter(s => s.flag === "SEBI 10% headroom" || s.flag === "Cash short");
  const rightsRows = arka?.schemes ?? [];
  const rightsOption = (id: string) => rightsChoices[id] ?? "exercise";
  const permittedRights = (row: any) => Math.min(row.entitlementRights, row.maxRightsByCap ?? row.entitlementRights, row.maxRightsByCash ?? row.entitlementRights);
  const rightsQty = (row: any) => Number(rightsQuantities[row.id] ?? permittedRights(row));
  const rightsValue = arka?.terms.rightValue ?? 29.1667;
  const subscriptionPrice = arka?.terms.subscriptionPrice ?? 85;
  const totals = rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible").reduce((acc: any, row: any) => {
    const choice = rightsOption(row.id);
    const quantity = rightsQty(row);
    const exercised = choice === "exercise" ? quantity : 0;
    const sold = choice === "sell" ? quantity : 0;
    const forfeited = Math.max(0, row.entitlementRights - exercised - sold);
    acc.exercise += exercised;
    acc.cash += exercised * subscriptionPrice;
    acc.sell += sold;
    acc.forfeited += forfeited;
    return acc;
  }, { exercise: 0, cash: 0, sell: 0, forfeited: 0 });
  const blockedRights = rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible" && rightsOption(row.id) === "exercise" && rightsQty(row) > permittedRights(row));

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
    ? `Received ${formatIstDate(primarySource.receivedAt)} from ${data.isEarlySighting ? "the exchange" : "your custodian"} (${primarySource.provider}, ${primarySource.messageType}). ${data.sourceAgreement}`
    : `Received ${formatIstDate(data.receivedAt)} from ${data.source}. ${data.sourceAgreement}`;
  const statusCopy = fundManagerStatus(data.status, data.isEarlySighting);

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
                {statusCopy} · {affectedSchemes.length} affected scheme{affectedSchemes.length === 1 ? "" : "s"}{data.isEarlySighting ? " · Indicative impact" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-[#e5a15f] bg-[#fff8ef] text-[#9d4d00]">India · {data.currency} only</Badge>
              <Badge variant="outline">{data.reference}</Badge>
            </div>
          </div>
        </header>

        <div className="space-y-8">
          {data.isEarlySighting && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
              <strong>Early sighting, indicative only.</strong> {data.decisionBlockedReason}
            </div>
          )}
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
                       <TableHead className="text-right">NAV impact / unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {affectedSchemes.map((scheme) => (
                      <TableRow key={scheme.id} className="text-xs">
                        <TableCell><Link href={`/schemes/${scheme.schemeId}`} className="font-semibold text-primary hover:underline">{scheme.schemeName}</Link></TableCell>
                        <TableCell className="text-right font-mono">{integer.format(scheme.eligibleQuantity)}</TableCell>
                        <TableCell className="text-right font-mono">{scheme.cashAmount ? formatInr(scheme.cashAmount) : "No cash movement"}</TableCell>
                         <TableCell>{scheme.direction}</TableCell>
                         <TableCell className="text-right font-mono">{scheme.navImpactPaise == null ? "Neutral" : `${scheme.navImpactPaise.toFixed(2)} paise`}</TableCell>
                      </TableRow>
                    ))}
                     {affectedSchemes.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No affected schemes.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          {!isMandatory && (
            <>
              {isRightsHero ? (
                <section>
                  <SectionHeading index="03" eyebrow="Elections" title="Options" description="Compare the three ways to treat the rights entitlement." />
                  <Card className="rounded-md border-[#d8d1cb] shadow-none bg-white">
                    <CardContent className="grid gap-3 p-5 text-sm md:grid-cols-3">
                      <div><strong className="text-[#5b1235]">Exercise</strong><p className="mt-1 text-slate-600">Subscribe at ₹85. Costs cash and keeps your holding whole.</p><p className="mt-2 font-semibold">Pay ₹22.44 cr, receive 26,40,000 shares</p></div>
                      <div><strong className="text-[#5b1235]">Sell entitlement</strong><p className="mt-1 text-slate-600">Sell the RE on NSE/BSE before the RE window closes.</p><p className="mt-2 font-semibold">Recover about ₹7.70 cr, no funding needed</p></div>
                      <div><strong className="text-[#5b1235]">Let lapse</strong><p className="mt-1 text-slate-600">Do nothing and allow the entitlement to expire.</p><p className="mt-2 font-semibold">Forfeit ₹7.70 cr</p></div>
                    </CardContent>
                  </Card>
                </section>
              ) : data.options && data.options.length > 0 && (
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

              {isRightsHero ? (
                <section>
                  <SectionHeading index="04" eyebrow="Limits" title="Constraints" description="Headroom and liquidity limits that block full exercise." />
                  <Card className="rounded-md border-[#d8d1cb] shadow-none bg-[#fffaf4]">
                    <CardContent className="space-y-3 p-4 text-xs">
                      {rightsRows.filter((row: any) => row.blockers.length).map((row: any) => (
                        <div key={row.id} className="text-slate-800">
                          <strong>{row.name}</strong>: {row.id === "arka-focused-25"
                            ? `Bharat Renewables is 9.39% of NAV. Exercising all ${integer.format(row.entitlementRights)} rights reaches 10.77% and breaches the 10% cap. Maximum: ${integer.format(permittedRights(row))} rights. Sell the remaining ${integer.format(row.entitlementRights - permittedRights(row))} on exchange before the RE window closes.`
                            : `Needs ${formatInr(row.fullCashCrore * 10_000_000)}, has ${formatInr(row.cashAvailableCrore * 10_000_000)}. Short ${formatInr((row.fullCashCrore - row.cashAvailableCrore) * 10_000_000)}. Cash covers ${integer.format(permittedRights(row))} of ${integer.format(row.entitlementRights)} rights.`}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </section>
              ) : constraints.length > 0 && (
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
                  {isRightsHero ? rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible").map((row: any) => (
                    <Card key={row.id} className={`rounded-md border shadow-none ${row.blockers.length ? "border-amber-300 bg-amber-50" : "border-[#d8d1cb] bg-white"}`}>
                      <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr,1.2fr,1fr] items-center">
                        <div><div className="font-semibold text-[#5b1235] text-sm">{row.name}</div><div className="text-xs text-muted-foreground">Entitlement: {integer.format(row.entitlementRights)}</div>{row.blockers.length > 0 && <div className="mt-1 text-xs font-semibold text-amber-800">Blocked above {integer.format(permittedRights(row))}</div>}</div>
                        <div className="flex gap-2 items-center"><Select value={rightsOption(row.id)} onValueChange={(value) => setRightsChoices((prev) => ({ ...prev, [row.id]: value }))}><SelectTrigger className="w-[170px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="exercise">Exercise</SelectItem><SelectItem value="sell">Sell entitlement</SelectItem><SelectItem value="lapse">Let lapse</SelectItem></SelectContent></Select><Input className="w-[120px] text-xs" type="number" min={0} max={row.entitlementRights} value={rightsQty(row)} onChange={(e) => setRightsQuantities((prev) => ({ ...prev, [row.id]: e.target.value }))} /></div>
                        <div className="text-right text-xs">{rightsOption(row.id) === "exercise" ? `Pay ${formatInr(rightsQty(row) * subscriptionPrice)}` : rightsOption(row.id) === "sell" ? `Recover about ${formatInr(rightsQty(row) * rightsValue)}` : `Forfeit ${formatInr(rightsQty(row) * rightsValue)}`}</div>
                      </CardContent>
                    </Card>
                  )) : affectedSchemes.map((impact: any) => (
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
                  {isRightsHero && <Card className="rounded-md border-[#d8d1cb] bg-[#fffaf4] shadow-none"><CardContent className="space-y-3 p-5"><div className="grid gap-2 text-sm sm:grid-cols-4"><span>Exercise <strong>{integer.format(totals.exercise)}</strong></span><span>ASBA funding <strong>{formatInr(totals.cash)}</strong></span><span>Sell <strong>{integer.format(totals.sell)}</strong> rights</span><span>Value forfeited <strong>{formatInr(totals.forfeited * rightsValue)}</strong></span></div><Button className="bg-[#dc6900] hover:bg-[#b85700]" disabled={blockedRights.length > 0 || saveArka.isPending || submitArka.isPending} onClick={() => saveArka.mutate({ data: { decisions: rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible").map((row: any) => ({ schemeId: row.id, rights: rightsOption(row.id) === "exercise" ? rightsQty(row) : 0 })) } }, { onSuccess: () => submitArka.mutate() })}>{blockedRights.length > 0 ? `Resolve blocked schemes: ${blockedRights.map((row: any) => row.name).join(", ")}` : "Submit to Compliance"}</Button></CardContent></Card>}
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
