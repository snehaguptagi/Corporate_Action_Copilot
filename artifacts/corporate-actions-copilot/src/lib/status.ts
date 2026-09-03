const STATUS_LABELS: Record<string, string> = {
  "Election required": "Your decision needed",
  "Validated": "Ready to decide",
  "Under review": "Terms being confirmed",
  "Monitoring": "No action needed",
  "Awaiting approval": "With Compliance",
  "Awaiting settlement": "Settling",
  "Break identified": "Settlement break",
  "Closed": "Complete",
  "Reconciled": "Complete",
  "Early sighting": "Awaiting custodian",
  "Election submitted": "With Compliance",
  "Approved": "Approved, settling next",
};

export const statusOptions = [...new Set(Object.values(STATUS_LABELS))];

/** The five steps every corporate action walks through, in plain language. */
export const journeyStages = [
  { id: "arrive", label: "Notice arrives", hint: "Found on the web or sent by the custodian" },
  { id: "analyse", label: "Analysed against your schemes", hint: "Which schemes hold it and what it is worth" },
  { id: "decide", label: "Decision", hint: "You choose what to do; automatic events skip this" },
  { id: "approve", label: "Compliance approval", hint: "A second person signs off" },
  { id: "settle", label: "Settlement", hint: "Cash and shares arrive and are checked" },
] as const;

/** Where a case sits on the journey. Returns 0-4, or 5 when fully complete. */
export function journeyStageIndex(status: string, earlySighting = false): number {
  if (isComplete(status)) return 5;
  // An early sighting has arrived but its terms are not confirmed yet.
  if (earlySighting || status === "Early sighting") return 0;
  if (status === "Under review" || status === "Monitoring" || status === "Validated") return 1;
  if (status === "Election required") return 2;
  if (status === "Awaiting approval" || status === "Election submitted") return 3;
  if (status === "Approved" || status === "Awaiting settlement" || status === "Break identified") return 4;
  return 1;
}
export const fundManagerStatus = (status: string, earlySighting = false) =>
  earlySighting ? "Awaiting custodian" : STATUS_LABELS[status] ?? status;
export const isDecisionNeeded = (status: string) => status === "Election required";
export const isComplete = (status: string) => status === "Closed" || status === "Reconciled";