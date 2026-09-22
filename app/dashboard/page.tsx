"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

type DashboardMetrics = {
  totalDocs: number;
  dailyVolume: Record<string, number>;
  rewardDistribution: { reward: string; count: number }[];
  errorRate: number;
  recentErrorCount: number;
  recentDocsCount: number;
  avgLatencyMs: number;
  avgScore: number;
  modelDistribution: Record<string, number>;
  workloadDistribution: Record<string, number>;
  trainingStats: {
    sft: { count: number; totalSize: number };
    dpo: { count: number; totalSize: number };
  };
  dlqStats: { count: number; oldestFailure?: string };
  qualityThreshold: number;
  errorThreshold: number;
};

const COLORS = ["#76b900", "#ff6b6b", "#888888"]; // NVIDIA green, red, gray

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch("/api/dashboard");
        if (resp.ok) {
          setMetrics(await resp.json());
          setError(null);
        } else {
          const data = await resp.json();
          setError(data.error || "Failed to load metrics");
        }
      } catch (e) {
        setError("Failed to connect to dashboard API");
        console.error("Failed to load metrics", e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-xl text-zinc-400">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <h2 className="text-red-500 font-semibold">Error</h2>
          <p className="text-zinc-300">{error}</p>
          <p className="text-zinc-500 text-sm mt-2">
            Make sure Elasticsearch is running: <code>nv</code> or check <code>http://localhost:9200</code>
          </p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return <div className="p-8">No metrics available</div>;
  }

  const volumeData = Object.entries(metrics.dailyVolume)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14); // Last 14 days

  const modelData = Object.entries(metrics.modelDistribution).map(([model, count]) => ({
    name: model.split("/").pop() || model,
    value: count,
  }));

  const workloadData = Object.entries(metrics.workloadDistribution).map(([type, count]) => ({
    name: type,
    value: count,
  }));

  return (
    <div className="p-8 space-y-8 bg-zinc-950 min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#76b900]">📊 Flywheel Dashboard</h1>
        <div className="text-zinc-500 text-sm">
          Auto-refreshes every 30s • Total records: {metrics.totalDocs.toLocaleString()}
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Total Records"
          value={metrics.totalDocs.toLocaleString()}
          subtitle="In Elasticsearch"
          color="green"
        />
        <MetricCard
          title="Avg Quality Score"
          value={metrics.avgScore.toFixed(1)}
          subtitle={`Threshold: ${metrics.qualityThreshold}`}
          color={metrics.avgScore >= metrics.qualityThreshold ? "green" : "yellow"}
        />
        <MetricCard
          title="Avg Latency"
          value={`${(metrics.avgLatencyMs / 1000).toFixed(1)}s`}
          subtitle="Per interaction"
          color={metrics.avgLatencyMs < 10000 ? "green" : "yellow"}
        />
        <MetricCard
          title="Error Rate"
          value={`${(metrics.errorRate * 100).toFixed(1)}%`}
          subtitle={`${metrics.recentErrorCount}/${metrics.recentDocsCount} recent`}
          color={metrics.errorRate <= metrics.errorThreshold ? "green" : "red"}
        />
      </div>

      {/* Training Data Stats */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          title="SFT Traces"
          value={metrics.trainingStats.sft.count.toString()}
          subtitle={`${(metrics.trainingStats.sft.totalSize / 1024).toFixed(1)} KB`}
          color="green"
        />
        <MetricCard
          title="DPO Traces"
          value={metrics.trainingStats.dpo.count.toString()}
          subtitle={`${(metrics.trainingStats.dpo.totalSize / 1024).toFixed(1)} KB`}
          color="yellow"
        />
        <MetricCard
          title="DLQ (Failed)"
          value={metrics.dlqStats.count.toString()}
          subtitle={metrics.dlqStats.oldestFailure ? `Since ${metrics.dlqStats.oldestFailure.split("T")[0]}` : "Empty"}
          color={metrics.dlqStats.count === 0 ? "green" : "red"}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-6">
        {/* Daily Volume */}
        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Daily Trace Volume</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={volumeData}>
              <XAxis dataKey="date" stroke="#888" fontSize={12} tickFormatter={(d) => d.slice(5)} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
                labelStyle={{ color: "#fff" }}
              />
              <Bar dataKey="count" fill="#76b900" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Reward Distribution */}
        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Quality Distribution</h2>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={metrics.rewardDistribution}
                  dataKey="count"
                  nameKey="reward"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {metrics.rewardDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {metrics.rewardDistribution.map((d, i) => (
                <div key={d.reward} className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-sm">
                    {d.reward}: {d.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-2 gap-6">
        {/* Model Distribution */}
        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Model Distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={modelData} layout="vertical">
              <XAxis type="number" stroke="#888" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="#888" fontSize={12} width={120} />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }} />
              <Bar dataKey="value" fill="#0984e3" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Workload Distribution */}
        <div className="bg-zinc-900 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Workload Types</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={workloadData} layout="vertical">
              <XAxis type="number" stroke="#888" fontSize={12} />
              <YAxis type="category" dataKey="name" stroke="#888" fontSize={12} width={100} />
              <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }} />
              <Bar dataKey="value" fill="#e17055" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Error Rate Gauge */}
      <div className="bg-zinc-900 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Error Rate (5-min window)</h2>
        <div className="flex items-center gap-4">
          <div
            className={`text-4xl font-bold ${
              metrics.errorRate > metrics.errorThreshold ? "text-red-500" : "text-green-500"
            }`}
          >
            {(metrics.errorRate * 100).toFixed(1)}%
          </div>
          <div className="text-zinc-400">
            {metrics.errorRate > metrics.errorThreshold
              ? `⚠️ Above threshold (${metrics.errorThreshold * 100}%)`
              : `✅ Within threshold (${metrics.errorThreshold * 100}%)`}
          </div>
        </div>
        <div className="mt-4 h-4 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              metrics.errorRate > metrics.errorThreshold ? "bg-red-500" : "bg-green-500"
            }`}
            style={{ width: `${Math.min(metrics.errorRate * 100 * 10, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "green" | "yellow" | "red";
}) {
  const colorClasses = {
    green: "text-green-500",
    yellow: "text-yellow-500",
    red: "text-red-500",
  };

  return (
    <div className="bg-zinc-900 rounded-lg p-4">
      <div className="text-zinc-400 text-sm">{title}</div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</div>
      <div className="text-zinc-500 text-xs">{subtitle}</div>
    </div>
  );
}
