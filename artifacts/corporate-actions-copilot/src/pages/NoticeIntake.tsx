import { useState } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FileText,
  FileUp,
  Globe2,
  LoaderCircle,
  Network,
  ShieldCheck,
  Sparkles,
  TextQuote,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetDashboardQueryKey, getListEventsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type SourceType = "sample" | "upload" | "url" | "text" | "structured-feed";
type DraftTerm = { key: string; label: string; value: string; page: string; evidence: string; confidence: number; reviewStatus: string };
type IntakeDraft = {
  id: string;
  title: string;
  status: string;
  source: { type: SourceType; label: string; objectPath?: string; sourceUrl?: string; previewUrl?: string; preservation: string };
  extraction: { status: string; method: string; confidence: number; errors: string[] };
  terms: DraftTerm[];
};

const pdfPathFor = (fileName: string) => `${import.meta.env.BASE_URL}demo-notices/${fileName}`;
const samples = [
  { id: "cash-dividend", type: "Cash dividend", name: "aurora-cash-dividend.pdf", pdfPath: pdfPathFor("cash-dividend-notice.pdf"), summary: "GBP 0.425 per share" },
  { id: "rights-issue", type: "Rights issue", name: "rights-issue-notice.pdf", pdfPath: pdfPathFor("rights-issue-notice.pdf"), summary: "1 new share for 5 rights" },
  { id: "stock-split", type: "Stock split", name: "delta-stock-split.pdf", pdfPath: pdfPathFor("delta-stock-split.pdf"), summary: "4-for-1 split" },
  { id: "bonus-issue", type: "Bonus issue", name: "nimbus-bonus-issue.pdf", pdfPath: pdfPathFor("nimbus-bonus-issue.pdf"), summary: "1 bonus share for 10 shares" },
  { id: "tender-offer", type: "Tender offer", name: "meridian-tender-offer.pdf", pdfPath: pdfPathFor("meridian-tender-offer.pdf"), summary: "USD cash tender" },
  { id: "merger", type: "Merger", name: "verdant-merger-election.pdf", pdfPath: pdfPathFor("verdant-merger-election.pdf"), summary: "Cash and share election" },
];

const sourceOptions: Array<{ id: SourceType; label: string; helper: string; icon: typeof FileText }> = [
  { id: "sample", label: "Sample PDF", helper: "Preloaded demonstration evidence", icon: FileText },
  { id: "upload", label: "Upload PDF", helper: "Protected original document storage", icon: FileUp },
  { id: "url", label: "Website URL", helper: "Public issuer or agent notice page", icon: Globe2 },
  { id: "text", label: "Pasted notice", helper: "Email body or unstructured text", icon: TextQuote },
  { id: "structured-feed", label: "Custodian or agent feed", helper: "Paste a structured payload", icon: Network },
];

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

