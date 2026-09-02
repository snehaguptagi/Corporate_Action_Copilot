import { useState } from "react";
import {
  getGetEventQueryKey,
  getGetArkaDeskQueryKey,
  useGetEvent,
  useGetArkaDesk,
  useGenerateJudgement,
  useSaveArkaDeskDecisions,
  useSubmitArkaDesk,
  useSaveElection,
  type EventDetail,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  AlertTriangle,
  ChevronDown,
  Landmark,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatIstDate } from "@/lib/date";
import { formatInr, issuerIdFor } from "@/lib/format";
import { fundManagerStatus } from "@/lib/status";

const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function Figure({ children }: { children: React.ReactNode }) {
  return <span className="figure-inline">{children}</span>;
}

function Section({ index, title, summary, defaultOpen = true, children }: { index: string; title: string; summary?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-stone-50 sm:px-5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">{index}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold tracking-tight text-foreground">{title}</span>
          {summary && <span className="block truncate text-xs text-muted-foreground">{summary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-border/60 p-3 sm:p-4">{children}</div>}
    </section>
  );
}

function ImpactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-stone-50 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="figure mt-1 text-left text-base font-semibold text-foreground">{value}</div>
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
  return Math.ceil((deadline - Date.now()) / 86_400_000);
}

function deadlineStatement(data: EventDetail, daysLeft: number | null, isMandatory: boolean) {
  if (isMandatory) {
    return <>No election is required. The desk tracks settlement against <Figure>{data.internalDeadline}</Figure>.</>;
  }
  if (daysLeft === null) {
    return <>Decide by <Figure>{data.internalDeadline}</Figure>.</>;
  }
  if (daysLeft < 0) {
    return <>The internal deadline of <Figure>{data.internalDeadline}</Figure> has passed.</>;
  }
  if (daysLeft === 0) {
    return <>Due today. Decide by <Figure>{data.internalDeadline}</Figure>.</>;
  }
  return <><Figure>{daysLeft}</Figure> day{daysLeft === 1 ? "" : "s"} left. Decide by <Figure>{data.internalDeadline}</Figure>.</>;
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
  const generateJudgement = useGenerateJudgement({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) }),
      onError: (error: any) => toast({ title: error?.message ?? "Judgement run failed", variant: "destructive" }),
    },
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
  const showOptions = !isMandatory && (isRightsHero || (data.options ?? []).length > 0);
  const showConstraints = !isMandatory && (isRightsHero || constraints.length > 0);
  let sectionNumber = 2;
  const nextSection = () => String(++sectionNumber).padStart(2, "0");
  const judgementIndex = nextSection();
  const optionsIndex = showOptions ? nextSection() : "";
  const constraintsIndex = showConstraints ? nextSection() : "";
  const decisionIndex = isMandatory ? "" : nextSection();
  const historyIndex = nextSection();
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
  const isPublicWebDiscovery = data.source === "Public web discovery";
  const isPocScenario = !data.id.startsWith("evt-intake-");
  const daysLeft = daysUntil(data.internalDeadlineAt);
  const receivedMs = Date.parse(data.receivedAt);
  const deadlineMs = Date.parse(data.internalDeadlineAt);
  const deadlineProgress = Number.isFinite(receivedMs) && Number.isFinite(deadlineMs) && deadlineMs > receivedMs
    ? Math.min(100, Math.max(2, ((Date.now() - receivedMs) / (deadlineMs - receivedMs)) * 100))
    : 0;
  const totalEligibleQuantity = affectedSchemes.reduce((total, scheme: any) => total + Number(scheme.eligibleQuantity ?? 0), 0);
  const totalExpectedCash = affectedSchemes.reduce((total, scheme: any) => total + Number(scheme.cashAmount ?? 0), 0);
  const largestNavImpactPaise = affectedSchemes.reduce((largest, scheme: any) => Math.max(largest, Number(scheme.navImpactPaise ?? 0)), 0);
  const statement1 = actionStatement(data);
  const statement2 = deadlineStatement(data, daysLeft, isMandatory);
  const statement3 = isPocScenario
    ? <>Simulated POC scenario. The issuer, notice, holdings and source records on this screen are not live fetched data.</>
    : primarySource
    ? <>Received <Figure>{formatIstDate(primarySource.receivedAt)}</Figure> from {isPublicWebDiscovery ? "a public web source" : data.isEarlySighting ? "the exchange" : "your custodian"} ({primarySource.provider}, {primarySource.messageType}). {data.sourceAgreement}</>
    : <>Received <Figure>{formatIstDate(data.receivedAt)}</Figure> from {data.source}. {data.sourceAgreement}</>;
  const statusCopy = fundManagerStatus(data.status, data.isEarlySighting);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[1560px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-3 border-b border-border pb-3">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                <Landmark className="h-3.5 w-3.5" />
                {(data.provenance?.synthetic ?? isPocScenario) && <Badge variant="outline">Synthetic data</Badge>}
                {isPublicWebDiscovery && <Badge variant="warning">Unverified web discovery</Badge>}
              </div>
              <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
                <Link href={`/issuers/${issuerIdFor(data.issuer)}`} className="hover:text-primary hover:underline">{data.issuer}</Link> {data.eventType.toLowerCase()}
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-foreground">
                {statusCopy} · {affectedSchemes.length} affected scheme{affectedSchemes.length === 1 ? "" : "s"}{data.isEarlySighting ? " · Indicative impact" : ""}
              </p>
              {data.provenance && (
                <p className="mt-1 text-xs text-muted-foreground">
                  As of <span className="figure-inline">{formatIstDate(data.provenance.asOf)}</span> · Arrived via {data.provenance.channel} ({data.provenance.provider}){data.provenance.synthetic ? (data.provenance.fetchedAt ? " · Synthetic provider fetch, not live market data" : " · Synthetic record, nothing has been fetched yet") : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/35 bg-accent-soft text-primary">India · {data.currency} only</Badge>
              <Badge variant="outline">{data.reference}</Badge>
            </div>
          </div>
        </header>

        <div className="space-y-3">
          {data.isEarlySighting && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
              <strong>Early sighting, indicative only.</strong> {data.decisionBlockedReason}
            </div>
          )}
          <Section index="01" title="What it is" summary="Terms, deadline and security identifiers">
            <div className="space-y-2 text-sm leading-6 text-foreground">
              <p>{statement1}</p>
              <p>{statement2}</p>
              <p>{statement3}</p>
            </div>
            {!isMandatory && daysLeft !== null && (
              <div className="mt-3 rounded-md border border-border/60 bg-stone-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                  <span>Received <span className="figure-inline">{formatIstDate(data.receivedAt)}</span></span>
                  <span className={daysLeft <= 3 ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
                    {daysLeft < 0 ? "Deadline passed" : daysLeft === 0 ? "Due today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                  </span>
                  <span>Decide by <span className="figure-inline">{data.internalDeadline}</span></span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
                  <div className={`h-full rounded-full ${daysLeft <= 3 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${deadlineProgress}%` }} />
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
              <span>ISIN: {data.securityMaster?.isin ?? "N/A"}</span>
              <span>Ticker: {data.securityMaster?.ticker ?? "N/A"}</span>
              <span>Ref: {data.reference}</span>
            </div>
          </Section>

          <Section index="02" title="Stage 1 · Deterministic" summary={`The maths, computed and reproducible, no model call · ${affectedSchemes.length} affected scheme${affectedSchemes.length === 1 ? "" : "s"}${totalExpectedCash > 0 ? ` · ${formatInr(totalExpectedCash)} expected` : ""}`}>
            {affectedSchemes.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <ImpactStat label="Affected schemes" value={String(affectedSchemes.length)} />
                <ImpactStat label="Eligible quantity" value={integer.format(totalEligibleQuantity)} />
                <ImpactStat label="Expected cash" value={totalExpectedCash > 0 ? formatInr(totalExpectedCash) : "None"} />
                <ImpactStat label="Largest NAV impact" value={largestNavImpactPaise > 0 ? `${largestNavImpactPaise.toFixed(2)} p / unit` : "Neutral"} />
              </div>
            )}
            <div className="overflow-hidden rounded-md border border-border/70">
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
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">{isPublicWebDiscovery ? "No portfolio impact calculated. Match holdings and confirm authoritative evidence first." : "No affected schemes."}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalExpectedCash > 0 && affectedSchemes.length > 1 && (
              <div className="mt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cash distribution across schemes</div>
                <div className="space-y-2">
                  {affectedSchemes.map((scheme: any) => (
                    <div key={scheme.id} className="flex items-center gap-3 text-xs">
                      <span className="w-44 truncate text-muted-foreground sm:w-56">{scheme.schemeName}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (Number(scheme.cashAmount ?? 0) / totalExpectedCash) * 100)}%` }} />
                      </div>
                      <span className="figure w-12 text-right font-medium">{Math.round((Number(scheme.cashAmount ?? 0) / totalExpectedCash) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section
            index={judgementIndex}
            title="Stage 2 · AI judgement"
            summary={data.judgement?.status === "ok" ? `Interpretation by ${data.judgement.model}, generated ${formatIstDate(data.judgement.generatedAt)}` : "Interpretation of the Stage 1 output. Advisory only, cannot change a figure."}
          >
            {data.judgement?.status === "ok" && data.judgement.summary ? (
              <>
                <p className="max-w-4xl text-sm leading-6 text-foreground">{data.judgement.summary}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  <span>Model {data.judgement.model} · Generated <span className="figure-inline">{formatIstDate(data.judgement.generatedAt)}</span> · Reads Stage 1 output only. Every number above is checked against Stage 1 before display, and this text feeds no calculation, election, instruction or approval.</span>
                  <Button size="sm" variant="outline" onClick={() => generateJudgement.mutate({ eventId })} disabled={generateJudgement.isPending}>
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generateJudgement.isPending ? "animate-spin" : ""}`} />
                    {generateJudgement.isPending ? "Re-running" : "Refresh"}
                  </Button>
                </div>
              </>
            ) : data.judgement && data.judgement.status !== "ok" ? (
              <div className="space-y-3 text-sm">
                <p className="max-w-3xl leading-6 text-foreground">
                  {data.judgement.status === "rejected"
                    ? "Judgement is unavailable for this run. The model response introduced a figure that does not appear in the Stage 1 output, so it was rejected and the deterministic Stage 1 figures above stand alone."
                    : "Judgement is unavailable. The deterministic Stage 1 figures above stand alone."}
                </p>
                {data.judgement.rejectedReason && <p className="max-w-3xl text-xs text-muted-foreground">{data.judgement.rejectedReason}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Button size="sm" variant="outline" onClick={() => generateJudgement.mutate({ eventId })} disabled={generateJudgement.isPending}>
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generateJudgement.isPending ? "animate-spin" : ""}`} />
                    {generateJudgement.isPending ? "Re-running" : "Try again"}
                  </Button>
                  <span>Attempted with {data.judgement.model} at <span className="figure-inline">{formatIstDate(data.judgement.generatedAt)}</span></span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Not run yet. Stage 2 reads the Stage 1 output above plus portfolio context and writes the trade-off, what to do first, and what is missing from the notice. It can cite Stage 1 figures but is structurally blocked from introducing or changing a number.
                </p>
                <Button size="sm" onClick={() => generateJudgement.mutate({ eventId })} disabled={generateJudgement.isPending}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {generateJudgement.isPending ? "Running" : "Run AI judgement"}
                </Button>
              </div>
            )}
          </Section>

          {!isMandatory && (
            <>
              {isRightsHero ? (
                <Section index={optionsIndex} title="Options" summary="Three ways to treat the rights entitlement">
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                      <div><strong className="text-foreground">Exercise</strong><p className="mt-1 text-muted-foreground">Subscribe at {formatInr(subscriptionPrice)}. Costs cash and keeps your holding whole.</p><p className="figure mt-2 text-left font-semibold">Pay {formatInr(totalEntitlementRights * subscriptionPrice)}, receive {integer.format(totalEntitlementRights)} shares</p></div>
                      <div><strong className="text-foreground">Sell entitlement</strong><p className="mt-1 text-muted-foreground">Sell the RE on NSE/BSE before the RE window closes.</p><p className="figure mt-2 text-left font-semibold">Recover about {formatInr(totalEntitlementRights * rightsValue)}, no funding needed</p></div>
                      <div><strong className="text-foreground">Let lapse</strong><p className="mt-1 text-muted-foreground">Do nothing and allow the entitlement to expire.</p><p className="figure mt-2 text-left font-semibold">Forfeit {formatInr(totalEntitlementRights * rightsValue)}</p></div>
                  </div>
                </Section>
              ) : data.options && data.options.length > 0 && (
                <Section index={optionsIndex} title="Options" summary={`${data.options.length} choices · default is ${data.options.find((opt) => opt.default)?.label.toLowerCase() ?? "not set"}`}>
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.options.map((opt) => (
                      <div key={opt.id} className={`rounded-md border p-4 ${opt.default ? "border-primary/40 bg-accent-soft" : "border-border/70 bg-stone-50"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                          {opt.default && <Badge variant="secondary">Default</Badge>}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{opt.description}</p>
                        <div className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs">
                          <div><span className="font-semibold text-foreground">Result:</span> {opt.result || "-"}</div>
                          <div><span className="font-semibold text-foreground">Funding:</span> {opt.fundingFormula || "-"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {isRightsHero ? (
                <Section index={constraintsIndex} title="Constraints" summary="Headroom and liquidity limits that block full exercise">
                  <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-4 text-xs">
                      {rightsRows.filter((row: any) => row.blockers.length).map((row: any) => (
                        <div key={row.id} className="text-foreground">
                          <strong>{row.name}</strong>: {row.id === "arka-focused-25"
                            ? <>Bharat Renewables is <Figure>{row.currentExposurePercent.toFixed(2)}%</Figure> of NAV. Exercising all <Figure>{integer.format(row.entitlementRights)}</Figure> rights reaches <Figure>{row.capUsagePercent.toFixed(2)}%</Figure> and breaches the <Figure>{row.sebiLimitPercent}%</Figure> cap. Maximum: <Figure>{integer.format(permittedRights(row))}</Figure> rights. Sell the remaining <Figure>{integer.format(row.entitlementRights - permittedRights(row))}</Figure> on exchange before the RE window closes.</>
                            : <>Needs <Figure>{formatInr(row.fullCashCrore * 10_000_000)}</Figure>, has <Figure>{formatInr(row.cashAvailableCrore * 10_000_000)}</Figure>. Short <Figure>{formatInr((row.fullCashCrore - row.cashAvailableCrore) * 10_000_000)}</Figure>. Cash covers <Figure>{integer.format(permittedRights(row))}</Figure> of <Figure>{integer.format(row.entitlementRights)}</Figure> rights.</>}
                        </div>
                      ))}
                  </div>
                </Section>
              ) : constraints.length > 0 && (
                <Section index={constraintsIndex} title="Constraints" summary={`${constraints.length} scheme${constraints.length === 1 ? "" : "s"} flagged`}>
                  <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-4">
                    {constraints.map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-xs text-destructive font-medium">
                        <AlertTriangle className="h-4 w-4" /> {c.schemeName}: {c.flag}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section index={decisionIndex} title="Decision" summary="Set scheme elections and submit for checker approval">
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
                  )) : (
                    <div className="overflow-hidden rounded-md border border-border/70">
                      {affectedSchemes.map((impact: any, rowIndex: number) => (
                        <div key={impact.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${rowIndex > 0 ? "border-t border-border/60" : ""}`}>
                          <div className="min-w-[220px] flex-1">
                            <span className="text-sm font-semibold text-foreground">{impact.schemeName}</span>
                            <span className="figure-inline ml-2 text-xs text-muted-foreground">Entitlement: {integer.format(impact.quantityResult ?? impact.eligibleQuantity)}</span>
                          </div>
                          {impact.electionDecision ? (
                            <Badge variant="outline">{impact.electionDecision.optionLabel} · {impact.electionDecision.quantityElected} · {impact.approval}</Badge>
                          ) : (
                            <>
                              <Select value={electionOptions[impact.id] ?? (data.options.find((o:any)=>o.default)?.id || "")} onValueChange={(val) => setElectionOptions(prev => ({...prev, [impact.id]: val}))}>
                                <SelectTrigger className="w-[170px] text-xs"><SelectValue placeholder="Option" /></SelectTrigger>
                                <SelectContent>
                                  {data.options.map((opt:any) => <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input
                                aria-label={`${impact.schemeName} quantity`}
                                className="figure w-[110px] text-xs"
                                type="number"
                                value={electionQuantities[impact.id] ?? (impact.quantityResult ?? impact.eligibleQuantity)}
                                onChange={(e) => setElectionQuantities(prev => ({...prev, [impact.id]: e.target.value}))}
                              />
                              <Button size="sm" onClick={() => saveAnElection(impact)} disabled={saveElection.isPending}>
                                Submit
                              </Button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isRightsHero && <Card className="rounded border-border bg-warning/5 shadow-none"><CardContent className="space-y-3 p-5"><div className="grid gap-2 text-sm sm:grid-cols-4"><span className="figure text-left">Exercise <strong>{integer.format(totals.exercise)}</strong></span><span className="figure text-left">ASBA funding <strong>{formatInr(totals.cash)}</strong></span><span className="figure text-left">Sell <strong>{integer.format(totals.sell)}</strong> rights</span><span className="figure text-left">Value forfeited <strong>{formatInr(totals.forfeited * rightsValue)}</strong></span></div><Button disabled={blockedRights.length > 0 || saveArka.isPending || submitArka.isPending} onClick={() => saveArka.mutate({ data: { decisions: rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible").map((row: any) => ({ schemeId: row.id, rights: rightsOption(row.id) === "exercise" ? rightsQty(row) : 0 })) } }, { onSuccess: () => submitArka.mutate() })}>{blockedRights.length > 0 ? `Resolve blocked schemes: ${blockedRights.map((row: any) => row.name).join(", ")}` : "Submit to Compliance"}</Button></CardContent></Card>}
                </div>
              </Section>
            </>
          )}

          <Section index={historyIndex} title="History" summary={`${(data.audit ?? []).length} recorded step${(data.audit ?? []).length === 1 ? "" : "s"}`} defaultOpen={false}>
            <ol className="space-y-5 border-l-2 border-border/70 pl-5">
              {(data.audit ?? []).map((entry: any) => (
                <li key={entry.id} className="relative">
                  <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-card ${entry.actorType === "user" ? "bg-primary" : "bg-stone-400"}`} aria-hidden="true" />
                  <div className="text-sm font-semibold text-foreground">{entry.action}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{entry.actor} · <span className="figure-inline">{formatIstDate(entry.timestamp)}</span></div>
                  {entry.detail && <div className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{entry.detail}</div>}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}
