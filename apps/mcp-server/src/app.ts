import express, { type Express } from "express";
import { healthReport, type HealthEnv } from "@hearthkeep/core";

export interface AppEnv extends HealthEnv {
  HK_HOST?: string | undefined;
  HK_PORT?: string | undefined;
}

export function createApp(env: AppEnv = process.env): Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) => {
    res.status(200).json(healthReport(env));
  });
  return app;
}
