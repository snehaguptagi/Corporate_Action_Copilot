import { useState } from "react";
import {
  getGetEventQueryKey,
  getGetArkaDeskQueryKey,
  useGetEvent,
  useGetArkaDesk,
  useCalculateEvent,
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
import { InfoHint } from "@/components/InfoHint";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatIstDate } from "@/lib/date";
import { formatInr, issuerIdFor } from "@/lib/format";
import { fundManagerStatus, journeyStageIndex, isComplete } from "@/lib/status";
import { JourneyStrip } from "@/components/CaseJourney";

const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
function Figure({ children }: { children: React.ReactNode }) {
  return <span className="figure-inline">{children}</span>;
}

function Section({
  index,
  title,
  summary,
  hint,
  status,
  defaultOpen = true,
  children,
}: {
  index: string;
  title: string;
  summary?: string;
  hint?: string;
  status?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm transition-all duration-200">
      <div className="flex items-center transition-colors hover:bg-stone-50/60">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 pr-2 text-left sm:pl-5"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">{index}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="block text-[17px] font-semibold tracking-tight text-foreground">{title}</span>
              {status}
            </span>
            {summary && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>}
          </span>
        </button>
        {hint && <InfoHint title={title}>{hint}</InfoHint>}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
          className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:mr-4"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && <div className="border-t border-border/60 p-4 sm:p-5">{children}</div>}
    </section>
  );
}

function ImpactStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-stone-50/50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
        {hint && <InfoHint title={label}>{hint}</InfoHint>}
      </div>
      <div className="figure mt-1 text-left text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

