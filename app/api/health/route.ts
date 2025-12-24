/**
 * Health Check API Endpoint
 * Returns system status for monitoring and load balancers
 */

import { NextResponse } from "next/server";
import { isMCPConnected } from "@/lib/mcp-client";

export const runtime = "nodejs";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    name: string;
    status: "pass" | "fail";
    message?: string;
  }[];
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const checks: HealthStatus["checks"] = [];
  
  // Check 1: Environment variables
  const hasApiKey = !!process.env.NVIDIA_API_KEY;
  checks.push({
    name: "nvidia_api_key",
    status: hasApiKey ? "pass" : "fail",
    message: hasApiKey ? undefined : "NVIDIA_API_KEY not set",
  });
  
  // Check 2: MCP connection (if applicable)
  const mcpConnected = isMCPConnected();
  checks.push({
    name: "mcp_connection",
    status: mcpConnected ? "pass" : "fail",
    message: mcpConnected ? undefined : "MCP not connected (connects on first request)",
  });
  
  // Check 3: Memory usage
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const memoryOk = heapUsedMB < heapTotalMB * 0.9; // Under 90% heap usage
  checks.push({
    name: "memory",
    status: memoryOk ? "pass" : "fail",
    message: `${heapUsedMB}MB / ${heapTotalMB}MB heap`,
  });
  
  // Determine overall status
  const failedChecks = checks.filter(c => c.status === "fail");
  let status: HealthStatus["status"] = "healthy";
  
  if (failedChecks.some(c => c.name === "nvidia_api_key")) {
    status = "unhealthy";
  } else if (failedChecks.length > 0) {
    status = "degraded";
  }
  
  const response: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    checks,
  };
  
  const httpStatus = status === "unhealthy" ? 503 : 200;
  
  return NextResponse.json(response, { status: httpStatus });
}
