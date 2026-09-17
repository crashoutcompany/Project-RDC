// Local Neon-compatible proxy for Cloud Agent development.
//
// The application uses @neondatabase/serverless + @prisma/adapter-neon, which
// never speak the raw Postgres wire protocol directly. Instead they talk to a
// Neon proxy over:
//   - HTTP  POST /sql  (single queries, used because db.ts sets poolQueryViaFetch = true)
//   - WSS   /v2        (a raw Postgres TCP tunnel, used for interactive transactions)
//
// This tiny proxy implements both against a plain local Postgres, so the app
// runs end-to-end with NO application code changes. The Neon driver derives its
// endpoints from the connection-string host, defaulting to https://<host>/sql
// and wss://<host>/v2 on port 443. We therefore serve TLS on :443 for the host
// db.localtest.me (which resolves to 127.0.0.1) and trust the generated CA via
// NODE_EXTRA_CA_CERTS.
//
// Env:
//   PROXY_PORT   (default 443)     port to listen on
//   PROXY_HOST   (default 0.0.0.0) bind address
//   PG_HOST      (default 127.0.0.1)
//   PG_PORT      (default 5432)
//   TLS_CERT / TLS_KEY            paths to the server certificate + key

import https from "node:https";
import net from "node:net";
import { readFileSync } from "node:fs";
import pg from "pg";
import { WebSocketServer } from "ws";

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 443);
const PROXY_HOST = process.env.PROXY_HOST ?? "0.0.0.0";
const PG_HOST = process.env.PG_HOST ?? "127.0.0.1";
const PG_PORT = Number(process.env.PG_PORT ?? 5432);
const TLS_CERT = process.env.TLS_CERT ?? new URL("./certs/server.crt", import.meta.url).pathname;
const TLS_KEY = process.env.TLS_KEY ?? new URL("./certs/server.key", import.meta.url).pathname;

// Return every value as raw text; the Neon driver / Prisma adapter parse types
// themselves (the driver sends the "Neon-Raw-Text-Output: true" header).
const identityParser = (val) => val;
const rawTypes = { getTypeParser: () => identityParser };

const { Pool } = pg;

function parseConnString(header) {
  // Header form: postgresql://user:pass@host/db
  try {
    if (!header) return {};
    const u = new URL(header);
    return {
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    };
  } catch {
    return {};
  }
}

// One pool per (user, database) reaching the local Postgres over TCP.
const pools = new Map();
function poolFor(conn) {
  const key = `${conn.user}:${conn.database}`;
  let pool = pools.get(key);
  if (!pool) {
    pool = new Pool({
      host: PG_HOST,
      port: PG_PORT,
      user: conn.user || "pocket",
      password: conn.password || "pocket",
      database: conn.database || "pocket",
      max: 10,
      ssl: false,
    });
    pools.set(key, pool);
  }
  return pool;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleSql(req, res) {
  try {
    const raw = await readBody(req);
    const conn = parseConnString(req.headers["neon-connection-string"]);
    const payload = raw ? JSON.parse(raw) : {};
    const pool = poolFor(conn);

    const runOne = async (q) => {
      const result = await pool.query({
        text: q.query,
        values: q.params ?? [],
        rowMode: "array",
        types: rawTypes,
      });
      return {
        command: result.command,
        rowCount: result.rowCount,
        rows: result.rows,
        fields: (result.fields ?? []).map((f) => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
          tableID: f.tableID,
          columnID: f.columnID,
          dataTypeSize: f.dataTypeSize,
          dataTypeModifier: f.dataTypeModifier,
          format: f.format,
        })),
        rowAsArray: true,
      };
    };

    if (Array.isArray(payload.queries)) {
      const results = [];
      for (const q of payload.queries) results.push(await runOne(q));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ results }));
      return;
    }

    const out = await runOne(payload);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
  } catch (err) {
    // Mirror Neon's 400 error shape so the driver surfaces the pg error fields.
    const body = {
      message: err.message,
      code: err.code,
      severity: err.severity,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      column: err.column,
      constraint: err.constraint,
      table: err.table,
      schema: err.schema,
      dataType: err.dataType,
    };
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}

const server = https.createServer(
  { cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) },
  (req, res) => {
    if (req.method === "POST" && req.url && req.url.startsWith("/sql")) {
      handleSql(req, res);
      return;
    }
    if (req.method === "GET" && req.url && req.url.startsWith("/health")) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  },
);

// WebSocket tunnel: /v2 carries the raw Postgres protocol to local Postgres.
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (!req.url || !req.url.startsWith("/v2")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const tcp = net.connect(PG_PORT, PG_HOST);
    let open = true;

    ws.on("message", (data) => {
      if (open) tcp.write(data);
    });
    tcp.on("data", (data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    const closeBoth = () => {
      open = false;
      try { tcp.destroy(); } catch {}
      try { ws.close(); } catch {}
    };
    ws.on("close", closeBoth);
    ws.on("error", closeBoth);
    tcp.on("close", closeBoth);
    tcp.on("error", closeBoth);
  });
});

server.listen(PROXY_PORT, PROXY_HOST, () => {
  console.log(
    `[neon-local-proxy] listening on https://${PROXY_HOST}:${PROXY_PORT} -> postgres ${PG_HOST}:${PG_PORT}`,
  );
});

server.on("error", (err) => {
  console.error("[neon-local-proxy] server error:", err);
  process.exit(1);
});
