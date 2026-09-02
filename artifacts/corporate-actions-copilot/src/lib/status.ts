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
};

export const statusOptions = [...new Set(Object.values(STATUS_LABELS))];
export const fundManagerStatus = (status: string, earlySighting = false) =>
  earlySighting ? "Awaiting custodian" : STATUS_LABELS[status] ?? status;
export const isDecisionNeeded = (status: string) => status === "Election required";
export const isComplete = (status: string) => status === "Closed" || status === "Reconciled";