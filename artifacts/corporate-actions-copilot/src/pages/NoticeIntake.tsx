import { useCreateIntake, getListEventsQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { FileUp, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getDemoRole } from "@/lib/demo-role";

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
      <div className="border-b bg-white px-8 py-6">
        <div className="flex items-center gap-3"><FileUp className="h-5 w-5 text-primary" /><div><h1 className="text-2xl font-semibold tracking-tight">Notice Intake</h1><p className="mt-1 text-sm text-slate-500">Start the hero rights-issue journey from a synthetic notice document.</p></div></div>
      </div>
      <div className="mx-auto grid max-w-5xl gap-6 p-8 md:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader><CardTitle>Upload a synthetic notice</CardTitle><CardDescription>The POC accepts the supplied rights-issue sample and produces deterministic, evidence-linked extraction without an AI key.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 text-sm font-medium">Choose a PDF or use the seeded filename</p>
              <p className="mt-1 text-xs text-slate-500">For this POC, files named with “rights” map to the supplied synthetic rights notice.</p>
              <input className="mx-auto mt-4 block max-w-xs text-xs" type="file" accept=".pdf,application/pdf" onChange={(event) => event.target.files?.[0] && setFileName(event.target.files[0].name)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="notice-name">Notice filename</Label><Input id="notice-name" value={fileName} onChange={(event) => setFileName(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="notice-source">Source</Label><Input id="notice-source" value={source} onChange={(event) => setSource(event.target.value)} /></div>
            </div>
            <Button className="w-full" onClick={submit} disabled={createIntake.isPending}><Sparkles className="mr-2 h-4 w-4" />Create reviewed case</Button>
          </CardContent>
        </Card>
        <Card className="h-fit"><CardHeader><CardTitle className="text-base">What the POC will do</CardTitle></CardHeader><CardContent className="space-y-4 text-sm text-slate-600">
          <div className="flex gap-3"><Badge variant="secondary">1</Badge><p>Classify the notice as a voluntary rights issue and cite source pages.</p></div>
          <div className="flex gap-3"><Badge variant="secondary">2</Badge><p>Require the analyst to validate the ratio, price, dates, and default option.</p></div>
          <div className="flex gap-3"><Badge variant="secondary">3</Badge><p>Match eligible positions by ISIN and record date before calculating entitlements.</p></div>
          <div className="flex gap-3"><Badge variant="secondary">4</Badge><p>Gate elections, independent approval, and the simulated instruction through the control rules.</p></div>
          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />POC — Synthetic Data. No document is sent to an external custodian.</div>
        </CardContent></Card>
      </div>
    </div>
  );
}