import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, RefreshCw, Download } from "lucide-react";

export function Logs() {
  const [levelFilter, setLevelFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("1h");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: logs, refetch } = useQuery({
    queryKey: ["/api/logs"],
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  const filteredLogs = logs?.filter((log: any) => {
    const matchesLevel = levelFilter === "all" || log.level?.toLowerCase() === levelFilter.toLowerCase();
    const matchesSearch = searchTerm === "" || 
      log.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.endpoint?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesLevel && matchesSearch;
  }) || [];

  const getBadgeColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case "error":
        return "bg-red-500";
      case "warn":
        return "bg-orange-500";
      case "info":
        return "bg-blue-500";
      case "debug":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5 text-primary" />
            Request Logs
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              data-testid="button-refresh-logs"
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              data-testid="button-export-logs"
            >
              <Download className="mr-1 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Log Filters */}
        <div className="flex items-center space-x-4 mb-6 pb-4 border-b border-border">
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-32" data-testid="select-log-level">
              <SelectValue placeholder="All Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="info">INFO</SelectItem>
              <SelectItem value="warn">WARN</SelectItem>
              <SelectItem value="error">ERROR</SelectItem>
              <SelectItem value="debug">DEBUG</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-40" data-testid="select-time-filter">
              <SelectValue placeholder="Last Hour" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          
          <Input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 max-w-xs"
            data-testid="input-search-logs"
          />
        </div>
        
        {/* Log Entries */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log: any, index: number) => (
              <div 
                key={index}
                className="flex items-start space-x-4 py-2 border-b border-border/50 last:border-b-0"
                data-testid={`log-entry-${index}`}
              >
                <div className="flex-shrink-0">
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                <div className="flex-shrink-0">
                  <Badge className={`${getBadgeColor(log.level)} text-white text-xs`}>
                    {log.level || 'INFO'}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-mono">
                    {log.method && log.endpoint ? 
                      `${log.method} ${log.endpoint} - ${log.statusCode} - ${log.responseTime}ms` :
                      log.message
                    }
                  </p>
                  {log.metadata && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)}
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No logs found matching your filters
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
