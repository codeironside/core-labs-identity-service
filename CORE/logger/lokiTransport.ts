import type { TransportTargetOptions } from "pino";
import type { LokiOptions } from "pino-loki";

const GRAFANA_LOKI_PUSH_PATH = "/loki/api/v1/push";

export const LOKI_SERVICE_LABEL = "content-studio";

export const LOKI_PROPS_TO_LABELS: readonly string[] = ["component"];

export const LOKI_BATCH_INTERVAL_SECONDS = 5;

export interface GrafanaLokiCredentials {
  readonly host: string;
  readonly userId: string;
  readonly apiToken: string;
}

export interface GrafanaLokiLabelContext {
  readonly env: string;
  readonly serviceLabel?: string;
}

export function normalizeGrafanaLokiHost(host: string): string {
  const trimmed: string = host.trim().replace(/\/+$/u, "");
  if (trimmed.toLowerCase().endsWith(GRAFANA_LOKI_PUSH_PATH)) {
    return trimmed.slice(0, -GRAFANA_LOKI_PUSH_PATH.length);
  }
  return trimmed;
}

export function isGrafanaLokiConfigured(
  host: string | undefined,
  userId: string | undefined,
  apiToken: string | undefined,
): boolean {
  return Boolean(host?.trim() && userId?.trim() && apiToken?.trim());
}

export function buildGrafanaLokiOptions(
  credentials: GrafanaLokiCredentials,
  labels: GrafanaLokiLabelContext,
): LokiOptions {
  const serviceLabel: string = labels.serviceLabel ?? LOKI_SERVICE_LABEL;
  return {
    host: normalizeGrafanaLokiHost(credentials.host),
  replaceTimestamp: true,
    batching: { interval: LOKI_BATCH_INTERVAL_SECONDS },
    labels: {
      service: serviceLabel,
      env: labels.env,
    },
    propsToLabels: [...LOKI_PROPS_TO_LABELS],
    basicAuth: {
      username: credentials.userId,
      password: credentials.apiToken,
    },
    silenceErrors: false,
  };
}

export function buildGrafanaLokiTransportTarget(
  credentials: GrafanaLokiCredentials,
  labels: GrafanaLokiLabelContext,
  level: string,
): TransportTargetOptions {
  return {
    target: "pino-loki",
    level,
    options: buildGrafanaLokiOptions(credentials, labels),
  };
}
