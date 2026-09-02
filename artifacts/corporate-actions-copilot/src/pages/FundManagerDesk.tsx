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
function Figure({ children }: { children: React.ReactNode }) {
  return <span className="figure-inline">{children}</span>;
}

function SectionHeading({ index, eyebrow, title, description }: { index: string; eyebrow: string; title: string; description: string; }) {
  void eyebrow;
  void description;
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">{index}</div>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
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
    return <>{data.issuer} is paying <Figure>{termValue(data, "rate")}</Figure> per share. Record date <Figure>{termValue(data, "recordDate")}</Figure>. Nothing to decide.</>;
  }
  if (data.eventType === "Stock split") {
    return <>{data.issuer} is splitting each share into <Figure>{termValue(data, "splitRatio").replace(" for 1", "")}</Figure>. Your <Figure>{integer.format(quantity)}</Figure> shares become <Figure>{integer.format(resultQuantity)}</Figure>. Nothing to decide.</>;
  }
  if (data.eventType === "Bonus issue") {
    return <>{data.issuer} is issuing <Figure>{termValue(data, "bonusRatio").replace(" for ", " bonus share for every ")}</Figure> held. Nothing to decide.</>;
  }
  if (data.eventType === "Tender offer") {
    return <>{data.issuer} is buying back up to <Figure>{termValue(data, "maximumAcceptance")}</Figure> at <Figure>{termValue(data, "offerPrice")}</Figure>.</>;
  }
  if (data.eventType === "Rights issue") {
    return <>{data.issuer} is offering <Figure>{termValue(data, "rightsRatio").replace(" for ", " new share for every ")}</Figure> you hold, at <Figure>{termValue(data, "subscriptionPrice")}</Figure>{data.discountPercentage && data.referencePrice ? <>, a <Figure>{data.discountPercentage.toFixed(1)}%</Figure> discount to the <Figure>₹{integer.format(data.referencePrice)}</Figure> close</> : ""}.</>;
  }
  if (data.eventType === "Merger / demerger") {
    return <>{data.issuer} is merging under a scheme where you receive <Figure>{termValue(data, "shareExchangeRatio")}</Figure> shares plus <Figure>{termValue(data, "cashRate")}</Figure> per share.</>;
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
  const [rightsRemainders, setRightsRemainders] = useState<Record<string, string>>({});

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
  const remainderOption = (row: any) => rightsRemainders[row.id] ?? (permittedRights(row) < row.entitlementRights ? "sell" : "lapse");
  const rightsValue = arka?.terms.rightValue ?? 29.1667;
  const subscriptionPrice = arka?.terms.subscriptionPrice ?? 85;
  const totalEntitlementRights = rightsRows
    .filter((row: any) => row.eligibilityStatus === "Eligible")
    .reduce((total: number, row: any) => total + row.entitlementRights, 0);
  const totals = rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible").reduce((acc: any, row: any) => {
    const choice = rightsOption(row.id);
    const quantity = Math.max(0, rightsQty(row));
    const exercised = choice === "exercise" ? quantity : 0;
    const remainder = Math.max(0, row.entitlementRights - exercised);
    const sold = choice === "sell"
      ? row.entitlementRights
      : choice === "exercise" && remainderOption(row) === "sell"
        ? remainder
        : 0;
    const forfeited = choice === "lapse"
      ? row.entitlementRights
      : choice === "exercise" && remainderOption(row) === "lapse"
        ? remainder
        : 0;
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
  const statement2 = <><Figure>{daysLeft ?? "No"}</Figure> day{daysLeft === 1 ? "" : "s"} left. Decide by <Figure>{data.internalDeadline}</Figure>.</>;
  const statement3 = primarySource
    ? <>Received <Figure>{formatIstDate(primarySource.receivedAt)}</Figure> from {data.isEarlySighting ? "the exchange" : "your custodian"} ({primarySource.provider}, {primarySource.messageType}). {data.sourceAgreement}</>
    : <>Received <Figure>{formatIstDate(data.receivedAt)}</Figure> from {data.source}. {data.sourceAgreement}</>;
  const statusCopy = fundManagerStatus(data.status, data.isEarlySighting);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 border-b border-border pb-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                <Landmark className="h-3.5 w-3.5" />
                Arka Mutual Fund
              </div>
              <h1 className="text-[28px] font-semibold tracking-tight text-foreground">{data.issuer} {data.eventType.toLowerCase()}</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-foreground">
                {statusCopy} · {affectedSchemes.length} affected scheme{affectedSchemes.length === 1 ? "" : "s"}{data.isEarlySighting ? " · Indicative impact" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/35 bg-accent-soft text-primary">India · {data.currency} only</Badge>
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
            <Card className="rounded border-border bg-card shadow-none">
              <CardContent className="p-6">
                <div className="space-y-3 text-base leading-7 text-foreground">
                  <p>{statement1}</p>
                  <p>{statement2}</p>
                  <p>{statement3}</p>
                </div>
                <div className="mt-6 flex gap-4 border-t border-border/50 pt-4 text-xs font-mono text-muted-foreground">
                  <span>ISIN: {data.securityMaster?.isin ?? "N/A"}</span>
                  <span>Ticker: {data.securityMaster?.ticker ?? "N/A"}</span>
                  <span>Ref: {data.reference}</span>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <SectionHeading index="02" eyebrow="Scheme impact" title="What it touches" description="Affected schemes and expected financial impacts." />
            <Card className="rounded border-border bg-card shadow-none">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
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
                        <TableCell className="figure">{integer.format(scheme.eligibleQuantity)}</TableCell>
                        <TableCell className="figure">{scheme.cashAmount ? formatInr(scheme.cashAmount) : "No cash movement"}</TableCell>
                         <TableCell>{scheme.direction}</TableCell>
                          <TableCell className="figure">{scheme.navImpactPaise == null ? "Neutral" : `${scheme.navImpactPaise.toFixed(2)} paise`}</TableCell>
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
                  <Card className="rounded border-border bg-card shadow-none">
                    <CardContent className="grid gap-3 p-5 text-sm md:grid-cols-3">
                      <div><strong className="text-foreground">Exercise</strong><p className="mt-1 text-muted-foreground">Subscribe at {formatInr(subscriptionPrice)}. Costs cash and keeps your holding whole.</p><p className="figure mt-2 text-left font-semibold">Pay {formatInr(totalEntitlementRights * subscriptionPrice)}, receive {integer.format(totalEntitlementRights)} shares</p></div>
                      <div><strong className="text-foreground">Sell entitlement</strong><p className="mt-1 text-muted-foreground">Sell the RE on NSE/BSE before the RE window closes.</p><p className="figure mt-2 text-left font-semibold">Recover about {formatInr(totalEntitlementRights * rightsValue)}, no funding needed</p></div>
                      <div><strong className="text-foreground">Let lapse</strong><p className="mt-1 text-muted-foreground">Do nothing and allow the entitlement to expire.</p><p className="figure mt-2 text-left font-semibold">Forfeit {formatInr(totalEntitlementRights * rightsValue)}</p></div>
                    </CardContent>
                  </Card>
                </section>
              ) : data.options && data.options.length > 0 && (
                <section>
                  <SectionHeading index="03" eyebrow="Elections" title="Options" description="Available choices provided by the issuer." />
                  <Card className="rounded border-border bg-card shadow-none">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted hover:bg-muted">
                            <TableHead>Label</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Funding Formula</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.options.map((opt) => (
                            <TableRow key={opt.id} className="text-xs">
                              <TableCell className="font-semibold text-foreground">{opt.label} {opt.default && <Badge variant="secondary" className="ml-2">Default</Badge>}</TableCell>
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
                  <Card className="rounded border-border bg-warning/5 shadow-none">
                    <CardContent className="space-y-3 p-4 text-xs">
                      {rightsRows.filter((row: any) => row.blockers.length).map((row: any) => (
                        <div key={row.id} className="text-foreground">
                          <strong>{row.name}</strong>: {row.id === "arka-focused-25"
                            ? <>Bharat Renewables is <Figure>9.39%</Figure> of NAV. Exercising all <Figure>{integer.format(row.entitlementRights)}</Figure> rights reaches <Figure>10.77%</Figure> and breaches the <Figure>10%</Figure> cap. Maximum: <Figure>{integer.format(permittedRights(row))}</Figure> rights. Sell the remaining <Figure>{integer.format(row.entitlementRights - permittedRights(row))}</Figure> on exchange before the RE window closes.</>
                            : <>Needs <Figure>{formatInr(row.fullCashCrore * 10_000_000)}</Figure>, has <Figure>{formatInr(row.cashAvailableCrore * 10_000_000)}</Figure>. Short <Figure>{formatInr((row.fullCashCrore - row.cashAvailableCrore) * 10_000_000)}</Figure>. Cash covers <Figure>{integer.format(permittedRights(row))}</Figure> of <Figure>{integer.format(row.entitlementRights)}</Figure> rights.</>}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </section>
              ) : constraints.length > 0 && (
                <section>
                  <SectionHeading index="04" eyebrow="Limits" title="Constraints" description="Headroom and liquidity limits that block full exercise." />
                  <Card className="rounded border-border bg-warning/5 shadow-none">
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
                    <Card key={row.id} className={`rounded border shadow-none ${row.blockers.length ? "border-warning/50 bg-warning/5" : "border-border bg-card"}`}>
                      <CardContent className="grid items-center gap-3 p-4 md:grid-cols-[1fr,1.6fr,1fr]">
                        <div><div className="text-sm font-semibold text-foreground">{row.name}</div><div className="figure text-left text-xs text-muted-foreground">Entitlement: {integer.format(row.entitlementRights)}</div>{row.blockers.length > 0 && <div className="figure mt-1 text-left text-xs font-semibold text-warning">Exercise capped at {integer.format(permittedRights(row))}</div>}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Select value={rightsOption(row.id)} onValueChange={(value) => setRightsChoices((prev) => ({ ...prev, [row.id]: value }))}>
                            <SelectTrigger className="w-[170px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="exercise">Exercise</SelectItem><SelectItem value="sell">Sell entitlement</SelectItem><SelectItem value="lapse">Let lapse</SelectItem></SelectContent>
                          </Select>
                          {rightsOption(row.id) === "exercise" && (
                            <>
                              <Input aria-label={`${row.name} exercise quantity`} className="figure w-[120px] text-xs" type="number" min={0} max={permittedRights(row)} value={rightsQty(row)} onChange={(e) => setRightsQuantities((prev) => ({ ...prev, [row.id]: e.target.value }))} />
                              {rightsQty(row) < row.entitlementRights && (
                                <Select value={remainderOption(row)} onValueChange={(value) => setRightsRemainders((prev) => ({ ...prev, [row.id]: value }))}>
                                  <SelectTrigger aria-label={`${row.name} remainder treatment`} className="w-[170px] text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="sell">Sell remainder</SelectItem><SelectItem value="lapse">Let remainder lapse</SelectItem></SelectContent>
                                </Select>
                              )}
                            </>
                          )}
                        </div>
                        <div className="figure text-xs">
                          {rightsOption(row.id) === "exercise"
                            ? <>Pay {formatInr(rightsQty(row) * subscriptionPrice)}{rightsQty(row) < row.entitlementRights && remainderOption(row) === "sell" ? ` · Sell ${integer.format(row.entitlementRights - rightsQty(row))}` : rightsQty(row) < row.entitlementRights ? ` · Forfeit ${integer.format(row.entitlementRights - rightsQty(row))}` : ""}</>
                            : rightsOption(row.id) === "sell"
                              ? `Recover about ${formatInr(row.entitlementRights * rightsValue)}`
                              : `Forfeit ${formatInr(row.entitlementRights * rightsValue)}`}
                        </div>
                      </CardContent>
                    </Card>
                  )) : affectedSchemes.map((impact: any) => (
                    <Card key={impact.id} className="rounded border-border bg-card shadow-none">
                      <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr,1.5fr,auto] items-center">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{impact.schemeName}</div>
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
                             <Button onClick={() => saveAnElection(impact)} disabled={saveElection.isPending}>
                              Submit Election
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {isRightsHero && <Card className="rounded border-border bg-warning/5 shadow-none"><CardContent className="space-y-3 p-5"><div className="grid gap-2 text-sm sm:grid-cols-4"><span className="figure text-left">Exercise <strong>{integer.format(totals.exercise)}</strong></span><span className="figure text-left">ASBA funding <strong>{formatInr(totals.cash)}</strong></span><span className="figure text-left">Sell <strong>{integer.format(totals.sell)}</strong> rights</span><span className="figure text-left">Value forfeited <strong>{formatInr(totals.forfeited * rightsValue)}</strong></span></div><Button disabled={blockedRights.length > 0 || saveArka.isPending || submitArka.isPending} onClick={() => saveArka.mutate({ data: { decisions: rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible").map((row: any) => ({ schemeId: row.id, rights: rightsOption(row.id) === "exercise" ? rightsQty(row) : 0 })) } }, { onSuccess: () => submitArka.mutate() })}>{blockedRights.length > 0 ? `Resolve blocked schemes: ${blockedRights.map((row: any) => row.name).join(", ")}` : "Submit to Compliance"}</Button></CardContent></Card>}
                </div>
              </section>
            </>
          )}

          <section>
            <SectionHeading index={isMandatory ? "03" : "06"} eyebrow="History" title="History" description="A short record of what has happened." />
            <Card className="rounded border-border bg-card shadow-none">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead>Time</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.audit ?? []).map((entry: any) => (
                      <TableRow key={entry.id} className="text-xs">
                        <TableCell className="figure">{formatIstDate(entry.timestamp)}</TableCell>
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
