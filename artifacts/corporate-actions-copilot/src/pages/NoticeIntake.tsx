import { useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  Check,
  FileUp,
  LoaderCircle,
  Radar,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetDashboardQueryKey, getListEventsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  { id: "capture", label: "Record the source", explanation: "The notice source is recorded as the case's evidence pointer.", status: "pending" },
  { id: "extract", label: "Pull and extract the facts", explanation: "The evidence is retrieved and dates, ratios, prices, and identifiers are read out of it.", status: "pending" },
  { id: "validate", label: "Validate the terms", explanation: "Each extracted term is checked against what the source actually says.", status: "pending" },
  { id: "create", label: "Create the case", explanation: "Impacts are computed for every scheme and the case opens for analysis.", status: "pending" },
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

  const [file, setFile] = useState<File | null>(null);
  const [textData, setTextData] = useState("");
  const [sourceUrl, setSourceUrl] = useState(() => new URLSearchParams(window.location.search).get("sourceUrl") ?? "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);
  const cameFromDiscovery = Boolean(new URLSearchParams(window.location.search).get("sourceUrl"));

  const setStep = (id: string, status: StepStatus, detail?: string) => {
    setSteps((previous) => previous.map((step) => (step.id === id ? { ...step, status, detail: detail ?? step.detail } : step)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !textData.trim() && !sourceUrl.trim()) {
      setErrorMsg("Please provide a source URL, PDF, or pasted text/feed payload.");
      return;
    }
    if (file && file.size > 12 * 1024 * 1024) {
      setErrorMsg("PDF uploads are limited to 12 MB.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setSteps(initialSteps.map((step) => ({ ...step })));
    let activeStep = "capture";

    try {
      setStep("capture", "active");
      let objectPath;
      if (file) {
        const destination = await requestJson<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
          method: "POST",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        const put = await fetch(destination.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!put.ok) throw new Error("The PDF could not be saved to protected storage.");
        objectPath = destination.objectPath;
      }

      const captureBody = {
        sourceType: file ? "upload" : sourceUrl.trim() ? "url" : "text",
        sourceLabel: file ? `NSE/BSE filing · ${file.name}` : sourceUrl.trim() ? "Public web discovery" : "NSE/BSE early sighting",
        objectPath,
        sourceUrl: sourceUrl.trim() || undefined,
        sourceText: textData.trim() || undefined,
      };

      const draft = await requestJson<{ id: string }>("/api/intake/drafts", {
        method: "POST",
        body: JSON.stringify(captureBody)
      });
      setStep("capture", "done", file ? `Stored ${file.name} as evidence.` : sourceUrl.trim() ? "Source URL recorded. The evidence itself is pulled in the next step." : "Stored the pasted content as evidence.");

      activeStep = "extract";
      setStep("extract", "active");
      const extracted = await requestJson<{ terms: { key: string; value: string }[] }>(`/api/intake/drafts/${draft.id}/extract`, { method: "POST" });
      setStep("extract", "done", `Retrieved the evidence and extracted ${extracted.terms.length} term${extracted.terms.length === 1 ? "" : "s"}.`);

      activeStep = "validate";
      setStep("validate", "active");
      await requestJson(`/api/intake/drafts/${draft.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ terms: extracted.terms.map(({ key, value }) => ({ key, value })) }),
      });
      setStep("validate", "done", "Every term traces back to the captured evidence.");

      activeStep = "create";
      setStep("create", "active");
      const event = await requestJson<{ id: string }>(`/api/intake/drafts/${draft.id}/create-case`, { method: "POST" });
      setStep("create", "done", "Scheme impacts computed. Opening the case.");

      queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });

      toast({ title: "Case created", description: "Stage 1 numbers are ready. Stage 2 judgement runs on demand." });
      setTimeout(() => setLocation(`/events/${event.id}`), 600);

    } catch (error) {
      setStep(activeStep, "error", error instanceof Error ? error.message : undefined);
      setErrorMsg(error instanceof Error ? error.message : "Failed to process the notice.");
      setIsProcessing(false);
    }
  };

  const showPipeline = isProcessing || steps.some((step) => step.status !== "pending");

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <header className="border-b bg-card px-5 py-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900"><Radar className="h-6 w-6 text-primary" />Capture &amp; analyse</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {cameFromDiscovery
              ? "The fetched notice is only a lead. Capturing it pulls the original source, extracts the facts, and creates a case with deterministic numbers for every scheme."
              : "Bring in a notice from a URL, a PDF filing, or pasted text. The copilot captures the evidence, extracts the facts, and creates a case with deterministic numbers for every scheme."}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-5 py-4 sm:px-8">
        <Card>
          <CardHeader>
            <CardTitle>What happens when you capture</CardTitle>
            <CardDescription>Four steps, all recorded in the case history. Nothing is acted on until the maker-checker decision.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {steps.map((step, index) => <StepRow key={step.id} step={step} index={index} />)}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provide the source</CardTitle>
            <CardDescription>One input is enough. Prefer the original exchange, issuer, regulator, or custodian notice.</CardDescription>
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
                <p className="text-xs leading-5 text-slate-500">Web discoveries remain indicative until custodian terms are confirmed by MT564.</p>
              </div>

              <div className="space-y-3">
                <Label htmlFor="pdf-upload">Or upload a PDF notice</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="pdf-upload"
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    disabled={isProcessing}
                    className="flex-1"
                  />
                  {file && <span className="figure text-left text-xs text-slate-500 whitespace-nowrap">{(file.size / 1024 / 1024).toFixed(2)} MB</span>}
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="text-data">Or paste text / feed payload</Label>
                <Textarea
                  id="text-data"
                  placeholder="Paste email body, raw text, or JSON payload here..."
                  className="min-h-32 font-mono text-sm"
                  value={textData}
                  onChange={(e) => setTextData(e.target.value)}
                  disabled={isProcessing}
                />
              </div>

              <Button type="submit" disabled={isProcessing} className="w-full sm:w-auto">
                {isProcessing ? (
                  <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Working through the steps...</>
                ) : (
                   <><FileUp className="mr-2 h-4 w-4" /> Capture &amp; analyse</>
                )}
              </Button>
              {showPipeline && !isProcessing && errorMsg && (
                <p className="text-xs leading-5 text-slate-500">The failed step is marked above. Fix the source and try again; nothing was created.</p>
              )}
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
