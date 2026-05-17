import http from "node:http";
import { logger } from "./config/logger";
import { env } from "./config/env";
import { createOutboundWorker } from "./workers/outboundWorker";
import { createInboundWorker } from "./workers/inboundWorker";
import './handlers/testSend';
import './handlers/sendRfpInvitation';
import './handlers/sendOtp';
import './handlers/sendResponseConfirmed';

const outboundWorker = createOutboundWorker();
const inboundWorker = createInboundWorker();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(env.WORKER_PORT, () => {
  logger.info({ port: env.WORKER_PORT }, "email-worker started");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await outboundWorker.close();
  await inboundWorker.close();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
