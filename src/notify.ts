import { createHmac } from "node:crypto";

import type { Finding, WebhookResult } from "./schemas.js";

export function webhookUrl(): string {
  return (process.env.RISK_WEBHOOK_URL ?? "").trim();
}

export function webhookSecret(): string {
  return (process.env.RISK_WEBHOOK_SECRET ?? "").trim();
}

export function signBody(body: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

export function alertBody(findings: Finding[]): string {
  return JSON.stringify({
    event: "risk.detected",
    findings: findings.map((item) => ({
      customer_id: item.customer_id,
      merchant: item.merchant,
      amount: item.amount,
      timestamp: item.timestamp,
      reason: item.reason,
    })),
  });
}

export async function notify(findings: Finding[], fetchImpl: typeof fetch = fetch): Promise<WebhookResult> {
  const url = webhookUrl();
  if (!url) {
    return { called: false, status_code: null, detail: "RISK_WEBHOOK_URL is not set." };
  }
  const secret = webhookSecret();
  if (!secret) {
    return { called: false, status_code: null, detail: "RISK_WEBHOOK_SECRET is not set." };
  }
  const body = alertBody(findings);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-risk-signature": signBody(body, secret),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (response.status >= 400) {
      return { called: true, status_code: response.status, detail: "Webhook rejected the alert." };
    }
    return { called: true, status_code: response.status, detail: "Risk team notified." };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    return { called: true, status_code: null, detail: `Webhook request failed: ${name}` };
  }
}
