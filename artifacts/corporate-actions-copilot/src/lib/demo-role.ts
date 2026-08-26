export type DemoRole = {
  id: string;
  name: string;
  role: "Operations Analyst" | "Reviewer" | "Operations Manager";
  desk: string;
};

const pocRoles: DemoRole[] = [
  { id: "USR-001", name: "Aisha Mehta", role: "Operations Analyst", desk: "London Operations" },
  { id: "USR-002", name: "Daniel Reed", role: "Reviewer", desk: "London Operations" },
  { id: "USR-003", name: "Maya Shah", role: "Operations Manager", desk: "Global Oversight" },
];

// The picker is intentionally compiled out of production builds. Production
// identity and permissions come from the server-side identity gateway.
export const demoRoles: DemoRole[] = import.meta.env.DEV ? pocRoles : [];

const storageKey = "corporate-actions-demo-role";

export function getDemoRole(): DemoRole {
  if (typeof window === "undefined") return pocRoles[0];
  const savedId = window.localStorage.getItem(storageKey);
  return pocRoles.find((role) => role.id === savedId) ?? pocRoles[0];
}

export function setDemoRole(id: string): DemoRole {
  const role = demoRoles.find((candidate) => candidate.id === id) ?? demoRoles[0];
  window.localStorage.setItem(storageKey, role.id);
  window.dispatchEvent(new Event("demo-role-change"));
  return role;
}

export async function signInDemoRole(id: string): Promise<DemoRole> {
  if (!import.meta.env.DEV) {
    throw new Error("Demo operator sessions are unavailable in production.");
  }
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

export type OperationalSession = {
  id: string;
  name: string;
  role: DemoRole["role"];
};

export async function getOperationalSession(): Promise<OperationalSession> {
  const response = await fetch("/api/session", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("No operational role is assigned to this identity.");
  }
  return response.json() as Promise<OperationalSession>;
}