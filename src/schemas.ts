import { z } from "zod";

export const transactionSchema = z.object({
  amount: z.number().gt(0).lte(1_000_000_000),
  merchant: z.string().min(1).max(120),
  timestamp: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "timestamp must be a date"),
  customer_id: z.string().min(1).max(64),
});

export const transactionBatchSchema = z.object({
  transactions: z.array(transactionSchema).min(1).max(50),
});

export const findingSchema = transactionSchema.extend({
  reason: z.string().min(1).max(240),
});

export type Transaction = z.infer<typeof transactionSchema>;
export type Finding = z.infer<typeof findingSchema>;

export type WebhookResult = {
  called: boolean;
  status_code: number | null;
  detail: string;
};

export type Summary = {
  checked: number;
  flagged: number;
  findings: Finding[];
  webhook: WebhookResult;
  duplicate: boolean;
};
