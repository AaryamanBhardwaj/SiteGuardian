import { handler } from "./index.mjs";

const url = process.argv[2] || "https://example.com";
console.log(`Scanning ${url}...\n`);

const result = await handler({ body: JSON.stringify({ url }) });
const body = JSON.parse(result.body);

if (body.screenshotBase64) {
  body.screenshotBase64 = `[${body.screenshotBase64.length} chars]`;
}

console.log(`Status: ${result.statusCode}`);
console.log(JSON.stringify(body, null, 2));
