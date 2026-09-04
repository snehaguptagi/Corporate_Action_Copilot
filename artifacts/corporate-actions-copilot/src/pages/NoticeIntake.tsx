import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  Check,
  LoaderCircle,
  Radar,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAnalysisQueryKey,
  getGetDashboardQueryKey,
  getListEventsQueryKey,
  getListIssuersQueryKey,
  getListSchemesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/InfoHint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed with status ${response.status}.`);
  return body as T;
}

type StepStatus = "pending" | "active" | "done" | "error";

type PipelineStep = {
  id: string;
  label: string;
  explanation: string;
  status: StepStatus;
  detail?: string;
};

const initialSteps: PipelineStep[] = [
  { id: "capture", label: "Record the source", explanation: "The notice URL is recorded as the case's evidence pointer.", status: "pending" },
  { id: "extract", label: "Pull and extract the facts", explanation: "The page is retrieved and dates, ratios, prices, and identifiers are read out of it.", status: "pending" },
  { id: "validate", label: "Validate the terms", explanation: "Each extracted term is checked against what the source actually says.", status: "pending" },
  { id: "create", label: "Match holdings and compute impacts", explanation: "The issuer is matched against the ten Arka schemes and indicative impacts are computed for every holding.", status: "pending" },
];

function StepRow({ step, index }: { step: PipelineStep; index: number }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        step.status === "done" ? "bg-success text-white"
        : step.status === "active" ? "bg-primary text-primary-foreground"
        : step.status === "error" ? "bg-destructive text-white"
        : "border border-slate-300 bg-white text-slate-500"
      }`}>
        {step.status === "done" ? <Check className="h-3.5 w-3.5" />
          : step.status === "active" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          : step.status === "error" ? <AlertCircle className="h-3.5 w-3.5" />
          : index + 1}
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-medium ${step.status === "pending" ? "text-slate-400" : "text-slate-900"}`}>{step.label}</p>
        <p className="text-xs leading-5 text-slate-500">{step.detail ?? step.explanation}</p>
      </div>
    </li>
  );
}

export default function NoticeIntake() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [sourceUrl, setSourceUrl] = useState(() => new URLSearchParams(window.location.search).get("sourceUrl") ?? "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);
  const [cameFromDiscovery] = useState(() => Boolean(new URLSearchParams(window.location.search).get("sourceUrl")));
  const autoStarted = useRef(false);

  const setStep = (id: string, status: StepStatus, detail?: string) => {
    setSteps((previous) => previous.map((step) => (step.id === id ? { ...step, status, detail: detail ?? step.detail } : step)));
  };

  const runPipeline = async (url: string) => {
    if (!url.trim()) {
      setErrorMsg("Paste the public URL of the notice to capture.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setSteps(initialSteps.map((step) => ({ ...step })));
    let activeStep = "capture";

    try {
      setStep("capture", "active");
      const draft = await requestJson<{ id: string }>("/api/intake/drafts", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "url",
          sourceLabel: "Public web discovery",
          sourceUrl: url.trim(),
        }),
      });
      setStep("capture", "done", "Source URL recorded. The evidence itself is pulled in the next step.");

      activeStep = "extract";
      setStep("extract", "active");
      const extracted = await requestJson<{ terms: { key: string; value: string }[] }>(`/api/intake/drafts/${draft.id}/extract`, { method: "POST" });
      setStep("extract", "done", `Retrieved the page and extracted ${extracted.terms.length} term${extracted.terms.length === 1 ? "" : "s"}.`);

      activeStep = "validate";
      setStep("validate", "active");
      await requestJson(`/api/intake/drafts/${draft.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ terms: extracted.terms.map(({ key, value }) => ({ key, value })) }),
      });
      setStep("validate", "done", "Every term traces back to the captured evidence.");

      activeStep = "create";
      setStep("create", "active");
      const event = await requestJson<{ id: string; affectedAccounts?: number }>(`/api/intake/drafts/${draft.id}/create-case`, { method: "POST" });
      const heldCount = Number(event.affectedAccounts ?? 0);
      setStep("create", "done", heldCount > 0
        ? `${heldCount} scheme${heldCount === 1 ? " holds" : "s hold"} this issuer. Indicative impacts are ready; opening the case.`
        : "No Arka scheme holds this issuer. The case is recorded as informational; opening it now.");

      for (const key of [
        getListEventsQueryKey(),
        getGetDashboardQueryKey(),
        getGetAnalysisQueryKey(),
        getListSchemesQueryKey(),
        getListIssuersQueryKey(),
      ]) queryClient.invalidateQueries({ queryKey: key });

      toast({ title: "Case created", description: heldCount > 0 ? "Stage 1 numbers are ready. Stage 2 judgement runs on demand." : "Recorded for awareness; the portfolio is not affected." });
      setTimeout(() => setLocation(`/events/${event.id}`), 700);

    } catch (error) {
      setStep(activeStep, "error", error instanceof Error ? error.message : undefined);
      setErrorMsg(error instanceof Error ? error.message : "Failed to process the notice.");
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (cameFromDiscovery && sourceUrl.trim() && !autoStarted.current) {
      autoStarted.current = true;
      // Drop the query parameter so returning via Back does not re-capture.
      window.history.replaceState({}, "", window.location.pathname);
      void runPipeline(sourceUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runPipeline(sourceUrl);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <header className="border-b bg-card px-5 py-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900"><Radar className="h-6 w-6 text-primary" />Capture &amp; analyse
            <InfoHint title="This page">
              Give it a link to a company announcement. The copilot reads the page, pulls out the dates and rates, checks which Arka schemes hold that company, and opens a case with the money impact already worked out. The four steps below show its progress live.
            </InfoHint>
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {cameFromDiscovery
              ? "The fetched notice is only a lead. Capturing it pulls the original source, extracts the facts, matches the issuer against the Arka schemes, and computes indicative impacts."
              : "Paste the public URL of an exchange, issuer, or regulator notice. The copilot captures the evidence, extracts the facts, and analyses the impact on the Arka schemes."}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-5 py-4 sm:px-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              What happens when you capture
              <InfoHint title="Capture process">The automated extraction pipeline that structures the notice into a working case.</InfoHint>
            </CardTitle>
            <CardDescription>Four steps, all recorded in the case history. Nothing is acted on until a decision is made and a second person approves it.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {steps.map((step, index) => <StepRow key={step.id} step={step} index={index} />)}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Notice source
              <InfoHint title="Notice source">The authoritative document or announcement establishing the corporate action.</InfoHint>
            </CardTitle>
            <CardDescription>Use the original NSE, BSE, SEBI, or issuer page whenever possible.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{errorMsg}</p>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="source-url">Public source URL</Label>
                <Input
                  id="source-url"
                  type="url"
                  placeholder="https://..."
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  disabled={isProcessing}
                />
                <p className="text-xs leading-5 text-slate-500">Web discoveries stay indicative until custodian terms are confirmed by MT564.</p>
              </div>

              <Button type="submit" disabled={isProcessing} className="w-full sm:w-auto">
                {isProcessing ? (
                  <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Working through the steps...</>
                ) : (
                  <><Radar className="mr-2 h-4 w-4" /> Capture &amp; analyse</>
                )}
              </Button>
              {!isProcessing && errorMsg && (
                <p className="text-xs leading-5 text-slate-500">The failed step is marked above. Fix the source and try again; nothing was created.</p>
              )}
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
