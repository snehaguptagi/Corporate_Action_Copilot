import { useCreateIntake, getListEventsQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, ExternalLink, FileText, FileUp, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getDemoRole } from "@/lib/demo-role";

const demoPdfPath = `${import.meta.env.BASE_URL}demo-notices/rights-issue-notice.pdf`;

export default function NoticeIntake() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createIntake = useCreateIntake();
  const [fileName, setFileName] = useState("rights-issue-notice.pdf");
  const [source, setSource] = useState("Synthetic custodian portal");

  const submit = () => {
    const actor = getDemoRole();
    createIntake.mutate({ data: { fileName, source, actorId: actor.id, actorRole: actor.role } }, {
      onSuccess: (event) => {
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        toast({ title: "Notice intake created", description: "The hero rights-issue case is ready for analyst review." });
        setLocation(`/events/${event.id}`);
      },
      onError: (error) => toast({ title: "Intake blocked", description: error instanceof Error ? error.message : "Could not create the case.", variant: "destructive" }),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <header className="border-b bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3">
            <FileUp className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Notice Intake</h1>
              <p className="mt-1 text-sm text-slate-500">The hero case starts with a document that is already uploaded and ready to inspect.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  Uploaded notice
                </CardTitle>
                <CardDescription className="mt-1">The exact synthetic PDF used by the hero rights-issue case.</CardDescription>
              </div>
              <Badge variant="success"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Uploaded</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-slate-50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">rights-issue-notice.pdf</p>
                <p className="text-xs text-slate-500">3 pages · Synthetic custodian portal · Received 26 Aug 2026</p>
              </div>
              <a href={demoPdfPath} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="mr-2 h-3.5 w-3.5" />Open PDF</Button>
              </a>
            </div>
            <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-100">
              <iframe
                title="Synthetic rights issue notice PDF"
                src={demoPdfPath}
                className="h-[520px] w-full bg-white sm:h-[620px]"
              />
            </div>
            <p className="text-xs leading-5 text-slate-500">
              This document is synthetic demo evidence. The extracted terms, calculations, elections, and audit entries in the workbench all trace back to these three pages.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create the hero case</CardTitle>
              <CardDescription>Use the preloaded PDF or select another file name containing “rights”. The POC maps it to this deterministic sample.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-5 text-center">
                <Upload className="mx-auto h-8 w-8 text-primary" />
                <p className="mt-3 text-sm font-medium">PDF already uploaded</p>
                <p className="mt-1 text-xs text-slate-500">You can replace the filename for the intake demonstration.</p>
                <input
                  className="mx-auto mt-4 block max-w-full text-xs"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(event) => event.target.files?.[0] && setFileName(event.target.files[0].name)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice-name">Notice filename</Label>
                <Input id="notice-name" value={fileName} onChange={(event) => setFileName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice-source">Source</Label>
                <Input id="notice-source" value={source} onChange={(event) => setSource(event.target.value)} />
              </div>
              <Button className="w-full" onClick={submit} disabled={createIntake.isPending || !fileName.trim()}>
                <Sparkles className="mr-2 h-4 w-4" />
                {createIntake.isPending ? "Creating case…" : "Create reviewed case"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visible journey after intake</CardTitle>
              <CardDescription>Every step is available from the case workbench.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              {[
                "Review the PDF beside extracted terms and page evidence.",
                "Validate the ratio, price, dates, and default option.",
                "Match eligible holdings and run deterministic calculations.",
                "Enter elections, obtain independent approval, and simulate the instruction.",
                "Load settlement, classify the result, and inspect the audit trail.",
              ].map((step, index) => (
                <div key={step} className="flex gap-3">
                  <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1">{index + 1}</Badge>
                  <p>{step}</p>
                </div>
              ))}
              <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                POC — Synthetic Data. No document or instruction is sent to an external custodian.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">End-to-end demo preview</CardTitle>
              <CardDescription>The expected operational result from the uploaded notice, before any live case is created.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1 · PDF extraction</p>
                <p className="mt-1 text-sm font-medium text-slate-900">1 new share for every 5 · EUR 8.50 subscription price</p>
                <p className="mt-1 text-xs text-slate-500">Record date 24 Aug 2026 · cutoff 29 Aug 2026, 10:00 CEST · default: lapse</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2 · Eligible holdings</p>
                <p className="mt-1 text-sm font-medium text-slate-900">European Opportunities Fund: 100,000 → 20,000 rights</p>
                <p className="mt-1 text-sm font-medium text-slate-900">Sustainable Growth Fund: 50,000 → 10,000 rights</p>
              </div>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">3 · Deterministic calculation</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">30,000 maximum new shares · EUR 255,000 maximum funding</p>
                <p className="mt-1 text-xs text-slate-500">The calculation rounds fractions down and refuses to run until every required term is validated.</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">4 · Controlled decision and settlement</p>
                <p className="mt-1 text-sm text-slate-800">Aisha prepares an election → Daniel independently approves → instruction is marked <strong>SIMULATED — NOT SENT</strong> → settlement is classified as matched or broken.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}