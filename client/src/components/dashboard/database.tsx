import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database as DatabaseIcon } from "lucide-react";

export function Database() {
  const { data: health } = useQuery({
    queryKey: ["/api/health"],
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <DatabaseIcon className="mr-2 h-5 w-5 text-primary" />
            Database Connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Connection Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="text-foreground">Neon Database</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="text-foreground">PostgreSQL 14</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-green-500 flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    {health?.database === "connected" ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pool Size:</span>
                  <span className="text-foreground">10</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Performance</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Query Time:</span>
                  <span className="text-foreground">45ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Connections:</span>
                  <span className="text-foreground">3/10</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Queries:</span>
                  <span className="text-foreground">1,247</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Planned Schema */}
      <Card>
        <CardHeader>
          <CardTitle>Database Schema</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">Current database tables and their structure:</p>
          
          <div className="space-y-4">
            {/* Jobs Table */}
            <div className="border border-border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-2">jobs</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground">Column</th>
                      <th className="text-left py-2 text-muted-foreground">Type</th>
                      <th className="text-left py-2 text-muted-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr>
                      <td className="py-1 font-mono">id</td>
                      <td className="py-1">UUID</td>
                      <td className="py-1">Primary key</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-mono">client_email</td>
                      <td className="py-1">VARCHAR</td>
                      <td className="py-1">Client email address</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-mono">subject</td>
                      <td className="py-1">TEXT</td>
                      <td className="py-1">Email subject line</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-mono">body_plain</td>
                      <td className="py-1">TEXT</td>
                      <td className="py-1">Email body content</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-mono">location</td>
                      <td className="py-1">VARCHAR</td>
                      <td className="py-1">Job site location</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-mono">scheduled_date</td>
                      <td className="py-1">DATE</td>
                      <td className="py-1">Scheduled job date</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-mono">status</td>
                      <td className="py-1">VARCHAR</td>
                      <td className="py-1">Job status (pending, assigned, completed)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Request Logs Table */}
            <div className="border border-border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-2">request_logs</h4>
              <div className="text-sm text-muted-foreground">
                <p>Stores all HTTP requests for monitoring and debugging purposes.</p>
              </div>
            </div>
            
            {/* Employees Table */}
            <div className="border border-border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-2">employees</h4>
              <div className="text-sm text-muted-foreground">
                <p>Will store employee information, availability, and qualifications for job matching.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