export default function NoticeIntake() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sourceType, setSourceType] = useState<SourceType>("sample");
  const [sampleId, setSampleId] = useState("rights-issue");
  const [sourceLabel, setSourceLabel] = useState("rights-issue-notice.pdf");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [structuredPayload, setStructuredPayload] = useState("");
  const [upload, setUpload] = useState<{ objectPath: string; name: string; size: number } | null>(null);
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [busy, setBusy] = useState<"upload" | "capture" | "extract" | "validate" | "case" | null>(null);
  const selectedSample = samples.find((sample) => sample.id === sampleId) ?? samples[0];

  const resetWorkflow = () => setDraft(null);

  const selectSource = (next: SourceType) => {
    setSourceType(next);
    resetWorkflow();
    if (next === "sample") setSourceLabel(selectedSample.name);
    if (next === "upload") setSourceLabel(upload?.name ?? "New corporate-action notice.pdf");
    if (next === "url") setSourceLabel("Issuer or agent website notice");
    if (next === "text") setSourceLabel("Pasted notice");
    if (next === "structured-feed") setSourceLabel("Custodian or agent feed");
  };

  const uploadPdf = async (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "PDF required", description: "Choose a PDF notice document.", variant: "destructive" });
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast({ title: "File too large", description: "PDF uploads are limited to 12 MB.", variant: "destructive" });
      return;
    }
    setBusy("upload");
    try {
      const destination = await requestJson<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const put = await fetch(destination.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("The PDF could not be saved to protected storage.");
      setUpload({ objectPath: destination.objectPath, name: file.name, size: file.size });
      setSourceLabel(file.name);
      resetWorkflow();
      toast({ title: "Source PDF preserved", description: "The original is ready for controlled extraction." });
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Could not upload the PDF.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const captureSource = async () => {
    setBusy("capture");
    try {
      const body = {
        sourceType,
        sourceLabel,
        sampleId: sourceType === "sample" ? sampleId : undefined,
        objectPath: sourceType === "upload" ? upload?.objectPath : undefined,
        sourceUrl: sourceType === "url" ? sourceUrl : undefined,
        sourceText: sourceType === "text" ? sourceText : undefined,
        structuredPayload: sourceType === "structured-feed" ? structuredPayload : undefined,
      };
      const created = await requestJson<IntakeDraft>("/api/intake/drafts", { method: "POST", body: JSON.stringify(body) });
      setDraft(created);
      toast({ title: "Source captured", description: "Original evidence is retained. Start extraction when ready." });
    } catch (error) {
      toast({ title: "Source capture blocked", description: error instanceof Error ? error.message : "Could not capture this notice.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const extract = async () => {
    if (!draft) return;
    setBusy("extract");
    try {
      const result = await requestJson<IntakeDraft>(`/api/intake/drafts/${draft.id}/extract`, { method: "POST" });
      setDraft(result);
      toast({
        title: result.terms.length ? "Terms ready for validation" : "No terms extracted",
        description: result.terms.length ? "Review every proposed term against the source." : result.extraction.errors[0] ?? "Add source detail and try again.",
        variant: result.terms.length ? "default" : "destructive",
      });
    } catch (error) {
      toast({ title: "Extraction failed", description: error instanceof Error ? error.message : "Could not extract the notice.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const updateTerm = (key: string, value: string) => {
    setDraft((current) => current ? { ...current, terms: current.terms.map((term) => term.key === key ? { ...term, value } : term) } : current);
  };

  const validate = async () => {
    if (!draft) return;
    setBusy("validate");
    try {
      const result = await requestJson<IntakeDraft>(`/api/intake/drafts/${draft.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ terms: draft.terms.map(({ key, value }) => ({ key, value })) }),
      });
      setDraft(result);
      toast({ title: "Terms validated", description: "The source can now create a controlled case." });
    } catch (error) {
      toast({ title: "Validation blocked", description: error instanceof Error ? error.message : "Could not validate the terms.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const createCase = async () => {
    if (!draft) return;
    setBusy("case");
    try {
      const event = await requestJson<{ id: string }>(`/api/intake/drafts/${draft.id}/create-case`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      toast({ title: "Controlled case created", description: "Only validated source terms were carried into the operational workflow." });
      setLocation(`/events/${event.id}`);
    } catch (error) {
      toast({ title: "Case creation blocked", description: error instanceof Error ? error.message : "Could not create the case.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const previewUrl = sourceType === "sample" ? selectedSample.pdfPath : sourceType === "upload" && upload ? `/api/storage${upload.objectPath}` : undefined;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <header className="border-b bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 text-primary">Evidence-first intake</Badge>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Capture a notice before creating a case</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Preserve the original source, extract suggested terms, validate the evidence, then move only reviewed details into the controlled workflow.</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><FileSearch className="h-4 w-4 text-primary" />1. Choose the source type</CardTitle>
              <CardDescription>PDFs, public websites, message text, and structured agent or custodian payloads can all start intake.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sourceOptions.map((option) => {
                const Icon = option.icon;
                const selected = option.id === sourceType;
                return <button key={option.id} type="button" onClick={() => selectSource(option.id)} className={`rounded-md border p-3 text-left transition ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-white hover:border-primary/40"}`}>
                  <Icon className={`mb-3 h-4 w-4 ${selected ? "text-primary" : "text-slate-500"}`} />
                  <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                  <p className="mt-1 text-xs leading-4 text-slate-500">{option.helper}</p>
                </button>;
              })}
            </CardContent>
          </Card>

          {sourceType === "sample" && <Card>
            <CardHeader>
              <CardTitle className="text-base">Sample source library</CardTitle>
              <CardDescription>Each sample is a named synthetic scenario with visible source evidence.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {samples.map((sample) => <button key={sample.id} type="button" onClick={() => { setSampleId(sample.id); setSourceLabel(sample.name); resetWorkflow(); }} className={`rounded-md border p-3 text-left ${sample.id === sampleId ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-white hover:border-primary/40"}`}>
                <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">{sample.type}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{sample.name}</p></div>{sample.id === sampleId && <CheckCircle2 className="h-4 w-4 text-primary" />}</div>
                <p className="mt-3 text-xs text-slate-600">{sample.summary}</p>
              </button>)}
            </CardContent>
          </Card>}

          {sourceType === "upload" && <Card>
            <CardHeader><CardTitle className="text-base">Upload source PDF</CardTitle><CardDescription>The original PDF is stored in protected App Storage before any extraction runs.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" accept="application/pdf" onChange={(event) => uploadPdf(event.target.files?.[0])} disabled={busy === "upload"} />
              <p className="text-xs text-slate-500">PDF only. Maximum file size 12 MB.</p>
              {upload && <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><span>{upload.name}</span><Badge variant="outline">{Math.max(1, Math.round(upload.size / 1024))} KB protected</Badge></div>}
            </CardContent>
          </Card>}

          {sourceType === "url" && <Card><CardHeader><CardTitle className="text-base">Website notice source</CardTitle><CardDescription>Use a public issuer, exchange, custodian, or agent page. Private networks and credentialed URLs are blocked.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="source-url">Public website URL</Label><Input id="source-url" placeholder="https://issuer.example.com/corporate-actions/notice" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); resetWorkflow(); }} /></CardContent></Card>}
          {sourceType === "text" && <Card><CardHeader><CardTitle className="text-base">Pasted notice text</CardTitle><CardDescription>Capture email bodies or unstructured notices when a document is not available.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="source-text">Notice content</Label><Textarea id="source-text" value={sourceText} onChange={(event) => { setSourceText(event.target.value); resetWorkflow(); }} placeholder="Paste the notice text, email body, or message here." className="min-h-40" /></CardContent></Card>}
          {sourceType === "structured-feed" && <Card><CardHeader><CardTitle className="text-base">Custodian or agent feed</CardTitle><CardDescription>Paste a structured notification payload such as JSON, CSV text, SWIFT-like message, or portal export.</CardDescription></CardHeader><CardContent className="space-y-3"><Label htmlFor="structured-payload">Source payload</Label><Textarea id="structured-payload" value={structuredPayload} onChange={(event) => { setStructuredPayload(event.target.value); resetWorkflow(); }} placeholder='{"eventType":"Cash dividend","isin":"..."}' className="min-h-40 font-mono text-xs" /></CardContent></Card>}

          <Card className="border-primary/30">
            <CardHeader><CardTitle className="text-base">2. Capture source evidence</CardTitle><CardDescription>This stores the source first. Extraction cannot modify the original notice.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <div className="min-w-56 flex-1"><Label htmlFor="source-label">Evidence label</Label><Input id="source-label" className="mt-2" value={sourceLabel} onChange={(event) => { setSourceLabel(event.target.value); resetWorkflow(); }} /></div>
              <Button onClick={captureSource} disabled={busy !== null || (sourceType === "upload" && !upload)}>{busy === "capture" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{draft ? "Capture updated source" : "Capture source"}</Button>
            </CardContent>
          </Card>

          {draft && <Card className="border-primary/30">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />3. Extract and validate terms</CardTitle><CardDescription>AI proposes terms with confidence and evidence. An Operations Analyst must validate every term before a case can be created.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{draft.status}</Badge><Badge variant="secondary">{draft.extraction.method}</Badge>{draft.extraction.confidence > 0 && <Badge variant="outline">{Math.round(draft.extraction.confidence * 100)}% confidence</Badge>}</div>
              {draft.extraction.errors.map((error) => <p key={error} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{error}</p>)}
              {draft.terms.length === 0 ? <Button onClick={extract} disabled={busy !== null}>{busy === "extract" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Extract details from source</Button> : <>
                <div className="overflow-hidden rounded-md border"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Term</th><th className="p-3">Proposed value</th><th className="hidden p-3 lg:table-cell">Evidence</th></tr></thead><tbody>{draft.terms.map((item) => <tr key={item.key} className="border-t align-top"><td className="p-3"><p className="font-medium text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-500">{item.page} · {Math.round(item.confidence * 100)}%</p></td><td className="p-3"><Input value={item.value} onChange={(event) => updateTerm(item.key, event.target.value)} /></td><td className="hidden p-3 text-xs leading-5 text-slate-600 lg:table-cell">{item.evidence}</td></tr>)}</tbody></table></div>
                <div className="flex flex-wrap gap-3"><Button onClick={validate} disabled={busy !== null || draft.status === "Ready to create case"}>{busy === "validate" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Validate terms against source</Button>{draft.status === "Ready to create case" && <Button onClick={createCase} disabled={busy !== null} variant="default">{busy === "case" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Create controlled case</Button>}</div>
              </>}
            </CardContent>
          </Card>}
        </section>

        <aside className="space-y-5">
          <Card className="sticky top-5 overflow-hidden border-primary/30">
            <CardHeader className="border-b bg-slate-50/70"><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-primary" />Original source evidence</CardTitle><CardDescription>Preview before extraction and keep the source accessible throughout review.</CardDescription></CardHeader>
            <CardContent className="p-0">
              {previewUrl ? <><div className="h-[460px] bg-slate-100"><iframe title="Original corporate action source" src={previewUrl} className="h-full w-full bg-white" /></div><a className="block border-t bg-white p-2" href={previewUrl} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm" className="w-full"><ExternalLink className="mr-2 h-3.5 w-3.5" />Open original source</Button></a></> : <div className="p-6 text-sm leading-6 text-slate-600">The original source preview appears after selecting a sample or uploading a PDF. Website, text, and feed sources retain their captured provenance in the intake draft.</div>}
            </CardContent>
          </Card>
          {draft && <Card><CardContent className="space-y-2 p-4 text-xs leading-5 text-slate-600"><p className="font-semibold uppercase tracking-wide text-slate-500">Evidence status</p><p>{draft.source.preservation}</p>{draft.source.objectPath && <p className="font-mono text-[10px] text-slate-400">{draft.source.objectPath}</p>}</CardContent></Card>}
          <Card><CardContent className="p-4 text-xs leading-5 text-slate-600"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary" />AI suggestions never trigger calculations, elections, approvals, or instructions. Only analyst-validated terms can create a controlled case.</CardContent></Card>
        </aside>
      </main>
    </div>
  );
}