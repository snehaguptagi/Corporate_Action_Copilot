import {
  useGetEvent,
  useUpdateEvent,
  useSaveElection,
  useApproveEvent,
  useUpdateInstruction,
  useSaveReconciliation,
  getGetEventQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ArrowLeft, CheckCircle2, FileText, Send, Save, Check, RefreshCw, AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

export default function EventWorkbench() {
  const params = useParams();
  const eventId = params.eventId as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: event, isLoading, isError } = useGetEvent(eventId);
  
  // Mutations
  const updateEvent = useUpdateEvent();
  const saveElection = useSaveElection();
  const approveEvent = useApproveEvent();
  const updateInstruction = useUpdateInstruction();
  const saveReconciliation = useSaveReconciliation();

  // Local state for edits
  const [editingTerms, setEditingTerms] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [reconActual, setReconActual] = useState<string>("");
  const [reconNote, setReconNote] = useState<string>("");

  const refreshEvent = () => {
    queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
  };

  const handleApprove = (approved: boolean) => {
    approveEvent.mutate(
      { eventId, data: { approved, note: approved ? "Analyst approval recorded" : "Returned for review" } },
      {
        onSuccess: () => {
          toast({ title: approved ? "Event approved" : "Event rejected" });
          refreshEvent();
        },
      }
    );
  };

  const handleTermSave = (key: string, originalValue: string) => {
    const newValue = editingTerms[key];
    if (newValue === undefined || newValue === originalValue) return;
    
    updateEvent.mutate(
      { eventId, data: { terms: [{ key, value: newValue }] } },
      {
        onSuccess: () => {
          toast({ title: "Term updated" });
          setEditingTerms(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          refreshEvent();
        },
      }
    );
  };

  const handleElectionSave = (impactId: string) => {
    const optionId = selectedOptions[impactId];
    if (!optionId) return;

    saveElection.mutate(
      { eventId, data: { impactId, optionId } },
      {
        onSuccess: () => {
          toast({ title: "Election saved" });
          refreshEvent();
        },
      }
    );
  };

  const handleInstructionStatus = (status: string) => {
    updateInstruction.mutate(
      { eventId, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Instruction ${status.toLowerCase()}` });
          refreshEvent();
        },
      }
    );
  };

  const handleReconciliationSave = () => {
    const actual = Number(reconActual);
    if (isNaN(actual)) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    
    saveReconciliation.mutate(
      { eventId, data: { actual, note: reconNote } },
      {
        onSuccess: () => {
          toast({ title: "Reconciliation updated" });
          refreshEvent();
        }
      }
    );
  };

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "Shares") {
      return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} shares`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center">Loading workbench...</div>;
  }
  
  if (isError || !event) {
    return <div className="flex-1 flex items-center justify-center text-destructive">Failed to load event data.</div>;
  }

  const getRiskBadge = (risk: string) => {
    switch (risk.toUpperCase()) {
      case 'HIGH': return <Badge variant="destructive" className="uppercase text-[10px]">High Risk</Badge>;
      case 'MEDIUM': return <Badge variant="warning" className="uppercase text-[10px]">Medium Risk</Badge>;
      default: return <Badge variant="secondary" className="uppercase text-[10px]">Low Risk</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PENDING_REVIEW': return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Needs Review</Badge>;
      case 'PROCESSING': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Processing</Badge>;
      case 'APPROVED': return <Badge variant="success">Approved</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100/50">
      {/* Top Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link href="/events">
            <Button variant="ghost" size="icon" className="-ml-2 text-slate-500">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-slate-900 font-mono tracking-tight">{event.reference}</h1>
              {getStatusBadge(event.status)}
              {getRiskBadge(event.risk)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{event.security}</span>
              <span>•</span>
              <span>{event.eventType}</span>
              <span>•</span>
              <span>{event.issuer}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right mr-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Internal Deadline</div>
            <div className="text-sm font-medium text-slate-900">{event.internalDeadline}</div>
          </div>
          <Button 
            variant="outline" 
            className="border-primary/20 text-primary hover:bg-primary/5"
            onClick={() => handleApprove(false)}
            disabled={approveEvent.isPending || event.status === 'APPROVED'}
          >
            Reject / Flag
          </Button>
          <Button 
            variant="default"
            className="bg-primary shadow-md hover:bg-primary/90"
            onClick={() => handleApprove(true)}
            disabled={approveEvent.isPending || event.status === 'APPROVED'}
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            Approve Event
          </Button>
        </div>
      </header>

      {/* Main Split View */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Panel - Source Document */}
          <Panel defaultSize={35} minSize={25} maxSize={50} className="bg-slate-50 border-r flex flex-col relative">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileText className="w-4 h-4 text-primary" />
                Source Notice
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono">{event.notice.documentName}</Badge>
            </div>
            <ScrollArea className="flex-1 p-6">
              <div className="bg-white rounded-sm border shadow-xs p-8 min-h-[800px]">
                <div className="mb-8 border-b pb-4">
                  <h2 className="text-2xl font-serif text-slate-900 mb-2">{event.issuer} - Corporate Action Notice</h2>
                  <div className="text-sm text-slate-500 space-y-1">
                    <p>Source: {event.notice.source}</p>
                    <p>Received: {format(new Date(event.notice.receivedAt), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                </div>
                <div className="prose prose-sm prose-slate max-w-none prose-headings:font-serif">
                  <div className="whitespace-pre-wrap font-serif text-slate-800 leading-relaxed">
                    {event.notice.excerpt}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </Panel>

          <PanelResizeHandle className="w-1 bg-slate-200 hover:bg-primary/50 transition-colors cursor-col-resize z-10" />

          {/* Right Panel - Workbench */}
          <Panel defaultSize={65} minSize={50} className="flex flex-col bg-white">
            <Tabs defaultValue="terms" className="flex-1 flex flex-col h-full">
              <div className="px-4 border-b bg-slate-50 pt-2 shrink-0">
                <TabsList className="bg-transparent space-x-2">
                  <TabsTrigger value="terms" className="data-[state=active]:shadow-none data-[state=active]:bg-white data-[state=active]:border-b-0 border border-transparent border-b-0 rounded-b-none px-4">
                    Terms Extraction
                  </TabsTrigger>
                  <TabsTrigger value="impacts" className="data-[state=active]:shadow-none data-[state=active]:bg-white data-[state=active]:border-b-0 border border-transparent border-b-0 rounded-b-none px-4">
                    Impact & Elections
                  </TabsTrigger>
                  <TabsTrigger value="instructions" className="data-[state=active]:shadow-none data-[state=active]:bg-white data-[state=active]:border-b-0 border border-transparent border-b-0 rounded-b-none px-4">
                    Instructions (Draft)
                  </TabsTrigger>
                  <TabsTrigger value="reconciliation" className="data-[state=active]:shadow-none data-[state=active]:bg-white data-[state=active]:border-b-0 border border-transparent border-b-0 rounded-b-none px-4">
                    Reconciliation
                  </TabsTrigger>
                  <TabsTrigger value="audit" className="data-[state=active]:shadow-none data-[state=active]:bg-white data-[state=active]:border-b-0 border border-transparent border-b-0 rounded-b-none px-4">
                    Activity
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-6">
                  
                  {/* TERMS TAB */}
                  <TabsContent value="terms" className="m-0 mt-0 focus-visible:outline-none">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold text-slate-900">Extracted Terms</h2>
                      <p className="text-sm text-slate-500">Review AI-extracted data against the source document.</p>
                    </div>
                    
                    <div className="space-y-4">
                      {event.terms.map((term) => {
                        const isEditing = editingTerms[term.key] !== undefined;
                        const currentValue = isEditing ? editingTerms[term.key] : term.value;
                        const hasChanges = isEditing && currentValue !== term.value;
                        
                        return (
                          <div key={term.key} className="flex gap-4 p-4 rounded-lg border border-slate-200 bg-white shadow-2xs hover:border-slate-300 transition-colors">
                            <div className="w-1/3 shrink-0">
                              <div className="text-sm font-semibold text-slate-700">{term.label}</div>
                              <div className="text-xs text-slate-400 mt-1 font-mono">{term.key}</div>
                              
                              <div className="mt-4 flex items-center gap-2">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Confidence</span>
                                <Progress value={term.confidence * 100} className="w-20" />
                                <span className="text-[10px] font-mono text-slate-500">{Math.round(term.confidence * 100)}%</span>
                              </div>
                            </div>
                            
                            <div className="flex-1 flex flex-col">
                              <div className="flex gap-2">
                                <Input 
                                  value={currentValue}
                                  onChange={(e) => setEditingTerms({...editingTerms, [term.key]: e.target.value})}
                                  className={`flex-1 font-mono text-sm ${hasChanges ? 'border-primary/50 bg-primary/5' : 'bg-slate-50'}`}
                                />
                                {hasChanges && (
                                  <Button size="sm" onClick={() => handleTermSave(term.key, term.value)}>
                                    <Check className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                              <div className="mt-3 p-3 bg-amber-50/50 rounded text-xs border border-amber-100 text-amber-900 leading-relaxed font-serif relative">
                                <span className="absolute -top-2 left-2 px-1 bg-amber-100/50 text-[9px] font-bold text-amber-700 rounded-sm">EVIDENCE (Pg {term.page})</span>
                                "{term.evidence}"
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </TabsContent>

                  {/* IMPACTS TAB */}
                  <TabsContent value="impacts" className="m-0 mt-0 focus-visible:outline-none">
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Account Impacts & Elections</h2>
                        <p className="text-sm text-slate-500">Review eligible accounts and record client elections.</p>
                      </div>
                      <Badge variant="outline" className="text-slate-600 font-mono">
                        Total Exposure: {formatCurrency(event.amount, event.currency)}
                      </Badge>
                    </div>

                    <Card className="shadow-xs mb-6 border-slate-200">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="font-semibold text-slate-600">Fund / Account</TableHead>
                            <TableHead className="text-right font-semibold text-slate-600">Eligible Qty</TableHead>
                            <TableHead className="text-right font-semibold text-slate-600">Expected ({event.currency})</TableHead>
                            <TableHead className="font-semibold text-slate-600">Status</TableHead>
                            <TableHead className="font-semibold text-slate-600">Election</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {event.impacts.map(impact => (
                            <TableRow key={impact.id}>
                              <TableCell>
                                <div className="font-medium text-slate-900">{impact.fund}</div>
                                <div className="text-xs text-slate-500 font-mono">{impact.account}</div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">{impact.eligibleQuantity.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-mono font-medium text-slate-900">{formatCurrency(impact.expected, impact.currency)}</TableCell>
                              <TableCell>
                                <Badge variant={impact.status === 'READY' ? 'success' : 'outline'}>{impact.status}</Badge>
                              </TableCell>
                              <TableCell>
                                {impact.election ? (
                                  <Badge variant="secondary" className="bg-slate-100 text-slate-800">
                                    {event.options.find(o => o.id === impact.election)?.label || impact.election}
                                  </Badge>
                                ) : (
                                  <Select 
                                    value={selectedOptions[impact.id] || ""} 
                                    onValueChange={(val) => setSelectedOptions({...selectedOptions, [impact.id]: val})}
                                  >
                                    <SelectTrigger className="w-[180px] h-8 text-xs">
                                      <SelectValue placeholder="Select option..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {event.options.map(opt => (
                                        <SelectItem key={opt.id} value={opt.id} className="text-xs">
                                          {opt.label} {opt.default && "(Default)"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {!impact.election && selectedOptions[impact.id] && (
                                  <Button size="sm" onClick={() => handleElectionSave(impact.id)}>
                                    <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                      {event.options.map(opt => (
                        <Card key={opt.id} className={`shadow-xs ${opt.default ? 'border-primary/30 bg-primary/5' : 'border-slate-200'}`}>
                          <CardHeader className="p-4 pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">{opt.label}</CardTitle>
                              {opt.default && <Badge variant="outline" className="text-[10px] text-primary border-primary">DEFAULT</Badge>}
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            <p className="text-xs text-slate-600 mb-2">{opt.description}</p>
                            <div className="text-xs font-mono text-slate-500 bg-slate-50 p-2 rounded border">{opt.result}</div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>

                  {/* INSTRUCTIONS TAB */}
                  <TabsContent value="instructions" className="m-0 mt-0 focus-visible:outline-none">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold text-slate-900">SWIFT / Market Instructions</h2>
                      <p className="text-sm text-slate-500">Review and authorise generated outgoing instructions.</p>
                    </div>

                    <Card className="border-slate-200 shadow-xs">
                      <CardHeader className="bg-slate-50 border-b p-4 flex flex-row items-center justify-between space-y-0">
                        <div className="flex flex-col gap-1">
                          <div className="text-sm font-semibold text-slate-700">Destination: {event.instruction.destination}</div>
                          <div className="text-xs text-slate-500 font-mono">Ref: {event.instruction.reference}</div>
                        </div>
                        <Badge variant={event.instruction.status === 'DRAFT' ? 'secondary' : 'success'} className="uppercase">
                          {event.instruction.status}
                        </Badge>
                      </CardHeader>
                      <CardContent className="p-0 relative">
                        <div className="absolute top-4 right-4 text-slate-300 pointer-events-none">
                          <ExternalLink className="w-24 h-24 opacity-10" />
                        </div>
                        <pre className="p-6 font-mono text-xs text-slate-800 bg-white whitespace-pre-wrap leading-relaxed">
                          {event.instruction.content}
                        </pre>
                      </CardContent>
                      <CardFooter className="bg-slate-50 border-t p-4 flex justify-end gap-3">
                        {event.instruction.status === 'DRAFT' && (
                          <>
                            <Button variant="outline" onClick={() => toast({ title: "Simulating..." })}>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Regenerate
                            </Button>
                            <Button className="bg-primary hover:bg-primary/90" onClick={() => handleInstructionStatus('SIMULATED_SENT')}>
                              <Send className="w-4 h-4 mr-2" />
                              Issue Instruction (Draft)
                            </Button>
                          </>
                        )}
                        {event.instruction.status !== 'DRAFT' && (
                          <div className="text-sm text-slate-500 flex items-center">
                            <CheckCircle2 className="w-4 h-4 text-success mr-2" />
                            Instruction recorded as {event.instruction.status}
                          </div>
                        )}
                      </CardFooter>
                    </Card>
                  </TabsContent>

                  {/* RECONCILIATION TAB */}
                  <TabsContent value="reconciliation" className="m-0 mt-0 focus-visible:outline-none">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold text-slate-900">Settlement Reconciliation</h2>
                      <p className="text-sm text-slate-500">Ensure expected proceeds match actual market postings.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-6 mb-6">
                      <Card className="shadow-xs border-slate-200">
                        <CardHeader className="p-4 pb-2">
                          <CardTitle className="text-xs text-slate-500 uppercase">Expected Proceeds</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="text-2xl font-mono text-slate-900">{formatCurrency(event.reconciliation.expected, event.currency)}</div>
                        </CardContent>
                      </Card>
                      <Card className="shadow-xs border-slate-200">
                        <CardHeader className="p-4 pb-2">
                          <CardTitle className="text-xs text-slate-500 uppercase">Actual Postings</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="text-2xl font-mono text-slate-900">{formatCurrency(event.reconciliation.actual, event.currency)}</div>
                        </CardContent>
                      </Card>
                      <Card className={`shadow-xs ${event.reconciliation.difference > event.reconciliation.tolerance ? 'border-destructive bg-destructive/5' : 'border-slate-200'}`}>
                        <CardHeader className="p-4 pb-2">
                          <CardTitle className="text-xs text-slate-500 uppercase flex items-center justify-between">
                            Difference
                            {event.reconciliation.difference > event.reconciliation.tolerance && <AlertTriangle className="w-4 h-4 text-destructive" />}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className={`text-2xl font-mono ${event.reconciliation.difference > event.reconciliation.tolerance ? 'text-destructive' : 'text-slate-900'}`}>
                            {formatCurrency(event.reconciliation.difference, event.currency)}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="shadow-xs border-slate-200">
                      <CardHeader className="bg-slate-50 border-b px-6 py-4">
                        <CardTitle className="text-sm">Manual Adjustment</CardTitle>
                        <CardDescription>Record manual settlement postings to resolve breaks.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label>Actual Amount ({event.currency})</Label>
                            <Input 
                              type="number" 
                              placeholder={event.reconciliation.actual.toString()}
                              value={reconActual}
                              onChange={e => setReconActual(e.target.value)}
                              className="font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Justification / Note</Label>
                            <Textarea 
                              placeholder="e.g., partial settlement received..."
                              value={reconNote}
                              onChange={e => setReconNote(e.target.value)}
                            />
                          </div>
                        </div>
                        <Button onClick={handleReconciliationSave} disabled={saveReconciliation.isPending}>
                          Update Reconciliation
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* AUDIT TAB */}
                  <TabsContent value="audit" className="m-0 mt-0 focus-visible:outline-none">
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold text-slate-900">Event History</h2>
                      <p className="text-sm text-slate-500">Immutable audit log for this corporate action.</p>
                    </div>

                    <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                      {event.audit.map(entry => (
                        <div key={entry.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          {/* Icon */}
                          <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          {/* Card */}
                          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white shadow-2xs">
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-semibold text-sm text-slate-900">{entry.action}</div>
                              <div className="text-xs text-slate-500 font-mono">{format(new Date(entry.timestamp), 'HH:mm:ss')}</div>
                            </div>
                            <div className="text-sm text-slate-600 mb-2">{entry.detail}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                {entry.actor.substring(0,2).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium text-slate-500">{entry.actor}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
