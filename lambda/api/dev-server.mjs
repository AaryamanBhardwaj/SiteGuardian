import { createServer } from "node:http";
import { handler } from "./index.mjs";

process.env.SCAN_ENGINE_URL = process.env.SCAN_ENGINE_URL || "http://localhost:4000/scan";

const PORT = process.env.PORT || 4001;

const server = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;

  const event = {
    requestContext: { http: { method: req.method } },
    rawPath: req.url.split("?")[0],
    headers: req.headers,
    body: body || null,
  };

  try {
    const result = await handler(event);
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () =>
  console.log(`API dev server on http://localhost:${PORT}`),
);
