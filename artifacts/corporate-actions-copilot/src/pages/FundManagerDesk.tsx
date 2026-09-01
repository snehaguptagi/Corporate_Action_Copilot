import { useEffect, useMemo, useState } from "react";
import {
  getGetArkaDeskQueryKey,
  useApproveArkaDesk,
  useGetArkaDesk,
  useGetSession,
  useSaveArkaDeskDecisions,
  useSubmitArkaDesk,
  type ArkaSchemeImpact,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  Gauge,
  IndianRupee,
  Landmark,
  LockKeyhole,
  Scale,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

function SectionHeading({
  index,
  eyebrow,
  title,
  description,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#dc6900] text-xs font-bold text-white">
        {index}
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#dc6900]">{eyebrow}</div>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-[#5b1235]">{title}</h2>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function FundManagerDesk() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useGetArkaDesk();
  const { data: actor } = useGetSession();
  const [draftRights, setDraftRights] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setDraftRights(Object.fromEntries(data.schemes.map((scheme) => [scheme.id, String(scheme.decisionRights)])));
  }, [data]);

  const saveDecisions = useSaveArkaDeskDecisions({
    mutation: {
      onSuccess: (next) => queryClient.setQueryData(getGetArkaDeskQueryKey(), next),
    },
  });
  const submitDesk = useSubmitArkaDesk({
    mutation: {
      onSuccess: (next) => queryClient.setQueryData(getGetArkaDeskQueryKey(), next),
    },
  });
  const approveDesk = useApproveArkaDesk({
    mutation: {
      onSuccess: (next) => queryClient.setQueryData(getGetArkaDeskQueryKey(), next),
    },
  });

  const liveSchemes = useMemo(() => {
    if (!data) return [];
    return data.schemes.map((scheme) => {
      const draft = draftRights[scheme.id];
      const parsed = draft === undefined || draft.trim() === "" ? Number.NaN : Number(draft);
      const decisionRights = Number.isInteger(parsed) && parsed >= 0 ? parsed : scheme.decisionRights;
      const capBlocked = scheme.maxRightsByCap != null && decisionRights > scheme.maxRightsByCap;
      const cashBlocked = scheme.maxRightsByCash != null && decisionRights > scheme.maxRightsByCash;
      const invalid = !Number.isInteger(parsed) || parsed < 0 || parsed > scheme.entitlementRights;
      const blockers = [
        invalid ? "Enter a whole number within the scheme entitlement." : null,
        capBlocked ? `SEBI 10% limit allows ${integer.format(scheme.maxRightsByCap ?? 0)} rights.` : null,
        cashBlocked ? `Cash budget supports ${integer.format(scheme.maxRightsByCash ?? 0)} rights.` : null,
      ].filter((item): item is string => Boolean(item));
      const exerciseCashCrore = decisionRights * data.event.subscriptionPrice / 10_000_000;
      return {
        ...scheme,
        decisionRights,
        exerciseCashCrore,
        forfeitedRights: Math.max(0, scheme.entitlementRights - decisionRights),
        navHitPercent: scheme.fullCashCrore === 0 ? 0 : scheme.navHitPercent * exerciseCashCrore / scheme.fullCashCrore,
        navHitPaise: scheme.fullCashCrore === 0 ? 0 : scheme.navHitPaise * exerciseCashCrore / scheme.fullCashCrore,
        blockers: scheme.eligibilityStatus === "Excluded" ? [] : blockers,
      };
    });
  }, [data, draftRights]);

  const liveTotals = useMemo(() => {
    const eligible = liveSchemes.filter((scheme) => scheme.eligibilityStatus === "Eligible");
    return {
      decisionRights: eligible.reduce((sum, scheme) => sum + scheme.decisionRights, 0),
      cashCrore: eligible.reduce((sum, scheme) => sum + scheme.exerciseCashCrore, 0),
      forfeited: eligible.reduce((sum, scheme) => sum + Math.max(0, scheme.entitlementRights - scheme.decisionRights), 0),
      blocked: eligible.filter((scheme) => scheme.blockers.length > 0),
    };
  }, [liveSchemes]);

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading Arka scheme impacts...</div>;
  }
  if (isError || !data) {
    return <div className="flex flex-1 items-center justify-center text-sm text-destructive">The fund manager desk could not be loaded.</div>;
  }

  const isFundManager = actor?.role === "Fund Manager";
  const isCompliance = actor?.role === "Compliance";
  const pendingCheck = data.submission?.status === "Pending Compliance Check";

  const persistDecision = (scheme: ArkaSchemeImpact, value?: number) => {
    if (!isFundManager) return;
    const next = value ?? Number(draftRights[scheme.id]);
    if (!Number.isInteger(next) || next < 0 || next > scheme.entitlementRights) return;
    setDraftRights((current) => ({ ...current, [scheme.id]: String(next) }));
    saveDecisions.mutate({ data: { decisions: [{ schemeId: scheme.id, rights: next }] } });
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
              <h1 className="text-2xl font-semibold tracking-tight text-[#5b1235] sm:text-3xl">Bharat Renewables rights decision</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                One controlled view for eligibility, scheme impact, funding and issuer-limit decisions.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Confirmed notice
              </Badge>
              <Badge variant="outline" className="border-[#e5a15f] bg-[#fff8ef] text-[#9d4d00]">India · INR only</Badge>
              <Badge variant="outline">{data.event.reference}</Badge>
            </div>
          </div>
        </header>

        <div className="space-y-5">
          <section>
            <SectionHeading index="01" eyebrow="The book" title="Ten Arka schemes in scope" description="A single record-date view of the Indian mutual-fund book. Excluded schemes remain visible so the population can be reconciled." />
            <Card className="rounded-md border-[#d8d1cb] shadow-none">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#f1eeea] hover:bg-[#f1eeea]">
                      <TableHead className="w-[29%]">Scheme</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">AUM</TableHead>
                      <TableHead className="text-right">NAV</TableHead>
                      <TableHead className="text-right">BR holding</TableHead>
                      <TableHead>Record-date status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.schemes.map((scheme) => (
                      <TableRow key={scheme.id} className="text-xs">
                        <TableCell>
                          <div className="font-semibold text-[#5b1235]">{scheme.name}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{scheme.schemeCode}</div>
                        </TableCell>
                        <TableCell>{scheme.category}</TableCell>
                        <TableCell className="text-right font-mono">{crore(scheme.aumCrore)}</TableCell>
                        <TableCell className="text-right font-mono">{rupees(scheme.navPaise / 100)}</TableCell>
                        <TableCell className="text-right font-mono">{integer.format(scheme.holdingQuantity)}</TableCell>
                        <TableCell>
                          {scheme.eligibilityStatus === "Eligible"
                            ? <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Eligible</Badge>
                            : <div><Badge variant="secondary">Excluded</Badge><div className="mt-1 text-[10px] text-muted-foreground">{scheme.exclusionReason}</div></div>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section>
            <SectionHeading index="02" eyebrow="Confirmed event" title="Notice terms and calendar" description="Confirmed terms are paired with the security master so the ordinary-share ISIN and separate rights-entitlement ISIN cannot be confused." />
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <Card className="rounded-md border-[#d8d1cb] shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base text-[#5b1235]">{data.event.issuer}</CardTitle>
                      <CardDescription>{data.event.classification} · {data.event.exchange}</CardDescription>
                    </div>
                    <Badge className="bg-[#dc6900] text-white hover:bg-[#dc6900]">{data.event.rightsRatio}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Metric icon={IndianRupee} label="CMP" value={rupees(data.event.cmp)} />
                    <Metric icon={CircleDollarSign} label="Subscription" value={rupees(data.event.subscriptionPrice)} />
                    <Metric icon={ArrowDownRight} label="Discount" value={`${decimal.format((1 - data.event.subscriptionPrice / data.event.cmp) * 100)}%`} />
                  </div>
                  <Separator className="my-4" />
                  <div className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                    <Detail label="Ordinary ISIN" value={data.securityMaster.isin} mono />
                    <Detail label="Rights entitlement ISIN" value={data.securityMaster.reIsin} mono />
                    <Detail label="Ticker" value={data.securityMaster.ticker} />
                    <Detail label="Security status" value={`${data.securityMaster.status} · ${data.securityMaster.market}`} />
                    <Detail label="Source" value={data.event.source} />
                    <Detail label="Currency" value={data.securityMaster.currency} />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-md border-[#d8d1cb] shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-[#5b1235]"><CalendarDays className="h-4 w-4 text-[#dc6900]" /> Decision calendar</CardTitle>
                  <CardDescription>Internal time remains ahead of the market deadline.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 text-xs sm:grid-cols-3">
                  <CalendarItem label="Notice received" value={data.calendar.receivedDate} />
                  <CalendarItem label="Ex-rights date" value={data.calendar.exRightsDate} />
                  <CalendarItem label="Record date" value={data.calendar.recordDate} />
                  <CalendarItem label="Fund deadline" value={data.calendar.fundDeadline} emphasis />
                  <CalendarItem label="Market deadline" value={data.calendar.marketDeadline} emphasis />
                  <CalendarItem label="Settlement" value={data.calendar.settlementDate} />
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <SectionHeading index="03" eyebrow="Eligibility" title="Population funnel and exclusions" description="Each scheme passes three ordered tests: equity ISIN held, held on record date, then active folio." />
            <Card className="rounded-md border-[#d8d1cb] shadow-none">
              <CardContent className="p-5">
                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-center">
                    <FunnelMetric label="Scheme universe" value={data.funnel.universe} tone="maroon" />
                    <ArrowRight className="mx-auto hidden h-4 w-4 text-[#9b8f88] sm:block" />
                    <FunnelMetric label="Holds equity ISIN" value={data.funnel.holdsEquityIsin} tone="green" />
                    <ArrowRight className="mx-auto hidden h-4 w-4 text-[#9b8f88] sm:block" />
                    <FunnelMetric label="Held on record date" value={data.funnel.heldOnRecordDate} tone="green" />
                    <ArrowRight className="mx-auto hidden h-4 w-4 text-[#9b8f88] sm:block" />
                    <FunnelMetric label="Folio active" value={data.funnel.folioActive} tone="green" />
                  </div>
                  <div className="border-t border-[#ded8d2] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Excluded from entitlement</div>
                    <div className="mt-3 space-y-2">
                      {data.funnel.exclusionReasons.map((item) => (
                        <div key={item.scheme} className="flex gap-2 text-xs">
                          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#dc6900]" />
                          <div><span className="font-semibold text-[#5b1235]">{item.scheme}</span><span className="text-muted-foreground"> · {item.reason}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <SectionHeading index="04" eyebrow="Scheme impact" title="Economics, NAV hit and issuer exposure" description="All monetary calculations use integer paise. The SEBI rule is named, configurable and solved against post-exercise issuer exposure." />
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric icon={Scale} label="TERP" value={rupees(data.terms.terp, 4)} />
              <Metric icon={Gauge} label="Right value" value={rupees(data.terms.rightValue, 4)} />
              <Metric icon={ArrowDownRight} label="Dilution" value={rupees(data.terms.dilution, 4)} />
              <Metric icon={WalletCards} label="Total rights" value={integer.format(data.terms.totalRights)} />
              <Metric icon={Banknote} label="Full exercise cash" value={crore(data.terms.totalExerciseCashCrore)} />
            </div>
            <Card className="rounded-md border-[#d8d1cb] shadow-none">
              <CardHeader className="border-b border-[#e1dbd5] bg-[#fffaf4] py-3">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <CardTitle className="text-sm text-[#5b1235]">{data.rule.name}</CardTitle>
                    <CardDescription className="mt-1 text-xs">{data.rule.description}</CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit border-[#e5a15f] text-[#9d4d00]">{data.rule.limitPercent}% maximum</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#f1eeea] hover:bg-[#f1eeea]">
                      <TableHead>Scheme</TableHead>
                      <TableHead className="text-right">Entitlement</TableHead>
                      <TableHead className="text-right">Full cash</TableHead>
                      <TableHead className="text-right">NAV hit</TableHead>
                      <TableHead className="w-[30%]">Issuer exposure after decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.schemes.map((scheme) => (
                      <TableRow key={scheme.id} className="text-xs">
                        <TableCell className="font-semibold text-[#5b1235]">{scheme.name}</TableCell>
                        <TableCell className="text-right font-mono">{scheme.eligibilityStatus === "Eligible" ? integer.format(scheme.entitlementRights) : "N/A"}</TableCell>
                        <TableCell className="text-right font-mono">{scheme.eligibilityStatus === "Eligible" ? crore(scheme.fullCashCrore) : "N/A"}</TableCell>
                        <TableCell className="text-right">
                          {scheme.eligibilityStatus === "Eligible" ? <><div className="font-mono">{decimal.format(scheme.navHitPaise)} paise / ₹100</div><div className="text-[10px] text-muted-foreground">{decimal.format(scheme.navHitPercent)}%</div></> : "N/A"}
                        </TableCell>
                        <TableCell>
                          {scheme.eligibilityStatus === "Eligible" ? (
                            <div>
                              <div className="mb-1.5 flex justify-between text-[10px]">
                                <span>{decimal.format(scheme.capUsagePercent)}%</span>
                                <span className="text-muted-foreground">Limit 10.00%</span>
                              </div>
                              <Progress value={Math.min(100, scheme.capUsagePercent * 10)} className="h-1.5 bg-[#eadfd5] [&>div]:bg-[#dc6900]" />
                            </div>
                          ) : <span className="text-muted-foreground">Not applicable</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <section>
            <SectionHeading index="05" eyebrow="Your decision" title="Set scheme elections and submit for compliance" description="Every eligible scheme defaults to full exercise. The submit gate remains closed until issuer-limit and funding constraints are resolved." />
            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
              <Card className="rounded-md border-[#d8d1cb] shadow-none">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#f1eeea] hover:bg-[#f1eeea]">
                        <TableHead>Scheme decision</TableHead>
                        <TableHead className="text-right">Entitlement</TableHead>
                        <TableHead className="w-[190px]">Rights to exercise</TableHead>
                        <TableHead className="text-right">Exercise cash</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {liveSchemes.map((scheme) => (
                        <TableRow key={scheme.id} className="align-top text-xs">
                          <TableCell>
                            <div className="font-semibold text-[#5b1235]">{scheme.name}</div>
                            {scheme.forfeitedRights > 0 && <div className="mt-1 text-[10px] text-muted-foreground">{integer.format(Math.max(0, scheme.entitlementRights - scheme.decisionRights))} rights forfeited</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{scheme.eligibilityStatus === "Eligible" ? integer.format(scheme.entitlementRights) : "N/A"}</TableCell>
                          <TableCell>
                            {scheme.eligibilityStatus === "Eligible" ? (
                              <div>
                                <input
                                  aria-label={`${scheme.name} rights to exercise`}
                                  type="number"
                                  min={0}
                                  max={scheme.entitlementRights}
                                  step={1}
                                  value={draftRights[scheme.id] ?? scheme.decisionRights}
                                  disabled={!isFundManager || scheme.decisionReadOnly || saveDecisions.isPending}
                                  onChange={(event) => setDraftRights((current) => ({ ...current, [scheme.id]: event.target.value }))}
                                  onBlur={() => persistDecision(scheme)}
                                  className="w-full rounded border border-input bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-[#dc6900] focus:ring-1 focus:ring-[#dc6900] disabled:bg-muted"
                                />
                                {scheme.decisionReadOnlyReason && <div className="mt-1 text-[10px] text-muted-foreground">{scheme.decisionReadOnlyReason}</div>}
                                {!scheme.decisionReadOnly && (scheme.maxRightsByCap !== null || scheme.maxRightsByCash !== null) && (
                                  <button
                                    type="button"
                                    disabled={!isFundManager}
                                    onClick={() => persistDecision(scheme, Math.min(scheme.entitlementRights, scheme.maxRightsByCap ?? Infinity, scheme.maxRightsByCash ?? Infinity))}
                                    className="mt-1 text-[10px] font-semibold text-[#c55a00] hover:underline disabled:text-muted-foreground"
                                  >
                                    Use permitted maximum
                                  </button>
                                )}
                              </div>
                            ) : <span className="text-muted-foreground">No election</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{scheme.eligibilityStatus === "Eligible" ? crore(scheme.exerciseCashCrore) : "N/A"}</TableCell>
                          <TableCell>
                            {scheme.eligibilityStatus === "Excluded" ? (
                              <Badge variant="secondary">Excluded</Badge>
                            ) : scheme.blockers.length > 0 ? (
                              <div className="max-w-xs space-y-1">
                                <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> Blocked</Badge>
                                {scheme.blockers.map((blocker) => <div key={blocker} className="text-[10px] leading-4 text-destructive">{blocker}</div>)}
                              </div>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50"><Check className="mr-1 h-3 w-3" /> Ready</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="rounded-md border-[#d8d1cb] shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-[#5b1235]">Live election total</CardTitle>
                    <CardDescription>Calculated from the current scheme rows.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <SummaryLine label="Rights to exercise" value={integer.format(liveTotals.decisionRights)} />
                    <SummaryLine label="Funding required" value={crore(liveTotals.cashCrore)} strong />
                    <SummaryLine label="Rights forfeited" value={integer.format(liveTotals.forfeited)} />
                    <Separator />
                    <SummaryLine label="Blocked schemes" value={String(liveTotals.blocked.length)} warning={liveTotals.blocked.length > 0} />
                    {liveTotals.blocked.map((scheme) => (
                      <div key={scheme.id} className="rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] leading-4 text-red-700">{scheme.name}</div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="rounded-md border-[#d8d1cb] shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-[#5b1235]"><ShieldCheck className="h-4 w-4 text-[#dc6900]" /> Maker-checker control</CardTitle>
                    <CardDescription>Fund Manager prepares. Compliance independently checks.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.submission ? (
                      <div className="rounded border border-[#ded8d2] bg-[#faf8f5] p-3 text-xs">
                        <div className="font-semibold text-[#5b1235]">{data.submission.status}</div>
                        <div className="mt-1 text-muted-foreground">Prepared by {data.submission.submittedByName}</div>
                        {data.submission.checkedByName && <div className="mt-1 text-muted-foreground">Checked by {data.submission.checkedByName}</div>}
                      </div>
                    ) : (
                      <div className="rounded border border-[#ded8d2] bg-[#faf8f5] p-3 text-xs text-muted-foreground">No submission has been sent to Compliance.</div>
                    )}

                    {isCompliance && pendingCheck ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={() => approveDesk.mutate({ data: { status: "Returned" } })} disabled={approveDesk.isPending}>Return</Button>
                        <Button onClick={() => approveDesk.mutate({ data: { status: "Approved" } })} disabled={approveDesk.isPending}>Approve</Button>
                      </div>
                    ) : (
                      <Button
                        className="w-full bg-[#dc6900] hover:bg-[#b85700]"
                        disabled={!isFundManager || liveTotals.blocked.length > 0 || submitDesk.isPending || saveDecisions.isPending}
                        onClick={() => submitDesk.mutate()}
                      >
                        <FileCheck2 className="mr-2 h-4 w-4" />
                        Submit to Compliance
                      </Button>
                    )}
                    {!isFundManager && !isCompliance && <p className="text-[10px] leading-4 text-muted-foreground">Switch to the Fund Manager demo operator to prepare decisions.</p>}
                    {isFundManager && liveTotals.blocked.length > 0 && <p className="text-[10px] leading-4 text-destructive">Submission disabled until all scheme constraints are resolved.</p>}
                    {(saveDecisions.isError || submitDesk.isError || approveDesk.isError) && <p className="text-[10px] leading-4 text-destructive">The action was not accepted. Review the role and scheme constraints, then try again.</p>}
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d8d1cb] bg-white p-3 shadow-none">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5 text-[#dc6900]" />{label}</div>
      <div className="mt-2 font-mono text-sm font-semibold text-[#5b1235]">{value}</div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 leading-5 text-[#322823] ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}

function CalendarItem({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={emphasis ? "rounded border border-[#edb57e] bg-[#fff8ef] p-2.5" : "p-2.5"}><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 font-mono leading-5 ${emphasis ? "font-semibold text-[#9d4d00]" : "text-[#322823]"}`}>{value}</div></div>;
}

function FunnelMetric({ label, value, tone }: { label: string; value: number; tone: "maroon" | "green" | "orange" }) {
  const styles = tone === "maroon" ? "border-[#c9aab8] bg-[#faf4f7] text-[#5b1235]" : tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-orange-200 bg-orange-50 text-[#a34e00]";
  return <div className={`rounded-md border p-4 text-center ${styles}`}><div className="font-mono text-2xl font-semibold">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider">{label}</div></div>;
}

function SummaryLine({ label, value, strong = false, warning = false }: { label: string; value: string; strong?: boolean; warning?: boolean }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={`font-mono ${strong ? "font-bold text-[#5b1235]" : ""} ${warning ? "font-bold text-destructive" : ""}`}>{value}</span></div>;
}