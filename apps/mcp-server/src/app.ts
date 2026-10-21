import express, { type Express } from "express";
import { healthReport, openRepositoryFromEnv, type HealthEnv, type Repository } from "@hearthkeep/core";
import { mountMcp, type McpEnv } from "./mcp";
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
  app.get("/healthz", (_req, res) => {
    res.status(200).json(healthReport(env, getRepo().now()));
  });
  mountSim(app, env, getRepo);
  mountMcp(app, env, getRepo);
  return app;
}
