import type { Request, Response } from "express";

export type OperationalActor = {
  id: string;
  name: string;
  role: "Operations Analyst" | "Reviewer" | "Operations Manager";
};

const actorCookieName = "corporate_actions_actor";
const operationalRoles = ["Operations Analyst", "Reviewer", "Operations Manager"] as const;

function isOperationalRole(role: unknown): role is OperationalActor["role"] {
  return typeof role === "string" && (operationalRoles as readonly string[]).includes(role);
}

export function getAuthenticatedActor(req: Request): OperationalActor | null {
  const rawActor = req.signedCookies?.[actorCookieName];
  if (typeof rawActor !== "string") return null;

  try {
    const actor = JSON.parse(rawActor) as Partial<OperationalActor>;
    if (
      typeof actor.id !== "string" ||
      typeof actor.name !== "string" ||
      !isOperationalRole(actor.role)
    ) {
      return null;
    }
    return { id: actor.id, name: actor.name, role: actor.role };
  } catch {
    return null;
  }
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