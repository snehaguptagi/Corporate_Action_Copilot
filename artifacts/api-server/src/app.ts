import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();
const allowedCorsOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function requestOrigin(req: express.Request): string | null {
  const host = req.get("x-forwarded-host")?.split(",")[0].trim() ?? req.get("host");
  if (!host) return null;
  const protocol = req.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.protocol;
  return `${protocol}://${host}`;
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && origin !== requestOrigin(req) && !allowedCorsOrigins.has(origin)) {
    res.status(403).json({ error: "Cross-origin requests are not allowed." });
    return;
  }
  next();
});
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    callback(null, Boolean(origin && allowedCorsOrigins.has(origin)));
  },
}));
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required to protect application sessions.");
}
app.use(cookieParser(sessionSecret));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found." });
});
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  req.log.error({ err: error }, "Unhandled application error");
  res.status(500).json({ error: "Internal server error." });
});

export default app;
