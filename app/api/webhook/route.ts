// Error Rate Webhook - Receives alerts from ES Watcher

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { error_rate } = body as { error_rate?: number };

    if (error_rate === undefined) {
      return NextResponse.json({ error: "Missing error_rate" }, { status: 400 });
    }

    console.warn(`[webhook] ⚠️ Error rate alert: ${(error_rate * 100).toFixed(1)}% > 5%`);

    // Optional: Send to Slack
    const slackUrl = null;
    if (slackUrl) {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `⚠️ Error-rate alert: ${(error_rate * 100).toFixed(1)}%` }),
      });
    }

    return NextResponse.json({ received: true, error_rate });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
