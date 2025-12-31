import { NVIDIA_API_KEY } from "@/lib/api-key";
// API Route: Data Flywheel Management
// Endpoints for viewing and exporting training data

import { NextResponse } from "next/server";
import { 
  getFlywheelLogger, 
  DatasetCreator,
  FlywheelEvaluator 
} from "@/lib/agents/flywheel";

export const runtime = "nodejs";

// GET - Get flywheel stats and records
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "stats";
  
  const logger = getFlywheelLogger();
  
  switch (action) {
    case "stats":
      return NextResponse.json(logger.getStats());
      
    case "records":
      const limit = parseInt(searchParams.get("limit") || "100");
      const records = logger.getRecords().slice(-limit);
      return NextResponse.json({ records, total: logger.getRecords().length });
      
    case "export":
      const includeTools = searchParams.get("tools") === "true";
      
      const creator = new DatasetCreator(logger);
      const datasets = creator.createDatasets("export");
      
      if (!datasets) {
        return NextResponse.json({ error: "Not enough records for export" }, { status: 400 });
      }
      
      const exportData = creator.exportToJSONL(datasets.train, includeTools);
      
      return new Response(exportData, {
        headers: {
          "Content-Type": "application/jsonl",
          "Content-Disposition": `attachment; filename="flywheel-export-${Date.now()}.jsonl"`,
        },
      });
      
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

// POST - Add feedback or trigger evaluation
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...params } = body;
    
    const logger = getFlywheelLogger();
    
    switch (action) {
      case "feedback":
        const { recordId, rating, feedback } = params;
        const success = logger.addUserFeedback(recordId, rating, feedback);
        return NextResponse.json({ success });
        
      case "evaluate":
        const apiKey = request.headers.get("X-NVIDIA-API-Key") || NVIDIA_API_KEY || "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";
        if (!apiKey) {
          return NextResponse.json({ error: "API key required" }, { status: 401 });
        }
        
        const evaluator = new FlywheelEvaluator({
          apiKey,
          model: "nvidia/nemotron-3-nano-30b-a3b",  // Nemotron 3 Nano for evaluation
          baseUrl: "https://integrate.api.nvidia.com/v1",
        });
        
        const records = logger.getRecords().slice(-10); // Evaluate last 10
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await evaluator.runEvaluation(records, "base-eval" as any);
        return NextResponse.json(result);
        
      case "create_datasets":
        const creator = new DatasetCreator(logger, params.config);
        const datasets = creator.createDatasets(params.workloadId || "default");
        
        if (!datasets) {
          return NextResponse.json({ error: "Not enough records" }, { status: 400 });
        }
        
        return NextResponse.json({
          train: creator.getDatasetStats(datasets.train),
          eval: creator.getDatasetStats(datasets.eval),
          test: creator.getDatasetStats(datasets.test),
        });
        
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Flywheel API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
