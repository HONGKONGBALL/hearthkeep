import express, { type Express } from "express";
import { healthReport, openRepositoryFromEnv, type HealthEnv, type Repository } from "@hearthkeep/core";
import { allowOrigin, mountMcp, type McpEnv } from "./mcp";
import { mountSim } from "./sim";

export interface AppEnv extends HealthEnv, McpEnv {
  HK_HOST?: string | undefined;
  HK_PORT?: string | undefined;
}

export function createApp(env: AppEnv = process.env): Express {
  const app = express();
  app.disable("x-powered-by");
  let repository: Repository | undefined;
  const getRepo = (): Repository => {
    if (repository === undefined) repository = openRepositoryFromEnv(env);
    return repository;
  };
  app.get("/healthz", (req, res) => {
    if (!allowOrigin(req, res, env)) return;
    res.status(200).json(healthReport(env, getRepo().now()));
  });
  mountSim(app, env, getRepo);
  mountMcp(app, env, getRepo);
  return app;
}
