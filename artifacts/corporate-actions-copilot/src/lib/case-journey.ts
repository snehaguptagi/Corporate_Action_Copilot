export type CaseStageId =
  | "notice"
  | "validate"
  | "exposure"
  | "impact"
  | "decision"
  | "execute"
  | "reconcile";

export type CaseStageState =
  | "completed"
  | "current"
  | "blocked"
  | "attention"
  | "not-required"
  | "future";

export type CaseStage = {
  id: CaseStageId;
  label: string;
  state: CaseStageState;
  detail: string;
};

const baseStages: Array<Pick<CaseStage, "id" | "label">> = [
  { id: "notice", label: "Notice" },
  { id: "validate", label: "Validate" },
  { id: "exposure", label: "Exposure" },
  { id: "impact", label: "Impact" },
  { id: "decision", label: "Decision" },
  { id: "execute", label: "Execute" },
  { id: "reconcile", label: "Reconcile & Close" },
];

export function isElective(processingType: string) {
  return processingType !== "Mandatory";
}

export function getCaseStages(event: any): CaseStage[] {
  const elective = isElective(event.processingType);
  const missingTerms = event.validation?.missingTerms?.length ?? 0;
  const hasImpacts = (event.impacts?.length ?? 0) > 0;
  const status = event.status;

  let current: CaseStageId = "notice";
  if (status === "Under review" || status === "Received" || missingTerms) current = "validate";
  else if (status === "Validated") current = "impact";
  else if (!hasImpacts) current = "exposure";
  else if (status === "Election required" || status === "Awaiting approval") current = "decision";
  else if (status === "Approved") current = "execute";
  else if (["Awaiting settlement", "Break identified", "Reconciled", "Closed"].includes(status)) current = "reconcile";
  else current = "impact";

  const currentIndex = baseStages.findIndex((stage) => stage.id === current);

  return baseStages.map((stage, index) => {
    if (!elective && (stage.id === "decision" || stage.id === "execute")) {
      return {
        ...stage,
        state: "not-required",
        detail: stage.id === "decision"
          ? "Not required for this mandatory event."
          : "No instruction is required for this mandatory event.",
      };
    }

    if (stage.id === "validate" && missingTerms) {
      return { ...stage, state: current === "validate" ? "attention" : "blocked", detail: "Required term review is outstanding." };
    }
    if (stage.id === "impact" && missingTerms) {
      return { ...stage, state: "blocked", detail: "Validate all required terms first." };
    }
    if (stage.id === "decision" && elective && status === "Awaiting approval") {
      return { ...stage, state: "attention", detail: "Independent reviewer approval is required." };
    }
    if (stage.id === "execute" && elective && !["Approved", "Awaiting settlement", "Break identified", "Reconciled", "Closed"].includes(status)) {
      return { ...stage, state: "blocked", detail: "Election and checker approval are required." };
    }
    if (stage.id === "reconcile" && !["Awaiting settlement", "Break identified", "Reconciled", "Closed"].includes(status)) {
      return { ...stage, state: "future", detail: "Settlement can be recorded after execution." };
    }
    if (index < currentIndex) return { ...stage, state: "completed", detail: "Completed for the current case state." };
    if (stage.id === current) return { ...stage, state: "current", detail: "Current operational control point." };
    return { ...stage, state: "future", detail: "Available when prior controls are complete." };
  });
}

export function getPriorityReason(event: any) {
  if (event.status === "Break identified") return "Settlement break — investigate the variance";
  if (event.status === "Under review") return "Blocked — a critical term needs validation";
  if (event.status === "Received") return "Review required — validate the extracted notice terms";
  if (event.status === "Election required") return "Decision required before the internal deadline";
  if (event.status === "Awaiting approval") return "Awaiting independent checker approval";
  if (event.status === "Awaiting settlement") return "Monitor the expected settlement";
  return "Normal operational monitoring";
}