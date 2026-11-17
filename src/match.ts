import type { Finding, Transaction } from "./schemas.js";

type Key = string;

function canonicalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("bad timestamp");
  }
  return date.toISOString();
}

function key(customerId: string, merchant: string, amount: number, timestamp: string): Key {
  return [customerId, merchant.trim().toLowerCase(), Math.round(amount * 100) / 100, canonicalTime(timestamp)].join("|");
}

export function keepKnownFindings(transactions: Transaction[], rawFindings: unknown[]): Finding[] {
  const known = new Map<Key, Transaction>();
  for (const item of transactions) {
    known.set(key(item.customer_id, item.merchant, item.amount, item.timestamp), item);
  }
  const kept: Finding[] = [];
  const seen = new Set<Key>();
  for (const raw of rawFindings) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const record = raw as Record<string, unknown>;
    const reason = String(record.reason ?? "").trim();
    if (!reason) {
      continue;
    }
    const amount = Number(record.amount);
    const customerId = String(record.customer_id ?? "");
    const merchant = String(record.merchant ?? "");
    const timestamp = String(record.timestamp ?? "");
    if (!customerId || !merchant || !timestamp || !Number.isFinite(amount)) {
      continue;
    }
    let itemKey: Key;
    try {
      itemKey = key(customerId, merchant, amount, timestamp);
    } catch {
      continue;
    }
    const source = known.get(itemKey);
    if (!source || seen.has(itemKey)) {
      continue;
    }
    seen.add(itemKey);
    kept.push({
      customer_id: source.customer_id,
      merchant: source.merchant,
      amount: source.amount,
      timestamp: source.timestamp,
      reason: reason.slice(0, 240),
    });
  }
  return kept;
}
