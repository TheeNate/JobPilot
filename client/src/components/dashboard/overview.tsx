import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Briefcase, Clock, Database, Server } from "lucide-react";

interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
  uptime: number;
}

interface StatsResponse {
  jobsToday: number;
  jobsGrowth: number;
  averageResponseTime: number;
}

interface LogEntry {
  id: string;
  method: string;
  endpoint: string;
  statusCode: number;
  responseTime: number;
  requestBody: string;
  timestamp: string;
}

export function Overview() {
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["/api/stats"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["/api/health"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const { data: logs } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs"],
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  const recentActivity = Array.isArray(logs) ? logs.slice(0, 5) : [];

  return (
    <div>
      {/* Service Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">API Status</h3>
              <Server className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-500">
              {health?.status === "healthy" ? "Online" : "Offline"}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Uptime: {health?.uptime ? Math.floor(health.uptime / 3600) : 0}h
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Database</h3>
              <Database className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-500">
              {health?.database === "connected" ? "Connected" : "Disconnected"}
            </div>
            <p className="text-sm text-muted-foreground mt-1">PostgreSQL 14</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Jobs Today</h3>
              <Briefcase className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {stats?.jobsToday || 0}
            </div>
            <p className="text-sm text-green-500 mt-1">
              {stats?.jobsGrowth ? `+${stats.jobsGrowth}%` : "+0%"} from yesterday
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Response Time</h3>
              <Clock className="h-4 w-4 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {stats?.averageResponseTime || 0}ms
            </div>
            <p className="text-sm text-muted-foreground mt-1">Average</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="mr-2 h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((log: LogEntry, index: number) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-border last:border-b-0"
                >
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-foreground">
                      {log.method} {log.endpoint} - {log.statusCode} - {log.responseTime}ms
                    </span>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No recent activity to display
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
