import type { AuthUser } from "@workspace/api-zod";
import type { Request, Response } from "express";
import { demoUsers } from "./corporate-actions-v2";

export type OperationalActor = {
  id: string;
  name: string;
  role: "Operations Analyst" | "Reviewer" | "Operations Manager";
};

export const actorCookieName = "corporate_actions_actor";
const operationalRoles = ["Operations Analyst", "Reviewer", "Operations Manager"] as const;
const roleDirectoryEnvironmentKey = "CORPORATE_ACTIONS_ROLE_DIRECTORY";
type RoleDirectoryEntry = {
  id?: string;
  email?: string;
  name?: string;
  role: OperationalActor["role"];
};

function isOperationalRole(role: unknown): role is OperationalActor["role"] {
  return typeof role === "string" && (operationalRoles as readonly string[]).includes(role);
}

export function isPocEnvironment(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.CORPORATE_ACTIONS_POC === "true";
}

function roleDirectory(): RoleDirectoryEntry[] {
  const rawDirectory = process.env[roleDirectoryEnvironmentKey];
  if (!rawDirectory) return [];

  try {
    const parsed = JSON.parse(rawDirectory) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { users?: unknown }).users)
        ? (parsed as { users: unknown[] }).users
        : parsed && typeof parsed === "object"
          ? Object.entries(parsed).map(([id, value]) => (
              value && typeof value === "object" ? { id, ...value } : null
            ))
          : [];

    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Record<string, unknown>;
      if (!isOperationalRole(candidate.role)) return [];
      const id = typeof candidate.id === "string" ? candidate.id : undefined;
      const email = typeof candidate.email === "string" ? candidate.email.toLowerCase() : undefined;
      if (!id && !email) return [];
      return [{
        id,
        email,
        name: typeof candidate.name === "string" ? candidate.name : undefined,
        role: candidate.role,
      }];
    });
  } catch {
    return [];
  }
}

function displayName(user: AuthUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || user.id;
}

function actorFromRoleDirectory(user: AuthUser): OperationalActor | null {
  const email = user.email?.toLowerCase();
  const matches = roleDirectory().filter((candidate) =>
    (candidate.id && candidate.id === user.id) || (email && candidate.email === email),
  );
  if (matches.length !== 1) return null;
  const [entry] = matches;
  return {
    id: user.id,
    name: entry.name ?? displayName(user),
    role: entry.role,
  };
}

export function getAuthenticatedActor(req: Request): OperationalActor | null {
  if (req.isAuthenticated?.()) {
    return actorFromRoleDirectory(req.user);
  }
  if (!isPocEnvironment()) return null;

  const rawActor = req.signedCookies?.[actorCookieName];
  if (typeof rawActor !== "string") return null;

  try {
    const session = JSON.parse(rawActor) as { id?: unknown };
    if (typeof session.id !== "string") {
      return null;
    }
    const actor = demoUsers.find((candidate) => candidate.id === session.id);
    if (!actor || !isOperationalRole(actor.role)) return null;
    return { id: actor.id, name: actor.name, role: actor.role };
  } catch {
    return null;
  }
}

export function signInDemoActor(res: Response, actorId: string): OperationalActor | null {
  if (!isPocEnvironment()) return null;
  const actor = demoUsers.find((candidate) => candidate.id === actorId);
  if (!actor || !isOperationalRole(actor.role)) return null;
  res.cookie(actorCookieName, JSON.stringify({ id: actor.id }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    signed: true,
    maxAge: 8 * 60 * 60 * 1000,
  });
  return { id: actor.id, name: actor.name, role: actor.role };
}

export function requireActor(
  req: Request,
  res: Response,
  allowedRoles?: OperationalActor["role"][],
): OperationalActor | null {
  const actor = getAuthenticatedActor(req);
  if (!actor) {
    res.status(401).json({
      error: "An authenticated operational identity is required for this action.",
      details: ["Sign in through the trusted identity gateway before changing a corporate-action event."],
    });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(actor.role)) {
    res.status(403).json({
      error: `This action requires the ${allowedRoles.join(" or ")} role.`,
      details: [`Authenticated role is ${actor.role}.`],
    });
    return null;
  }
  return actor;
}