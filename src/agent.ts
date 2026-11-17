import { Agent, BedrockModel, tool } from "@strands-agents/sdk";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { keepKnownFindings } from "./match.js";
import { notify } from "./notify.js";
import type { Finding, Summary, Transaction } from "./schemas.js";

export class ReviewError extends Error {}

export function credentialsReady(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object" || !("content" in message)) {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .join("\n");
}

function extractJson(text: string): unknown[] {
  const match = text.match(/(\[\s*\{[\s\S]*\}\s*\]|\{[\s\S]*\})/);
  if (!match) {
    return [];
  }
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { findings?: unknown }).findings)) {
      return (parsed as { findings: unknown[] }).findings;
    }
  } catch {
    return [];
  }
  return [];
}

function bedrockFailure(error: unknown): ReviewError {
  const names: string[] = [];
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
    names.push(current.name);
    messages.push(current.message);
    current = current.cause;
  }
  const message = messages.join(" ");
  const name = names.join(" ");
  if (message.includes("being verified")) {
    return new ReviewError("Amazon Bedrock is still verifying this new account. Try again in about two hours.");
  }
  if (name.includes("AccessDenied") || message.includes("AccessDenied")) {
    return new ReviewError("This key cannot call Nova Micro in us-east-1.");
  }
  const code = names.find((item) => item.endsWith("Exception")) ?? "unknown";
  return new ReviewError(`Bedrock rejected the request (${code}).`);
}

async function runAgent(transactions: Transaction[]): Promise<{ text: string; findings: Finding[] }> {
  const found: Finding[] = [];
  const notifyRiskTeam = tool({
    name: "notify_risk_team",
    description:
      "Notify the risk team about one suspicious transaction from this batch. Copy customer_id, merchant, amount, and timestamp from that transaction. reason is one short sentence.",
    inputSchema: z.object({
      customer_id: z.string(),
      merchant: z.string(),
      amount: z.number(),
      timestamp: z.string(),
      reason: z.string(),
    }),
    callback: (input) => {
      const accepted = keepKnownFindings(transactions, [input]);
      if (accepted.length === 0) {
        return "That row is not in this batch. Copy the fields exactly.";
      }
      found.push(...accepted);
      return "Recorded. Do not send this row again.";
    },
  });

  const config = loadConfig();
  const model = new BedrockModel({
    modelId: config.modelId,
    region: config.region,
    temperature: config.temperature,
  });
  const agent = new Agent({
    model,
    systemPrompt: config.prompt,
    tools: [notifyRiskTeam],
    printer: false,
    retryStrategy: null,
    sandbox: false,
  });
  const result = await agent.invoke(JSON.stringify({ transactions }));
  return { text: messageText(result.lastMessage), findings: [...found] };
}

export async function review(transactions: Transaction[]): Promise<Summary> {
  if (!credentialsReady()) {
    throw new ReviewError("AWS credentials are not configured.");
  }
  let text = "";
  let findings: Finding[] = [];
  try {
    const outcome = await runAgent(transactions);
    text = outcome.text;
    findings = outcome.findings;
  } catch (error) {
    if (error instanceof ReviewError) {
      throw error;
    }
    throw bedrockFailure(error);
  }
  if (findings.length === 0) {
    findings = keepKnownFindings(transactions, extractJson(text));
  }
  const webhook = findings.length
    ? await notify(findings)
    : { called: false, status_code: null, detail: "No suspicious transactions." };
  return {
    checked: transactions.length,
    flagged: findings.length,
    findings,
    webhook,
    duplicate: false,
  };
}
