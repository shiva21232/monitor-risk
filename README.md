# monitor-risk

A Node.js and TypeScript Strands agent on Amazon Bedrock. It reads a batch of transactions, flags suspicious ones, and posts a signed alert to a fixed webhook.

The model is Amazon Nova Micro in `us-east-1`. The webhook address comes from the environment. The model cannot choose it.

## Run

1. Copy `.env.example` to `.env`.
2. Put an access key in `.env`. The key needs `bedrock:InvokeModel` on `amazon.nova-micro-v1:0` in `us-east-1`.
3. Start the API and the local risk-team receiver:

```bash
docker compose up --build
```

The API is at `http://127.0.0.1:8010/v1/transactions`. Alerts the receiver accepted are at `http://127.0.0.1:8081/alerts`.

## Request

```bash
curl -sS -X POST http://127.0.0.1:8010/v1/transactions \
  -H 'content-type: application/json' \
  -d '{"transactions":[{"amount":20,"merchant":"Cafe","timestamp":"2026-11-17T12:00:00Z","customer_id":"c-1"},{"amount":9000,"merchant":"Electronics","timestamp":"2026-11-17T12:01:00Z","customer_id":"c-1"}]}'
```

The response counts the rows, lists the flagged ones, and says whether the webhook accepted the alert.
