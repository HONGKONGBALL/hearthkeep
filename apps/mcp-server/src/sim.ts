import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { ClockError, simModeFromEnv, syncLifecycle, type Repository } from "@hearthkeep/core";
import { allowOrigin, type McpEnv } from "./mcp";

const CLOCK_HINT = "Expected {advanceDays: 1-400} or {set: ISO time later than now}";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notFound(res: Response): void {
  res.status(404).json({ error: "Not found" });
}

/** One of the two clock commands, or undefined when the body is not that shape. */
function readClock(body: unknown): { advanceDays: number } | { set: string } | undefined {
  if (!isPlainObject(body)) return undefined;
  const keys = Object.keys(body);
  if (keys.length !== 1) return undefined;
  if (keys[0] === "advanceDays") {
    const days = body.advanceDays;
    if (typeof days !== "number" || !Number.isInteger(days)) return undefined;
    return { advanceDays: days };
  }
  if (keys[0] === "set") {
    if (typeof body.set !== "string" || body.set.trim() === "") return undefined;
    return { set: body.set };
  }
  return undefined;
}

function readJson(req: Request, res: Response, next: NextFunction): void {
  express.json({ limit: "32kb" })(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: CLOCK_HINT });
      return;
    }
    next();
  });
}

/**
 * Simulation routes. Outside sim mode every `/sim` path is 404.
 * In sim mode the Origin allowlist matches `/mcp`.
 */
export function mountSim(app: Express, env: McpEnv, getRepo: () => Repository): void {
  const gate = (req: Request, res: Response): boolean => {
    if (!simModeFromEnv(env)) {
      notFound(res);
      return false;
    }
    return allowOrigin(req, res, env);
  };

  app.options("/sim/state", (req, res) => {
    if (!gate(req, res)) return;
    res.status(204).end();
  });

  app.options("/sim/clock", (req, res) => {
    if (!gate(req, res)) return;
    res.status(204).end();
  });

  app.options("/sim/reset", (req, res) => {
    if (!gate(req, res)) return;
    res.status(204).end();
  });

  app.get("/sim/state", (req, res) => {
    if (!gate(req, res)) return;
    syncLifecycle(getRepo());
    res.status(200).json(getRepo().snapshot());
  });

  app.post(
    "/sim/clock",
    (req, res, next) => {
      if (!gate(req, res)) return;
      readJson(req, res, next);
    },
    (req, res) => {
      const command = readClock(req.body);
      if (command === undefined) {
        res.status(400).json({ error: CLOCK_HINT });
        return;
      }
      try {
        const now =
          "advanceDays" in command ? getRepo().advanceDays(command.advanceDays) : getRepo().set(command.set);
        syncLifecycle(getRepo());
        res.status(200).json({ now });
      } catch (error) {
        if (error instanceof ClockError) {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
    },
  );

  app.post("/sim/reset", (req, res) => {
    if (!gate(req, res)) return;
    res.status(200).json(getRepo().reset());
  });

  app.use("/sim", (req, res) => {
    if (!simModeFromEnv(env)) {
      notFound(res);
      return;
    }
    if (!allowOrigin(req, res, env)) return;
    notFound(res);
  });
}
