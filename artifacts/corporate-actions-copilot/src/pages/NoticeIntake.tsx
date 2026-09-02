import { useState } from "react";
import { useLocation } from "wouter";
import {
  FileUp,
  LoaderCircle,
  AlertCircle,
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

export default function NoticeIntake() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [textData, setTextData] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !textData.trim()) {
      setErrorMsg("Please provide either a PDF or pasted text/feed payload.");
      return;
    }
    if (file && file.size > 12 * 1024 * 1024) {
      setErrorMsg("PDF uploads are limited to 12 MB.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
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

      // 1. Capture source
      const captureBody = {
        sourceType: file ? "upload" : "text",
        sourceLabel: file ? `NSE/BSE filing · ${file.name}` : "NSE/BSE early sighting",
        objectPath,
        sourceText: textData.trim() || undefined,
      };

      const draft = await requestJson<{ id: string }>("/api/intake/drafts", {
        method: "POST",
        body: JSON.stringify(captureBody)
      });

      // 2. Extract terms
      const extracted = await requestJson<{ terms: { key: string; value: string }[] }>(`/api/intake/drafts/${draft.id}/extract`, { method: "POST" });

      // 3. Validate (auto-approve all extracted terms)
      await requestJson(`/api/intake/drafts/${draft.id}/validate`, {
        method: "POST",
        body: JSON.stringify({ terms: extracted.terms.map(({ key, value }) => ({ key, value })) }),
      });

      // 4. Create case
      const event = await requestJson<{ id: string }>(`/api/intake/drafts/${draft.id}/create-case`, { method: "POST" });

      queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });

      toast({ title: "Early sighting logged" });
      setLocation(`/events/${event.id}`);

    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Failed to process the notice.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      <header className="border-b bg-card px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Log an early sighting</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Capture an NSE or BSE filing before the custodian notification arrives. The result is indicative and cannot be acted on.</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Provide exchange evidence</CardTitle>
            <CardDescription>Upload an NSE/BSE filing or paste its text. SBI-SG must still confirm the action by MT564.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {errorMsg && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-800 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{errorMsg}</p>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="pdf-upload">PDF Notice (Primary)</Label>
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
                <Label htmlFor="text-data">Or Paste Text / Feed Payload</Label>
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
                  <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                   <><FileUp className="mr-2 h-4 w-4" /> Log early sighting</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
