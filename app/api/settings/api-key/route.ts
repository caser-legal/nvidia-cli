// API Route: Read/Write API Key and LLM Backend settings to .env.local

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const ENV_PATH = path.join(process.cwd(), ".env.local");

export async function GET() {
  try {
    if (!fs.existsSync(ENV_PATH)) {
      return NextResponse.json({ apiKey: "", useLocalLLM: false, ollamaUrl: "", embedUrl: "" });
    }
    
    const content = fs.readFileSync(ENV_PATH, "utf-8");
    const apiKeyMatch = content.match(/NVIDIA_API_KEY=(.+)/);
    const useLocalMatch = content.match(/USE_LOCAL_LLM=(.+)/);
    const ollamaUrlMatch = content.match(/OLLAMA_BASE_URL=(.+)/);
    const embedUrlMatch = content.match(/LOCAL_EMBED_URL=(.+)/);
    const googleKeyMatch = content.match(/GOOGLE_API_KEY=(.+)/);
    const googleCseMatch = content.match(/GOOGLE_CSE_ID=(.+)/);
    
    return NextResponse.json({ 
      apiKey: apiKeyMatch ? apiKeyMatch[1].trim() : "",
      hasKey: !!apiKeyMatch,
      useLocalLLM: useLocalMatch ? useLocalMatch[1].trim() === "true" : false,
      ollamaUrl: ollamaUrlMatch ? ollamaUrlMatch[1].trim() : "http://192.168.50.50:11434/v1",
      embedUrl: embedUrlMatch ? embedUrlMatch[1].trim() : "http://192.168.50.50:8000",
      googleKey: googleKeyMatch ? googleKeyMatch[1].trim() : "",
      googleCseId: googleCseMatch ? googleCseMatch[1].trim() : "",
    });
  } catch {
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, useLocalLLM, ollamaUrl, embedUrl, googleKey, googleCseId } = body;
    
    let content = "";
    if (fs.existsSync(ENV_PATH)) {
      content = fs.readFileSync(ENV_PATH, "utf-8");
    }
    
    // Update API key if provided
    if (apiKey !== undefined) {
      if (apiKey && !apiKey.startsWith("nvapi-")) {
        return NextResponse.json({ error: "Invalid API key format" }, { status: 400 });
      }
      if (content.includes("NVIDIA_API_KEY=")) {
        content = content.replace(/NVIDIA_API_KEY=.+/, `NVIDIA_API_KEY=${apiKey}`);
      } else if (apiKey) {
        content = content.trim() + `\nNVIDIA_API_KEY=${apiKey}`;
      }
    }
    
    // Update USE_LOCAL_LLM if provided
    if (useLocalLLM !== undefined) {
      const value = useLocalLLM ? "true" : "false";
      if (content.includes("USE_LOCAL_LLM=")) {
        content = content.replace(/USE_LOCAL_LLM=.+/, `USE_LOCAL_LLM=${value}`);
      } else {
        content = content.trim() + `\nUSE_LOCAL_LLM=${value}`;
      }
    }
    
    // Update OLLAMA_BASE_URL if provided
    if (ollamaUrl !== undefined) {
      if (content.includes("OLLAMA_BASE_URL=")) {
        content = content.replace(/OLLAMA_BASE_URL=.+/, `OLLAMA_BASE_URL=${ollamaUrl}`);
      } else {
        content = content.trim() + `\nOLLAMA_BASE_URL=${ollamaUrl}`;
      }
    }

    // Update LOCAL_EMBED_URL if provided
    if (embedUrl !== undefined) {
      if (content.includes("LOCAL_EMBED_URL=")) {
        content = content.replace(/LOCAL_EMBED_URL=.+/, `LOCAL_EMBED_URL=${embedUrl}`);
      } else {
        content = content.trim() + `\nLOCAL_EMBED_URL=${embedUrl}`;
      }
    }

    // Update GOOGLE_API_KEY if provided
    if (googleKey !== undefined) {
      if (content.includes("GOOGLE_API_KEY=")) {
        content = content.replace(/GOOGLE_API_KEY=.+/, `GOOGLE_API_KEY=${googleKey}`);
      } else if (googleKey) {
        content = content.trim() + `\nGOOGLE_API_KEY=${googleKey}`;
      }
    }

    // Update GOOGLE_CSE_ID if provided
    if (googleCseId !== undefined) {
      if (content.includes("GOOGLE_CSE_ID=")) {
        content = content.replace(/GOOGLE_CSE_ID=.+/, `GOOGLE_CSE_ID=${googleCseId}`);
      } else if (googleCseId) {
        content = content.trim() + `\nGOOGLE_CSE_ID=${googleCseId}`;
      }
    }
    
    fs.writeFileSync(ENV_PATH, content.trim() + "\n");
    
    return NextResponse.json({ success: true, message: "Settings saved. Restart server to apply." });
  } catch {
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
