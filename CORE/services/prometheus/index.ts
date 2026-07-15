import client from "prom-client";
import type { Request, Response } from "express";

client.collectDefaultMetrics();

export const register = client.register;

export async function getMetrics(
  _req: Request,
  res: Response,
): Promise<void> {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
}