function JudgementBlock({ label, text, emphasis = false, hint }: { label: string; text?: string; emphasis?: boolean; hint?: string }) {
  if (!text) return null;
  return (
    <div className={`rounded-md border px-4 py-3 ${emphasis ? "border-primary/35 bg-accent-soft" : "border-border/70 bg-stone-50/50"}`}>
      <p className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${emphasis ? "text-primary" : "text-muted-foreground"}`}>
        {label}
        {hint && <InfoHint title={label}>{hint}</InfoHint>}
      </p>
      <p className="mt-1.5 text-sm leading-6 text-foreground">{text}</p>
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

function formatSettlementDate(value?: string) {
  if (!value) return "Pending";
  const date = new Date(`${value.slice(0, 10)}T00:00:00+05:30`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).replace(",", "");
}

function formatSettlementMoney(amount: number, currency = "INR") {
  if (currency === "INR") return formatInr(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

type StructuredJudgement = {
  recommendation?: string;
  impact?: string;
  risk?: string;
  missing?: string;
};

function structureJudgement(summary: string): StructuredJudgement {
  const matches = [...summary.matchAll(/^(RECOMMENDATION|PORTFOLIO IMPACT|RISK AND CONTROLS|MISSING INFORMATION):\s*/gim)];
  const requiredLabels = ["RECOMMENDATION", "PORTFOLIO IMPACT", "RISK AND CONTROLS", "MISSING INFORMATION"];
  if (
    matches.length === requiredLabels.length
    && matches.every((match, index) => match[1].toUpperCase() === requiredLabels[index])
  ) {
    const content = matches.map((match, index) => {
      const start = Number(match.index) + match[0].length;
      const end = index + 1 < matches.length ? Number(matches[index + 1].index) : summary.length;
      return summary.slice(start, end).trim();
    });
    if (content.every(Boolean)) {
      return {
        recommendation: content[0],
        impact: content[1],
        risk: content[2],
        missing: content[3],
      };
    }
  }

  const cleanSummary = summary.replace(/^(RECOMMENDATION|PORTFOLIO IMPACT|RISK AND CONTROLS|MISSING INFORMATION):\s*/gim, "");
  const sentences = cleanSummary.split(/(?<=[.!?])\s+(?=[A-Z])/).map((value) => value.trim()).filter(Boolean);
  const detectedRecommendation = sentences.findIndex((sentence) => /^(first|recommend|next|immediately|instruct|submit|wait|resolve|investigate|recover|proceed|monitor|record|review|check)\b/i.test(sentence));
  const recommendationIndex = detectedRecommendation >= 0 ? detectedRecommendation : 0;
  const riskIndex = sentences.findIndex((sentence, index) => index !== recommendationIndex && /\b(concentration|headroom|cap|liquidity|risk|settlement break)\b/i.test(sentence));
  const missingIndex = sentences.findIndex((sentence, index) => index !== recommendationIndex && index !== riskIndex && /\b(missing terms|missing information|no additional term|confirm.+term)\b/i.test(sentence));
  const impactIndex = sentences.findIndex((_, index) => ![recommendationIndex, riskIndex, missingIndex].includes(index));
  return {
    recommendation: sentences[recommendationIndex] || "Review the deterministic impact and current case status before proceeding.",
    impact: impactIndex >= 0 ? sentences[impactIndex] : summary,
    risk: riskIndex >= 0 ? sentences[riskIndex] : "No separate risk or control observation was included in this earlier interpretation.",
    missing: missingIndex >= 0 ? sentences[missingIndex] : "No separate missing-information statement was included in this earlier interpretation.",
  };
}

function getNextStepsText(data: EventDetail, isMandatory: boolean, daysLeft: number | null, canRunCalculation: boolean) {
  if (isComplete(data.status)) return "Case complete. All actions resolved.";
  if (data.isEarlySighting) return "Wait for custodian confirmation to proceed.";
  if (!data.validation.isReady) {
    const missing = data.validation.missingTerms.join(", ");
    return `Confirm ${missing || "the missing notice terms"} before the case can progress.`;
  }
  if (canRunCalculation) return "Run the deterministic calculation to confirm eligibility and move the case forward.";
  if (data.status === "Break identified") {
    const expectedCurrency = data.reconciliation.expectedCurrency || data.currency;
    const actualCurrency = data.reconciliation.actualCurrency || expectedCurrency;
    const hasSecurityMovement = Number(data.reconciliation.expectedSecurityQuantity ?? 0) !== 0
      || Number(data.reconciliation.actualSecurityQuantity ?? 0) !== 0;
    const expectedCash = Number(data.reconciliation.expectedCash ?? (hasSecurityMovement ? 0 : data.reconciliation.expected) ?? 0);
    const actualCash = Number(data.reconciliation.actualCash ?? (hasSecurityMovement ? 0 : data.reconciliation.actual) ?? 0);
    const hasCashMovement = expectedCash !== 0 || actualCash !== 0;
    const currencyMismatch = hasCashMovement && expectedCurrency !== actualCurrency;
    const cashDifference = actualCash - expectedCash;
    const securityDifference = Number(data.reconciliation.actualSecurityQuantity ?? 0)
      - Number(data.reconciliation.expectedSecurityQuantity ?? 0);
    const differences = [
      currencyMismatch
        ? `currency mismatch (${expectedCurrency} expected, ${actualCurrency} received)`
        : cashDifference !== 0
          ? `${formatSettlementMoney(Math.abs(cashDifference), expectedCurrency)} cash ${cashDifference < 0 ? "shortfall" : "excess"}`
        : "",
      securityDifference !== 0
        ? `${integer.format(Math.abs(securityDifference))}-share ${securityDifference < 0 ? "shortfall" : "excess"}`
        : "",
    ].filter(Boolean);
    return `Resolve the ${differences.join(" and ") || "settlement difference"} with the custodian, then rerun the match.`;
  }
  if (data.status === "Approved") return "Decision approved. Track settlement.";
  if (data.status === "Awaiting approval" || data.status === "Election submitted") return "Awaiting Compliance approval.";
  if (data.status === "Awaiting settlement") return "Awaiting settlement from custodian.";
  if (isMandatory) return "No election required. Track settlement.";
  if (daysLeft === null) return <>Submit decision by <span className="figure-inline">{data.internalDeadline}</span>.</>;
  if (daysLeft < 0) return <span className="text-destructive font-semibold">The internal deadline has passed. Contact the custodian.</span>;
  if (daysLeft === 0) return <span className="text-amber-700 font-semibold">Due today. Submit decision by <span className="figure-inline">{data.internalDeadline}</span>.</span>;
  return <>Submit decision by <span className="figure-inline">{data.internalDeadline}</span> <span className="text-muted-foreground">({daysLeft} day{daysLeft === 1 ? "" : "s"} left)</span>.</>;
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
  const calculateImpact = useCalculateEvent({
    mutation: {
      onSuccess: () => {
        toast({ title: "Deterministic calculation completed" });
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
      },
      onError: (error: any) => toast({ title: error?.message ?? "Calculation failed", variant: "destructive" }),
    },
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
  const allSchemeImpacts = data.schemeImpacts ?? [];
  const affectedSchemes = allSchemeImpacts.filter((impact) => impact.affected);
  const unaffectedSchemeCount = allSchemeImpacts.length - affectedSchemes.length;
  const reconciliation = data.reconciliation;
  const showSettlement = ["Approved", "Awaiting settlement", "Break identified", "Reconciled"].includes(data.status)
    || Boolean(reconciliation.classification && reconciliation.classification !== "Not due");

  const constraints = affectedSchemes.filter(s => s.flag === "SEBI 10% headroom" || s.flag === "Cash short");
  const showOptions = !isMandatory && (isRightsHero || (data.options ?? []).length > 0);
  const showConstraints = !isMandatory && (isRightsHero || constraints.length > 0);
  const canRunCalculation = !data.isEarlySighting
    && data.validation.isReady
    && !isRightsHero
    && ["Validated", "Under review", "Monitoring"].includes(data.status);
  const canSubmitDecision = !isMandatory
    && !data.isEarlySighting
    && data.validation.isReady
    && (isRightsHero ? data.status === "Validated" : ["Election required", "Awaiting approval"].includes(data.status));
  let sectionNumber = 0;
  const nextSection = () => String(++sectionNumber).padStart(2, "0");
  const noticeIndex = nextSection();
  const impactIndex = nextSection();
  const nextStepsIndex = nextSection();
  const settlementIndex = showSettlement ? nextSection() : "";
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
  const daysLeft = daysUntil(data.internalDeadlineAt);
  const receivedMs = Date.parse(data.receivedAt);
  const deadlineMs = Date.parse(data.internalDeadlineAt);
  const deadlineProgress = Number.isFinite(receivedMs) && Number.isFinite(deadlineMs) && deadlineMs > receivedMs
    ? Math.min(100, Math.max(2, ((Date.now() - receivedMs) / (deadlineMs - receivedMs)) * 100))
    : 0;
  const totalEligibleQuantity = affectedSchemes.reduce((total, scheme: any) => total + Number(scheme.eligibleQuantity ?? 0), 0);
  const totalExpectedCash = affectedSchemes.reduce((total, scheme: any) => total + Number(scheme.cashAmount ?? 0), 0);
  const expectedSettlementSecurities = Number(reconciliation.expectedSecurityQuantity ?? 0);
  const actualSettlementSecurities = Number(reconciliation.actualSecurityQuantity ?? 0);
  const hasSettlementSecurities = expectedSettlementSecurities !== 0 || actualSettlementSecurities !== 0;
  const expectedSettlementCash = Number(reconciliation.expectedCash ?? (hasSettlementSecurities ? 0 : reconciliation.expected) ?? 0);
  const actualSettlementCash = Number(reconciliation.actualCash ?? (hasSettlementSecurities ? 0 : reconciliation.actual) ?? 0);
  const hasSettlementCash = expectedSettlementCash !== 0 || actualSettlementCash !== 0;
  const expectedSettlementCurrency = reconciliation.expectedCurrency || data.currency;
  const actualSettlementCurrency = reconciliation.actualCurrency || expectedSettlementCurrency;
  const settlementCurrencyMismatch = hasSettlementCash && expectedSettlementCurrency !== actualSettlementCurrency;
  const cashSettlementDifference = actualSettlementCash - expectedSettlementCash;
  const cashDifferenceLabel = cashSettlementDifference < 0 ? "Cash shortfall" : cashSettlementDifference > 0 ? "Excess cash" : "Cash difference";
  const securitySettlementDifference = actualSettlementSecurities - expectedSettlementSecurities;
  const securityDifferenceLabel = securitySettlementDifference < 0 ? "Share shortfall" : securitySettlementDifference > 0 ? "Excess shares" : "Share difference";
  const statement1 = actionStatement(data);
  const nextSteps = getNextStepsText(data, isMandatory, daysLeft, canRunCalculation);
  const statement3 = primarySource
    ? <>Received <Figure>{formatIstDate(primarySource.receivedAt)}</Figure> from {isPublicWebDiscovery ? "a public web source" : data.isEarlySighting ? "the exchange" : "your custodian"} ({primarySource.provider}, {primarySource.messageType}). {data.sourceAgreement}</>
    : <>Received <Figure>{formatIstDate(data.receivedAt)}</Figure> from {data.source}. {data.sourceAgreement}</>;
  const statusCopy = data.status === "Validated" && !isRightsHero
    ? "Ready to calculate"
    : fundManagerStatus(data.status, data.isEarlySighting);
  const structuredJudgement = data.judgement?.status === "ok" && data.judgement.summary
    ? structureJudgement(data.judgement.summary)
    : null;
  const showProvenanceSource = data.provenance
    && !/synthetic/i.test(`${data.provenance.channel} ${data.provenance.provider}`);
  const activeJourneyStage = !data.validation.isReady && !isComplete(data.status)
    ? 0
    : journeyStageIndex(data.status, data.isEarlySighting);
  const impactStatus = data.isEarlySighting
    ? "Indicative"
    : !data.validation.isReady
      ? "Inputs incomplete"
      : canRunCalculation
        ? "Ready to run"
      : affectedSchemes.length > 0
      ? "Calculated"
      : allSchemeImpacts.length > 0
        ? "No eligible holding"
        : "Awaiting terms";
  const workflowSteps = [
    {
      label: data.isEarlySighting ? "Confirm the notice" : "Notice confirmed",
      detail: data.isEarlySighting
        ? "The custodian confirms the issuer, terms, dates and eligible quantity."
        : !data.validation.isReady
          ? `Confirm ${data.validation.missingTerms.join(", ") || "the missing terms"} before this notice can progress.`
        : "The source terms and security identifier are ready for portfolio matching.",
    },
    {
      label: "Calculate portfolio impact",
      detail: data.isEarlySighting
        ? "The current figures are indicative and will be recalculated when confirmed terms arrive."
        : !data.validation.isReady
          ? "The figures are preliminary until all required notice terms are confirmed."
        : affectedSchemes.length > 0
          ? `${affectedSchemes.length} of ${allSchemeImpacts.length} schemes are affected; the figures above are the deterministic baseline.`
          : `All ${allSchemeImpacts.length} schemes were checked and none has an eligible holding.`,
    },
    {
      label: isMandatory ? "Process automatically" : "Submit scheme decision",
      detail: isMandatory
        ? "No election is required; expected cash or shares move directly to settlement monitoring."
        : "The Fund Manager selects an option for each affected scheme and submits one package.",
    },
    {
      label: "Compliance review",
      detail: "A second person checks the decision, limits and evidence before any instruction is released.",
    },
    {
      label: "Match settlement",
      detail: "Operations compares cash and shares received with the deterministic expectation and resolves any break.",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[1560px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 border-b border-border pb-3">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              {isPublicWebDiscovery && <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                <Landmark className="h-3.5 w-3.5" />
                <Badge variant="warning">Awaiting custodian confirmation</Badge>
              </div>}
              <h1 className="flex flex-wrap items-center gap-2.5 text-[28px] font-semibold tracking-tight text-foreground">
                <span className="min-w-0">{data.issuer === "Issuer pending confirmation"
                  ? <span>{data.issuer}</span>
                  : <Link href={`/issuers/${issuerIdFor(data.issuer)}`} className="hover:text-primary hover:underline">{data.issuer}</Link>} {data.eventType.toLowerCase()}</span>
                <InfoHint title="This page">
                  One corporate action from start to finish. The strip below shows which of the five steps this case is on. Then, in order: what the company announced, which schemes it touches and for how much money, the decision if one is needed, and the settlement check at the end.
                </InfoHint>
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-foreground">
                {statusCopy} · {affectedSchemes.length} affected scheme{affectedSchemes.length === 1 ? "" : "s"}
                {data.isEarlySighting && (
                  <>
                    {" "}· Indicative impact
                    <InfoHint title="Indicative impact" className="ml-1 align-middle">
                      Estimated from current holdings before the custodian confirms the final terms. The numbers can change when confirmation arrives, and no decision can be submitted until then.
                    </InfoHint>
                  </>
                )}
              </p>
              {data.provenance && (
                <p className="mt-1 text-xs text-muted-foreground">
                  As of <span className="figure-inline">{formatIstDate(data.provenance.asOf)}</span>
                  {showProvenanceSource ? <> · Arrived via {data.provenance.channel} ({data.provenance.provider})</> : null}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/35 bg-accent-soft text-primary">India · {data.currency} only</Badge>
              <Badge variant="outline">{data.reference}</Badge>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          <div className="rounded-md border border-border/60 bg-card px-4 py-3">
            <JourneyStrip activeIndex={journeyStageIndex(data.status, data.isEarlySighting)} />
          </div>
          
          <div className="grid grid-cols-1 gap-0 divide-y divide-border/60 rounded-md border border-border/70 bg-card shadow-sm md:grid-cols-3 md:divide-x md:divide-y-0">
             <div className="bg-stone-50/30 p-4 sm:p-5">
               <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                 What Happened
                 <InfoHint title="What Happened">A summary of the action and terms announced by the issuer.</InfoHint>
               </div>
               <div className="text-sm font-medium leading-relaxed text-foreground">{statement1}</div>
             </div>
             <div className="bg-stone-50/30 p-4 sm:p-5">
               <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                 Portfolio Impact
                 <InfoHint title="Portfolio Impact">The high-level cash and holding effect across all affected Arka schemes.</InfoHint>
               </div>
               {affectedSchemes.length > 0 ? (
                 <div className="text-sm font-medium leading-relaxed text-foreground">
                   <span className="figure">{affectedSchemes.length}</span> scheme{affectedSchemes.length !== 1 && "s"} holding <span className="figure">{integer.format(totalEligibleQuantity)}</span> units.<br/>
                   {totalExpectedCash > 0 && <span className="mt-1 inline-block text-muted-foreground">Expected cash: <span className="figure font-semibold text-foreground">{formatInr(totalExpectedCash)}</span></span>}
                 </div>
               ) : (
                  <div className="text-sm font-medium leading-relaxed text-muted-foreground">
                    {allSchemeImpacts.length > 0
                      ? `All ${allSchemeImpacts.length} schemes were checked. None has an eligible holding.`
                      : "Confirmed terms or a security match are still needed before portfolio impact can be calculated."}
                  </div>
               )}
             </div>
             <div className="flex flex-col justify-between bg-stone-50/30 p-4 sm:p-5">
               <div>
                 <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                   Next Steps
                   <InfoHint title="Next Steps">The immediate action required to advance this case.</InfoHint>
                 </div>
                 <div className="text-sm font-medium leading-relaxed text-foreground">
                    {nextSteps}
                 </div>
               </div>
               {!isMandatory && daysLeft !== null && daysLeft >= 0 && !isComplete(data.status) && data.status !== "Approved" && data.status !== "Awaiting settlement" && (
                 <div className="mt-4">
                   <div className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                     <div className={`h-full rounded-full ${daysLeft <= 3 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${deadlineProgress}%` }} />
                   </div>
                 </div>
               )}
             </div>
          </div>

          {data.isEarlySighting && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
              <strong>Early sighting, indicative only.</strong> {data.decisionBlockedReason}
            </div>
          )}
          <Section index={noticeIndex} title="Notice Terms & Evidence" summary="Confirmed terms and primary source identifiers" hint="The official announcement, extracted terms, identifiers and source agreement used to establish the case." defaultOpen={false}>
            <div className="space-y-2 text-sm leading-6 text-foreground">
              <p>{statement3}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
              <span>ISIN: {data.securityMaster?.isin ?? "N/A"}</span>
              <span>Ticker: {data.securityMaster?.ticker ?? "N/A"}</span>
              <span>Ref: {data.reference}</span>
            </div>
          </Section>

          <Section
            index={impactIndex} 
            title="Deterministic impact"
            hint="Rule-based arithmetic using confirmed notice terms and scheme holdings. It does not depend on AI interpretation."
            status={<Badge variant="outline" className="h-5 border-primary/30 bg-accent-soft px-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary hover:bg-accent-soft">{impactStatus}</Badge>}
            summary={`${data.isEarlySighting || !data.validation.isReady ? "Preliminary arithmetic from the terms received so far; it will rerun when the missing confirmation arrives." : canRunCalculation ? "Preview from confirmed terms; run the calculation to lock eligibility and advance the case." : "The same notice terms and holdings always produce the same result."} No AI involved. ${affectedSchemes.length > 0 ? `${affectedSchemes.length} affected scheme${affectedSchemes.length === 1 ? "" : "s"}${totalExpectedCash > 0 ? ` · ${formatInr(totalExpectedCash)} expected` : ""}` : ""}`}>
            {canRunCalculation && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-accent-soft px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Confirmed terms are ready</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Run the deterministic calculation to lock these scheme results and move this case to its next workflow step.</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => calculateImpact.mutate({ eventId, data: {} })}
                  disabled={calculateImpact.isPending}
                >
                  {calculateImpact.isPending ? "Calculating" : "Run deterministic calculation"}
                </Button>
              </div>
            )}
            {affectedSchemes.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                <ImpactStat label="Schemes checked" value={String(allSchemeImpacts.length)} hint="Total number of active Arka schemes evaluated against the notice terms." />
                <ImpactStat label="Affected schemes" value={String(affectedSchemes.length)} hint="Schemes holding the security on the record date." />
                <ImpactStat label="Eligible quantity" value={integer.format(totalEligibleQuantity)} hint="The combined holdings across all affected schemes." />
                <ImpactStat label="Expected cash" value={totalExpectedCash > 0 ? formatInr(totalExpectedCash) : "None"} hint="The total cash entitlement calculated across the portfolio." />
              </div>
            )}
            <div className="overflow-hidden rounded-md border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead>Scheme</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Eligible Quantity<InfoHint title="Eligible Quantity" className="ml-1 align-bottom">The holding amount qualifying for the corporate action.</InfoHint></TableHead>
                    <TableHead className="text-right whitespace-nowrap">Expected Cash<InfoHint title="Expected Cash" className="ml-1 align-bottom">The computed cash payout for this scheme.</InfoHint></TableHead>
                     <TableHead className="whitespace-nowrap">Calculation<InfoHint title="Calculation" className="ml-1 align-bottom">The formula applied to derive the impact.</InfoHint></TableHead>
                     <TableHead className="whitespace-nowrap">Direction<InfoHint title="Direction" className="ml-1 align-bottom">Whether this action requires funding or generates a receivable.</InfoHint></TableHead>
                     <TableHead className="text-right whitespace-nowrap">NAV impact / unit<InfoHint title="NAV impact" className="ml-1 align-bottom">The isolated effect of this action on the scheme's per-unit Net Asset Value.</InfoHint></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affectedSchemes.map((scheme) => (
                    <TableRow key={scheme.id} className="text-xs">
                      <TableCell><Link href={`/schemes/${scheme.schemeId}`} className="font-semibold text-primary hover:underline">{scheme.schemeName}</Link></TableCell>
                      <TableCell className="figure">{integer.format(scheme.eligibleQuantity)}</TableCell>
                      <TableCell className="figure">{scheme.cashAmount ? formatInr(scheme.cashAmount) : "No cash movement"}</TableCell>
                       <TableCell className="figure text-left text-muted-foreground">{scheme.formula || "Terms applied to eligible quantity"}</TableCell>
                       <TableCell>{scheme.direction}</TableCell>
                       <TableCell className="figure">{scheme.navImpactPaise == null ? "Neutral" : `${scheme.navImpactPaise.toFixed(2)} paise`}</TableCell>
                    </TableRow>
                  ))}
                   {affectedSchemes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-stone-50/30 py-8 text-center">
                        <div className="mx-auto flex max-w-[480px] flex-col items-center justify-center space-y-2 text-center">
                           <span className="text-sm font-semibold text-foreground">
                             {allSchemeImpacts.length > 0 ? "Calculation complete: no scheme affected" : "Calculation waiting for confirmed inputs"}
                           </span>
                          <span className="text-xs leading-relaxed text-muted-foreground">
                             {data.isEarlySighting
                               ? "This is an early sighting. Deterministic impact will run when the custodian confirms the issuer, terms and eligible quantity."
                               : allSchemeImpacts.length > 0
                                 ? `All ${allSchemeImpacts.length} schemes were checked against the confirmed security and record date. None has an eligible holding.`
                                 : "The notice does not yet contain enough confirmed information to match it to the holdings master."}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {allSchemeImpacts.length > 0 && (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Checked <span className="figure-inline">{allSchemeImpacts.length}</span> schemes:
                {" "}<span className="font-semibold text-foreground">{affectedSchemes.length} affected</span>
                {" "}and <span className="figure-inline">{unaffectedSchemeCount}</span> not affected because they have no eligible holding for this security and record date.
                {data.isEarlySighting ? " These results remain indicative until the custodian confirms the terms." : ""}
              </p>
            )}
            {totalExpectedCash > 0 && affectedSchemes.length > 1 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Cash distribution across schemes
                  <InfoHint title="Cash distribution">How the total expected cash is divided among the participating schemes.</InfoHint>
                </div>
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
            index={nextStepsIndex}
            title="What happens next"
            hint="The case lifecycle, current stage and immediate action required to move the case forward."
            status={<Badge variant="outline">{isComplete(data.status) ? "Complete" : "Current step highlighted"}</Badge>}
            summary="From confirmed notice to impact, decision, Compliance review and settlement"
          >
            <div className="grid gap-2 lg:grid-cols-5">
              {workflowSteps.map((step, index) => {
                const complete = activeJourneyStage === 5 || index < activeJourneyStage;
                const current = index === activeJourneyStage;
                return (
                  <div
                    key={step.label}
                    className={`rounded-md border p-3 ${
                      current
                        ? "border-primary/50 bg-accent-soft"
                        : complete
                          ? "border-emerald-200 bg-emerald-50/50"
                          : "border-border/70 bg-stone-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`figure flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        current ? "bg-primary text-primary-foreground" : complete ? "bg-emerald-700 text-white" : "bg-stone-200 text-stone-700"
                      }`}>
                        {index + 1}
                      </span>
                      <span className="text-xs font-semibold text-foreground">{step.label}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                    {current && <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Current step</p>}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 rounded-md border border-primary/25 bg-accent-soft px-4 py-3 text-sm text-foreground">
              <span className="font-semibold">Your next action: </span>{nextSteps}
            </div>
          </Section>

          {showSettlement && (
            <Section
              index={settlementIndex}
              title={data.status === "Break identified" ? "Settlement break and resolution" : "Settlement check"}
              hint="Compares the cash or shares expected from the custodian with what actually arrived and lists any resolution steps."
              status={
                <Badge
                  variant="outline"
                  className={data.status === "Break identified" ? "border-rose-300 bg-rose-50 text-rose-700" : ""}
                >
                  {reconciliation.classification || reconciliation.status}
                </Badge>
              }
              summary={data.status === "Break identified"
                ? "What was expected, what arrived, the difference and the actions needed to close the break"
                : "Expected versus actual cash and shares from the custodian"}
            >
              <p className="mb-3 text-xs leading-5 text-muted-foreground">
                This settlement check covers account <span className="figure-inline font-semibold text-foreground">{reconciliation.expectedAccount || "not yet assigned"}</span>.
                {" "}The deterministic impact above covers all <span className="figure-inline">{affectedSchemes.length}</span> affected schemes.
              </p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {hasSettlementCash && (
                  <>
                    <ImpactStat label="Expected cash" value={formatSettlementMoney(expectedSettlementCash, expectedSettlementCurrency)} hint="The deterministic cash amount calculated by Arka." />
                    <ImpactStat label="Cash received" value={formatSettlementMoney(actualSettlementCash, actualSettlementCurrency)} hint="The actual cash amount reported by the custodian." />
                    <ImpactStat
                      label={settlementCurrencyMismatch ? "Currency mismatch" : cashDifferenceLabel}
                      value={settlementCurrencyMismatch
                        ? `${expectedSettlementCurrency} expected · ${actualSettlementCurrency} received`
                        : formatSettlementMoney(Math.abs(cashSettlementDifference), expectedSettlementCurrency)}
                      hint="The variance between expected and received cash. A non-zero value requires investigation."
                    />
                  </>
                )}
                {(expectedSettlementSecurities !== 0 || actualSettlementSecurities !== 0) && (
                  <>
                    <ImpactStat label="Expected shares" value={integer.format(expectedSettlementSecurities)} hint="The deterministic security quantity expected." />
                    <ImpactStat label="Shares received" value={integer.format(actualSettlementSecurities)} hint="The actual security quantity received in the account." />
                    <ImpactStat label={securityDifferenceLabel} value={integer.format(Math.abs(securitySettlementDifference))} hint="The variance between expected and received securities." />
                  </>
                )}
                <ImpactStat
                  label="Settlement date"
                  value={formatSettlementDate(reconciliation.actualSettlementDate || reconciliation.expectedSettlementDate)}
                  hint="When the cash or securities were settled."
                />
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr,1fr]">
                <div className={`rounded-md border px-4 py-3 ${data.status === "Break identified" ? "border-rose-300 bg-rose-50" : "border-border/70 bg-stone-50"}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">What happened</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-foreground">{reconciliation.note || "Settlement is waiting for custodian confirmation."}</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>Expected account: <span className="figure-inline text-foreground">{reconciliation.expectedAccount || "Not set"}</span></span>
                    <span>Actual account: <span className="figure-inline text-foreground">{reconciliation.actualAccount || "Pending"}</span></span>
                    <span>Expected currency: <span className="figure-inline text-foreground">{expectedSettlementCurrency}</span></span>
                    <span>Actual currency: <span className="figure-inline text-foreground">{actualSettlementCurrency}</span></span>
                  </div>
                </div>

                <div className="rounded-md border border-primary/30 bg-accent-soft px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Next actions</p>
                  {data.status === "Break identified" && (reconciliation.investigationSteps ?? []).length > 0 ? (
                    <ol className="mt-2 space-y-2">
                      {(reconciliation.investigationSteps ?? []).map((step, index) => (
                        <li key={step} className="flex gap-2 text-sm leading-5 text-foreground">
                          <span className="figure flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{index + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                      <li className="flex gap-2 text-sm leading-5 text-foreground">
                        <span className="figure flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{(reconciliation.investigationSteps ?? []).length + 1}</span>
                        <span>Record the corrected receipt and rerun the settlement match to close the case.</span>
                      </li>
                    </ol>
                  ) : data.status === "Reconciled" ? (
                    <p className="mt-2 text-sm leading-6 text-foreground">No further action. The actual settlement matches the deterministic expectation and the result is recorded in History.</p>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-foreground">Monitor the custodian receipt, record the actual cash and shares, then compare them with the deterministic expectation shown here.</p>
                  )}
                </div>
              </div>
            </Section>
          )}

          <Section
            index={judgementIndex}
            title="AI interpretation (optional)"
            hint="A structured recommendation covering portfolio impact, risk, controls and missing information."
            summary={data.judgement?.status === "ok" ? "Recommendation, portfolio impact, risk and missing information" : "The AI explains what the deterministic numbers mean. Advice only; it cannot change a figure."}
            defaultOpen={Boolean(structuredJudgement)}
          >
            {structuredJudgement ? (
              <>
                <div className="grid items-start gap-3 lg:grid-cols-2">
                  <JudgementBlock label="Recommended action" text={structuredJudgement.recommendation} emphasis hint="The AI's suggested next step based on the deterministic calculation and risk context." />
                  <JudgementBlock label="Portfolio impact" text={structuredJudgement.impact} hint="A plain-language summary of how this action affects the holding schemes." />
                  <JudgementBlock label="Risk and controls" text={structuredJudgement.risk} hint="Identified cap breaches, liquidity limits, or concentration risks." />
                  <JudgementBlock label="Missing information" text={structuredJudgement.missing} hint="Notice terms required for a final decision that are currently absent." />
                </div>
                <div className="mt-3 flex justify-end border-t border-border/50 pt-3">
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
                    ? "Judgement is unavailable for this run. The model response introduced a figure that does not appear in the deterministic output, so it was rejected and the authoritative impact figures above stand alone."
                    : "Judgement is unavailable. The deterministic impact figures above stand alone."}
                </p>
                {data.judgement.rejectedReason && <p className="max-w-3xl text-xs text-muted-foreground">{data.judgement.rejectedReason}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Button size="sm" variant="outline" onClick={() => generateJudgement.mutate({ eventId })} disabled={generateJudgement.isPending}>
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${generateJudgement.isPending ? "animate-spin" : ""}`} />
                    {generateJudgement.isPending ? "Re-running" : "Try again"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Not run yet. The AI judgement reads the deterministic output above plus portfolio context and writes the trade-off, what to do first, and what is missing from the notice. It can cite impact figures but is structurally blocked from introducing or changing a number.
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
                <Section index={optionsIndex} title="Options" summary="Three ways to treat the rights entitlement" hint="The available treatments for an elective corporate action and the outcome of each choice.">
                  <div className="grid gap-3 text-sm md:grid-cols-3">
                      <div><strong className="text-foreground">Exercise</strong><p className="mt-1 text-muted-foreground">Subscribe at {formatInr(subscriptionPrice)}. Costs cash and keeps your holding whole.</p><p className="figure mt-2 text-left font-semibold">Pay {formatInr(totalEntitlementRights * subscriptionPrice)}, receive {integer.format(totalEntitlementRights)} shares</p></div>
                      <div><strong className="text-foreground">Sell entitlement</strong><p className="mt-1 text-muted-foreground">Sell the RE on NSE/BSE before the RE window closes.</p><p className="figure mt-2 text-left font-semibold">Recover about {formatInr(totalEntitlementRights * rightsValue)}, no funding needed</p></div>
                      <div><strong className="text-foreground">Let lapse</strong><p className="mt-1 text-muted-foreground">Do nothing and allow the entitlement to expire.</p><p className="figure mt-2 text-left font-semibold">Forfeit {formatInr(totalEntitlementRights * rightsValue)}</p></div>
                  </div>
                </Section>
              ) : data.options && data.options.length > 0 && (
                <Section index={optionsIndex} title="Options" summary={`${data.options.length} choices · default is ${data.options.find((opt) => opt.default)?.label.toLowerCase() ?? "not set"}`} hint="The available treatments for this elective corporate action, including the default if no choice is submitted.">
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
                <Section index={constraintsIndex} title="Constraints" summary="Headroom and liquidity limits that block full exercise" hint="Funding, concentration and eligibility limits that restrict which decisions can be submitted.">
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
                <Section index={constraintsIndex} title="Constraints" summary={`${constraints.length} scheme${constraints.length === 1 ? "" : "s"} flagged`} hint="Funding, concentration and eligibility limits that require attention before a decision is submitted.">
                  <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-4">
                    {constraints.map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-xs text-destructive font-medium">
                        <AlertTriangle className="h-4 w-4" /> {c.schemeName}: {c.flag}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section index={decisionIndex} title="Decision" summary="Set scheme elections and submit for checker approval" hint="The maker records each scheme choice here and sends the complete package to an independent checker.">
                <div className="space-y-4">
                  {!canSubmitDecision && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                      <strong>Decision controls are not available.</strong>{" "}
                      {data.isEarlySighting
                        ? "The custodian must confirm the notice before an election can be submitted."
                        : !data.validation.isReady
                          ? `Confirm ${data.validation.missingTerms.join(", ") || "the missing terms"} first.`
                          : "This case has already moved beyond the Fund Manager decision step."}
                    </div>
                  )}
                  {isRightsHero && canSubmitDecision ? rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible").map((row: any) => (
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
                  )) : !isRightsHero && (
                    <div className="overflow-hidden rounded-md border border-border/70">
                      {affectedSchemes.map((impact: any, rowIndex: number) => (
                        <div key={impact.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${rowIndex > 0 ? "border-t border-border/60" : ""}`}>
                          <div className="min-w-[220px] flex-1">
                            <span className="text-sm font-semibold text-foreground">{impact.schemeName}</span>
                            <span className="figure-inline ml-2 text-xs text-muted-foreground">Entitlement: {integer.format(impact.quantityResult ?? impact.eligibleQuantity)}</span>
                          </div>
                          {impact.electionDecision ? (
                            <Badge variant="outline">{impact.electionDecision.optionLabel} · {impact.electionDecision.quantityElected} · {impact.approval}</Badge>
                          ) : canSubmitDecision ? (
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
                          ) : (
                            <Badge variant="outline">No election available</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {isRightsHero && canSubmitDecision && <Card className="rounded border-border bg-warning/5 shadow-none"><CardContent className="space-y-3 p-5"><div className="grid gap-2 text-sm sm:grid-cols-4"><span className="figure text-left">Exercise <strong>{integer.format(totals.exercise)}</strong></span><span className="figure text-left">ASBA funding <strong>{formatInr(totals.cash)}</strong></span><span className="figure text-left">Sell <strong>{integer.format(totals.sell)}</strong> rights</span><span className="figure text-left">Value forfeited <strong>{formatInr(totals.forfeited * rightsValue)}</strong></span></div><Button disabled={blockedRights.length > 0 || saveArka.isPending || submitArka.isPending} onClick={() => saveArka.mutate({ data: { decisions: rightsRows.filter((row: any) => row.eligibilityStatus === "Eligible").map((row: any) => ({ schemeId: row.id, rights: rightsOption(row.id) === "exercise" ? rightsQty(row) : 0 })) } }, { onSuccess: () => submitArka.mutate() })}>{blockedRights.length > 0 ? `Resolve blocked schemes: ${blockedRights.map((row: any) => row.name).join(", ")}` : "Submit to Compliance"}</Button></CardContent></Card>}
                </div>
              </Section>
            </>
          )}

          <Section index={historyIndex} title="History" summary={`${(data.audit ?? []).length} recorded step${(data.audit ?? []).length === 1 ? "" : "s"}`} hint="The chronological audit trail of notice updates, calculations, decisions, approvals and settlement activity." defaultOpen={false}>
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
