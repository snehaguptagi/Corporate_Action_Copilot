import type { Request, Response } from "express";
import { demoUsers } from "./corporate-actions-v2";

export type OperationalActor = {
  id: string;
  name: string;
  role: "Operations Analyst" | "Reviewer" | "Operations Manager";
};

export const actorCookieName = "corporate_actions_actor";
const operationalRoles = ["Operations Analyst", "Reviewer", "Operations Manager"] as const;

function isOperationalRole(role: unknown): role is OperationalActor["role"] {
  return typeof role === "string" && (operationalRoles as readonly string[]).includes(role);
}

export function getAuthenticatedActor(req: Request): OperationalActor | null {
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