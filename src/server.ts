import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";

import { review, ReviewError } from "./agent.js";
import { loadConfig } from "./config.js";
import { transactionBatchSchema, type Summary, type Transaction } from "./schemas.js";

export type Reviewer = (transactions: Transaction[]) => Promise<Summary>;

function batchKey(transactions: Transaction[]): string {
  const stable = JSON.stringify(
    transactions.map((item) => ({
      amount: item.amount,
      customer_id: item.customer_id,
      merchant: item.merchant,
      timestamp: item.timestamp,
    })),
  );
  return createHash("sha256").update(stable).digest("hex");
}

export function createApp(reviewTransactions: Reviewer = review): FastifyInstance {
  const app = Fastify({ logger: false });
  const recent = new Map<string, Summary>();

  app.get("/health", async () => {
    const config = loadConfig();
    return { status: "ok", model_id: config.modelId, prompt_revision: config.promptRevision };
  });

  app.post("/v1/transactions", async (request, reply) => {
    const parsed = transactionBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({ detail: "Invalid transaction batch." });
    }
    const key = batchKey(parsed.data.transactions);
    const cached = recent.get(key);
    if (cached) {
      return { ...cached, duplicate: true };
    }
    try {
      const summary = await reviewTransactions(parsed.data.transactions);
      recent.set(key, summary);
      if (recent.size > 200) {
        const oldest = recent.keys().next().value;
        if (oldest) {
          recent.delete(oldest);
        }
      }
      return summary;
    } catch (error) {
      if (error instanceof ReviewError) {
        return reply.code(503).send({ detail: error.message });
      }
      return reply.code(500).send({ detail: "Review failed." });
    }
  });

  return app;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const port = Number(process.env.PORT ?? 8000);
  const app = createApp();
  await app.listen({ port, host: "0.0.0.0" });
}
