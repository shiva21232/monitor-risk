import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type AgentConfig = {
  modelId: string;
  region: string;
  temperature: number;
  prompt: string;
  promptRevision: string;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(): AgentConfig {
  const prompt = readFileSync(join(root, "config", "prompt.md"), "utf8").trim();
  const file = JSON.parse(readFileSync(join(root, "config", "agent.json"), "utf8")) as {
    modelId?: string;
    region?: string;
    temperature?: number;
  };
  return {
    modelId: process.env.BEDROCK_MODEL_ID || file.modelId || "amazon.nova-micro-v1:0",
    region: process.env.AWS_REGION || file.region || "us-east-1",
    temperature: file.temperature ?? 0,
    prompt,
    promptRevision: createHash("sha256").update(prompt).digest("hex").slice(0, 12),
  };
}
