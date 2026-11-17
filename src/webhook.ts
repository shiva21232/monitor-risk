import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

let lastAlert: unknown = null;
const secret = process.env.RISK_WEBHOOK_SECRET ?? "";

function signaturesMatch(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function startWebhook(port = 8080): void {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/alerts") {
      response.writeHead(404);
      response.end();
      return;
    }
    if (request.method === "GET") {
      const body = JSON.stringify(lastAlert);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(body);
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405);
      response.end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const signature = request.headers["x-risk-signature"];
      const actual = Array.isArray(signature) ? signature[0] : (signature ?? "");
      const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
      if (!signaturesMatch(actual, expected)) {
        response.writeHead(401);
        response.end();
        return;
      }
      lastAlert = JSON.parse(body.toString("utf8")) as unknown;
      response.writeHead(202);
      response.end();
    });
  });
  server.listen(port, "0.0.0.0");
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  startWebhook(Number(process.env.PORT ?? 8080));
}
