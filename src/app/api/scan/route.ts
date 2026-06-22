import { NextRequest, NextResponse } from "next/server";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({ region: "us-east-1" });
const SCAN_FUNCTION = process.env.SCAN_FUNCTION_NAME || "siteguardian-scan-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const payload = JSON.stringify({
      requestContext: { http: { method: "POST", path: "/scan" } },
      rawPath: "/scan",
      body: JSON.stringify({ url: body.url }),
      headers: { "content-type": "application/json" },
    });

    const result = await lambda.send(
      new InvokeCommand({
        FunctionName: SCAN_FUNCTION,
        InvocationType: "RequestResponse",
        Payload: new TextEncoder().encode(payload),
      }),
    );

    if (result.FunctionError) {
      const errPayload = JSON.parse(new TextDecoder().decode(result.Payload));
      return NextResponse.json(
        { error: errPayload.errorMessage || "Scan engine error" },
        { status: 502 },
      );
    }

    const response = JSON.parse(new TextDecoder().decode(result.Payload));
    const responseBody = typeof response.body === "string" ? JSON.parse(response.body) : response.body;

    return NextResponse.json(responseBody, { status: response.statusCode || 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
