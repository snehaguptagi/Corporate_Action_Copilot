import { useCreateIntake, getListEventsQueryKey, getGetDashboardQueryKey, type IntakeInputSampleId } from "@workspace/api-client-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, ExternalLink, FileSearch, FileText, FileUp, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const demoPdfPath = `${import.meta.env.BASE_URL}demo-notices/rights-issue-notice.pdf`;
const pdfPathFor = (fileName: string) => `${import.meta.env.BASE_URL}demo-notices/${fileName}`;

const sampleNotices = [
  { id: "cash-dividend", name: "aurora-cash-dividend.pdf", type: "Cash dividend", classification: "Mandatory", source: "Synthetic custodian portal", summary: "EUR 0.42 gross per share · record date 24 Aug 2026", risk: "Term validation", pdfPath: pdfPathFor("cash-dividend-notice.pdf") },
  { id: "rights-issue", name: "rights-issue-notice.pdf", type: "Rights issue", classification: "Voluntary", source: "Synthetic custodian portal", summary: "1 new share for 5 rights · EUR 8.50 subscription · default: lapse", risk: "Election and approval", pdfPath: demoPdfPath },
  { id: "stock-split", name: "delta-stock-split.pdf", type: "Stock split", classification: "Mandatory", source: "Synthetic agent feed", summary: "4-for-1 split · fractional entitlement rounded down", risk: "Fractional entitlement", pdfPath: pdfPathFor("delta-stock-split.pdf") },
  { id: "bonus-issue", name: "nimbus-bonus-issue.pdf", type: "Bonus issue", classification: "Mandatory", source: "Synthetic custodian portal", summary: "1 bonus share for every 10 eligible shares", risk: "Position match", pdfPath: pdfPathFor("nimbus-bonus-issue.pdf") },
  { id: "tender-offer", name: "meridian-tender-offer.pdf", type: "Tender offer", classification: "Voluntary", source: "Synthetic agent feed", summary: "Cash tender with capped acceptance and client election", risk: "Election capacity", pdfPath: pdfPathFor("meridian-tender-offer.pdf") },
  { id: "merger", name: "verdant-merger-election.pdf", type: "Merger", classification: "Voluntary", source: "Synthetic custodian portal", summary: "Cash and share election with deadline controls", risk: "Checker approval", pdfPath: pdfPathFor("verdant-merger-election.pdf") },
];

export default function NoticeIntake() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createIntake = useCreateIntake();
  const [selectedId, setSelectedId] = useState("rights-issue");
  const [source, setSource] = useState("Synthetic custodian portal");
  const selected = sampleNotices.find((notice) => notice.id === selectedId) ?? sampleNotices[0];

  const submit = () => {
    createIntake.mutate({ data: { sampleId: selected.id as IntakeInputSampleId, fileName: selected.name, source } }, {
      onSuccess: (event) => {
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        toast({ title: "Case created for review", description: `${selected.type} is open at its current control point.` });
        setLocation(`/events/${event.id}`);
      },
      onError: (error) => toast({ title: "Intake blocked", description: error instanceof Error ? error.message : "Could not create the case.", variant: "destructive" }),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <header className="border-b bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <FileUp className="h-5 w-5 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Notice intake</h1>
                <p className="mt-1 text-sm text-slate-500">Select a named synthetic sample notice to create a traceable case for review.</p>
              </div>
            </div>
            <Badge variant="warning" className="self-center">POC: synthetic notices only</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-5 sm:p-8 xl:grid-cols-[1fr_360px]">
        <section className="xl:col-span-2">
          <Card className="border-primary/25 bg-white">
            <CardHeader className="border-b bg-primary/5 pb-4">
              <CardTitle className="text-base">How the input enters the copilot</CardTitle>
              <CardDescription>This demonstration starts with a named source PDF. The case keeps the file name, source channel, extracted terms, and evidence together.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-5 md:grid-cols-3">
              {[
                ["1", "Select a source", "Choose one of the six named synthetic notices. The sample ID selects the scenario."],
                ["2", "Inspect the PDF", "Read the source document in the preview before creating a case."],
                ["3", "Create the case", "The copilot records the source and prepares deterministic term review."],
              ].map(([step, title, description]) => (
                <div key={step} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{step}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Sample notice library</h2>
              <p className="text-sm text-slate-500">The label and sample ID determine the synthetic data model. Filenames are not interpreted.</p>
            </div>
            <Badge variant="secondary">{sampleNotices.length} samples</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {sampleNotices.map((notice) => {
              const selectedNotice = notice.id === selected.id;
              return (
                <button
                  key={notice.id}
                  onClick={() => { setSelectedId(notice.id); setSource(notice.source); }}
                  className={`rounded-lg border p-4 text-left transition-all ${selectedNotice ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-white hover:border-primary/40 hover:shadow-sm"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className={`rounded-md p-2 ${selectedNotice ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-500"}`}><FileText className="h-4 w-4" /></div>
                      <div>
                        <p className="font-medium text-slate-900">{notice.type}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">{notice.name}</p>
                      </div>
                    </div>
                    {selectedNotice && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-4 text-sm leading-5 text-slate-600">{notice.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge variant="outline">{notice.classification}</Badge>
                    <Badge variant={notice.risk === "Term validation" ? "warning" : "secondary"}>{notice.risk}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <Card className="border-primary/30">
            <CardHeader className="border-b bg-slate-50/70">
              <CardTitle className="flex items-center gap-2 text-base"><FileSearch className="h-4 w-4 text-primary" />Selected notice</CardTitle>
              <CardDescription>Review the source PDF and confirm its originating channel before creating a case.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="font-medium text-slate-900">{selected.type}</p>
                <p className="mt-1 text-xs text-slate-500">{selected.summary}</p>
              </div>
              <div className="overflow-hidden rounded-md border bg-slate-100">
                <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Source PDF</span>
                  <Badge variant="outline">Synthetic</Badge>
                </div>
                <iframe title={`${selected.type} source PDF`} src={selected.pdfPath} className="h-[420px] w-full bg-white" />
                <a className="block border-t bg-white p-2" href={selected.pdfPath} target="_blank" rel="noreferrer">
                  <Button variant="ghost" size="sm" className="w-full"><ExternalLink className="mr-2 h-3.5 w-3.5" />Open source PDF</Button>
                </a>
              </div>
              <p className="text-xs leading-5 text-slate-500">This PDF is the source input for the selected case. The POC uses named synthetic scenarios, not arbitrary document parsing.</p>
              <div className="space-y-2">
                <Label htmlFor="notice-source">Notice source</Label>
                <Input id="notice-source" value={source} onChange={(event) => setSource(event.target.value)} />
              </div>
              <Button className="w-full" onClick={submit} disabled={createIntake.isPending}>
                {createIntake.isPending ? "Creating case..." : "Create case from this PDF"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-xs leading-5 text-slate-600">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary" />
              The case opens in the operational journey with source terms, holdings, deterministic calculations, decisions where required, simulated-only instructions, and audit history.
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}