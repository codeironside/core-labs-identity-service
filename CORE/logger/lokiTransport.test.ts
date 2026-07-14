import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOKI_BATCH_INTERVAL_SECONDS,
  LOKI_PROPS_TO_LABELS,
  LOKI_SERVICE_LABEL,
  buildGrafanaLokiOptions,
  buildGrafanaLokiTransportTarget,
  isGrafanaLokiConfigured,
  normalizeGrafanaLokiHost,
} from "./lokiTransport";

test("normalizeGrafanaLokiHost strips push path and trailing slashes", (): void => {
  assert.equal(
    normalizeGrafanaLokiHost("https://logs-prod-042.grafana.net/loki/api/v1/push"),
    "https://logs-prod-042.grafana.net",
  );
  assert.equal(
    normalizeGrafanaLokiHost("https://logs-prod-042.grafana.net/"),
    "https://logs-prod-042.grafana.net",
  );
  assert.equal(
    normalizeGrafanaLokiHost("https://logs-prod-042.grafana.net"),
    "https://logs-prod-042.grafana.net",
  );
});

test("isGrafanaLokiConfigured requires host, userId, and apiToken", (): void => {
  assert.equal(isGrafanaLokiConfigured(undefined, "1", "token"), false);
  assert.equal(isGrafanaLokiConfigured("https://logs.example.com", undefined, "token"), false);
  assert.equal(isGrafanaLokiConfigured("https://logs.example.com", "1", "  "), false);
  assert.equal(isGrafanaLokiConfigured("https://logs.example.com", "1", "token"), true);
});

test("buildGrafanaLokiOptions maps Grafana Cloud credentials and labels", (): void => {
  const options = buildGrafanaLokiOptions(
    {
      host: "https://logs-prod-042.grafana.net/loki/api/v1/push",
      userId: "1668921",
      apiToken: "glc_test_token",
    },
    { env: "development" },
  );

  assert.equal(options.host, "https://logs-prod-042.grafana.net");
  assert.equal(options.replaceTimestamp, true);
  assert.deepEqual(options.labels, {
    service: LOKI_SERVICE_LABEL,
    env: "development",
  });
  assert.deepEqual(options.propsToLabels, [...LOKI_PROPS_TO_LABELS]);
  assert.deepEqual(options.basicAuth, {
    username: "1668921",
    password: "glc_test_token",
  });
  assert.deepEqual(options.batching, { interval: LOKI_BATCH_INTERVAL_SECONDS });
});

test("buildGrafanaLokiTransportTarget targets pino-loki", (): void => {
  const target = buildGrafanaLokiTransportTarget(
    {
      host: "https://logs-prod-042.grafana.net",
      userId: "1668921",
      apiToken: "glc_test_token",
    },
    { env: "staging", serviceLabel: "content-studio" },
    "info",
  );

  assert.equal(target.target, "pino-loki");
  assert.equal(target.level, "info");
  assert.ok(target.options);
});
