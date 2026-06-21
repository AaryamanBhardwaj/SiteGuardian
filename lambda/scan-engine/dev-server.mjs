import express from "express";
import cors from "cors";
import { handler } from "./index.mjs";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/scan", async (req, res) => {
  console.log(`[scan] ${req.body?.url}`);
  const result = await handler({ body: JSON.stringify(req.body) });
  res.status(result.statusCode).set(result.headers).send(result.body);
});

app.options("/scan", cors());

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Scan engine dev server on http://localhost:${port}`));
