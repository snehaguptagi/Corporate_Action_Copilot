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