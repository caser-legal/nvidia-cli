"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type DashboardMetrics = {
  dailyVolume: Record<string, number>;
  rewardDistribution: { reward: string; count: number }[];
  errorRate: number;
};

const COLORS = ["#76b900", "#ff6b6b"]; // NVIDIA green, red

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch("/api/dashboard");
        if (resp.ok) setMetrics(await resp.json());
      } catch (e) {
        console.error("Failed to load metrics", e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <div className="p-8">Loading dashboard...</div>;
  if (!metrics) return <div className="p-8">Failed to load metrics</div>;

  const volumeData = Object.entries(metrics.dailyVolume).map(([date, count]) => ({ date, count }));

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold text-[#76b900]">📊 Flywheel Dashboard</h1>

      {/* Daily Volume */}
      <div className="bg-zinc-900 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Daily Trace Volume</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={volumeData}>
            <XAxis dataKey="date" stroke="#888" fontSize={12} />
            <YAxis stroke="#888" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }} />
            <Bar dataKey="count" fill="#76b900" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Reward Distribution */}
      <div className="bg-zinc-900 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Reward Distribution (SFT vs DPO)</h2>
        <div className="flex items-center gap-8">
          <ResponsiveContainer width={200} height={200}>
            <PieChart>
              <Pie data={metrics.rewardDistribution} dataKey="count" nameKey="reward" cx="50%" cy="50%" outerRadius={80} label>
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
                <span>{d.reward}: {d.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Error Rate */}
      <div className="bg-zinc-900 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Error Rate (5-min avg)</h2>
        <div className="flex items-center gap-4">
          <div className={`text-4xl font-bold ${metrics.errorRate > 0.05 ? "text-red-500" : "text-green-500"}`}>
            {(metrics.errorRate * 100).toFixed(1)}%
          </div>
          <div className="text-zinc-400">
            {metrics.errorRate > 0.05 ? "⚠️ Above threshold (5%)" : "✅ Within threshold"}
          </div>
        </div>
        <div className="mt-4 h-4 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${metrics.errorRate > 0.05 ? "bg-red-500" : "bg-green-500"}`}
            style={{ width: `${Math.min(metrics.errorRate * 100 * 10, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
