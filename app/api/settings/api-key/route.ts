// API Route: Read/Write API Key to .env.local

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const ENV_PATH = path.join(process.cwd(), ".env.local");

export async function GET() {
  try {
    if (!fs.existsSync(ENV_PATH)) {
      return NextResponse.json({ apiKey: "" });
    }
    
    const content = fs.readFileSync(ENV_PATH, "utf-8");
    const match = content.match(/NVIDIA_API_KEY=(.+)/);
    const apiKey = match ? match[1].trim() : "";
    
    return NextResponse.json({ apiKey, hasKey: !!apiKey });
  } catch (error) {
    return NextResponse.json({ error: "Failed to read API key" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json();
    
    if (!apiKey || !apiKey.startsWith("nvapi-")) {
      return NextResponse.json({ error: "Invalid API key format" }, { status: 400 });
    }
    
    let content = "";
    if (fs.existsSync(ENV_PATH)) {
      content = fs.readFileSync(ENV_PATH, "utf-8");
    }
    
    // Update or add NVIDIA_API_KEY
    if (content.includes("NVIDIA_API_KEY=")) {
      content = content.replace(/NVIDIA_API_KEY=.+/, `NVIDIA_API_KEY=${apiKey}`);
    } else {
      content = content.trim() + `\nNVIDIA_API_KEY=${apiKey}\n`;
    }
    
    fs.writeFileSync(ENV_PATH, content);
    
    return NextResponse.json({ success: true, message: "API key saved. Restart server to apply." });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save API key" }, { status: 500 });
  }
}
