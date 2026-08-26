export type DemoRole = {
  id: string;
  name: string;
  role: "Operations Analyst" | "Reviewer" | "Operations Manager";
  desk: string;
};

export const demoRoles: DemoRole[] = [
  { id: "USR-001", name: "Aisha Mehta", role: "Operations Analyst", desk: "London Operations" },
  { id: "USR-002", name: "Daniel Reed", role: "Reviewer", desk: "London Operations" },
  { id: "USR-003", name: "Maya Shah", role: "Operations Manager", desk: "Global Oversight" },
];

const storageKey = "corporate-actions-demo-role";

export function getDemoRole(): DemoRole {
  if (typeof window === "undefined") return demoRoles[0];
  const savedId = window.localStorage.getItem(storageKey);
  return demoRoles.find((role) => role.id === savedId) ?? demoRoles[0];
}

export function setDemoRole(id: string): DemoRole {
  const role = demoRoles.find((candidate) => candidate.id === id) ?? demoRoles[0];
  window.localStorage.setItem(storageKey, role.id);
  window.dispatchEvent(new Event("demo-role-change"));
  return role;
}

export async function signInDemoRole(id: string): Promise<DemoRole> {
  const response = await fetch("/api/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actorId: id }),
  });
  if (!response.ok) {
    throw new Error("Could not establish the selected operational session.");
  }
  return response.json() as Promise<DemoRole>;
}