// Usage Dashboard Component
// Features 157-160: Usage tracking and analytics

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore, useUsageStore } from "@/lib/store";
import { BarChart3, TrendingUp, AlertTriangle, Zap } from "lucide-react";

const USAGE_LIMIT = 40; // 40 RPM free tier

export function UsageDashboard() {
  const { usageDashboardOpen, setUsageDashboardOpen } = useUIStore();
  const { records, getUsageByModel, getDailyUsage, getMonthlyUsage } = useUsageStore();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const today = mounted ? new Date().toISOString().split("T")[0] : "2024-01-01";
  const thisMonth = today.slice(0, 7);

  const usageByModel = getUsageByModel();
  const dailyUsage = getDailyUsage(today);
  const monthlyUsage = getMonthlyUsage(thisMonth);

  // Calculate daily request count
  const dailyRequests = dailyUsage.length;
  const usagePercent = Math.min((dailyRequests / USAGE_LIMIT) * 100, 100);
  const isNearLimit = usagePercent >= 80;

  return (
    <Dialog open={usageDashboardOpen} onOpenChange={setUsageDashboardOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage Dashboard
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="daily">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          {/* Daily Usage */}
          <TabsContent value="daily" className="space-y-4">
            {/* Usage Limit Warning */}
            {isNearLimit && (
              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  You're approaching your daily limit ({dailyRequests}/{USAGE_LIMIT} requests)
                </span>
              </div>
            )}

            {/* Usage Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Daily Requests</span>
                <span>{dailyRequests} / {USAGE_LIMIT}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isNearLimit ? "bg-yellow-500" : "bg-primary"
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <Zap className="h-5 w-5 mx-auto mb-2 text-primary" />
                <div className="text-2xl font-bold">{dailyUsage.reduce((a, r) => a + r.inputTokens, 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Input Tokens</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-2 text-primary" />
                <div className="text-2xl font-bold">{dailyUsage.reduce((a, r) => a + r.outputTokens, 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Output Tokens</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <BarChart3 className="h-5 w-5 mx-auto mb-2 text-primary" />
                <div className="text-2xl font-bold">{dailyUsage.reduce((a, r) => a + r.totalTokens, 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total Tokens</div>
              </div>
            </div>

            {/* Usage by Model */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Usage by Model</h3>
              <ScrollArea className="h-[150px]">
                <div className="space-y-2">
                  {Object.entries(usageByModel).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No usage data yet</p>
                  ) : (
                    Object.entries(usageByModel).map(([model, usage]) => (
                      <div key={model} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm truncate max-w-[200px]">{model.split("/").pop()}</span>
                        <span className="text-sm text-muted-foreground">{usage.totalTokens.toLocaleString()} tokens</span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Monthly Usage */}
          <TabsContent value="monthly" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{monthlyUsage.length}</div>
                <div className="text-xs text-muted-foreground">Total Requests</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{monthlyUsage.reduce((a, r) => a + r.inputTokens, 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Input Tokens</div>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <div className="text-2xl font-bold">{monthlyUsage.reduce((a, r) => a + r.outputTokens, 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Output Tokens</div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Recent Activity</h3>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {records.slice(-10).reverse().map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                      <div>
                        <span className="font-medium">{record.model.split("/").pop()}</span>
                        <span className="text-muted-foreground ml-2">{record.date}</span>
                      </div>
                      <span className="text-muted-foreground">{record.totalTokens} tokens</span>
                    </div>
                  ))}
                  {records.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
