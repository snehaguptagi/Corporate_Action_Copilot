import { spawn } from "node:child_process";

const apiPort = process.env.API_PORT ?? "8080";

const processes = [
  {
    name: "api",
    args: ["--filter", "@workspace/api-server", "run", "dev"],
    env: { NODE_ENV: "development", API_PORT: apiPort, PORT: apiPort },
  },
  {
    name: "web",
    args: ["--filter", "@workspace/corporate-actions-copilot", "run", "dev"],
    env: {
      NODE_ENV: "development",
      API_PORT: apiPort,
      PORT: process.env.WEB_PORT ?? "25700",
      BASE_PATH: process.env.BASE_PATH ?? "/",
    },
  },
];

const children = processes.map(({ name, args, env }) => {
  const child = spawn("pnpm", args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal === null) {
      console.error(`${name} process exited with code ${code ?? "unknown"}`);
    }
  });
  return child;
});

const shutdown = (signal) => {
  for (const child of children) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));