import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Endpoints() {
  return (
    <div className="space-y-6">
      {/* POST /job-intake Endpoint */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Badge className="bg-green-500 text-white mr-3">POST</Badge>
              <CardTitle>/api/job-intake</CardTitle>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <span className="text-green-500 text-sm">Active</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Accepts JSON payload from upstream webhook service containing email data for job scheduling.
          </p>
          
          {/* Request Example */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-foreground mb-2">Request Body</h4>
            <div className="bg-muted rounded-md p-4 overflow-x-auto">
              <pre className="text-sm text-muted-foreground font-mono">
{`{
  "subject": "Job request: NDT needed at Chevron site",
  "from": "dispatch@example.com",
  "to": "schedule@mycompany.com",
  "body-plain": "Hi, we need 2 techs at Chevron Refinery on Sept 23, 7:00am, for a rope access UT inspection. Let us know who's available."
}`}
              </pre>
            </div>
          </div>
          
          {/* Response Example */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-foreground mb-2">Response (200 OK)</h4>
            <div className="bg-muted rounded-md p-4 overflow-x-auto">
              <pre className="text-sm text-muted-foreground font-mono">
{`{
  "status": "success",
  "message": "Job intake request logged successfully",
  "requestId": "req_1234567890",
  "timestamp": "2024-01-15T10:30:00Z"
}`}
              </pre>
            </div>
          </div>
          
          {/* Implementation Status */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">Status:</span>
              <span className="text-green-500 text-sm font-medium">✓ Logging Implementation</span>
              <span className="text-orange-500 text-sm font-medium">○ Parsing Logic</span>
              <span className="text-muted-foreground text-sm font-medium">○ DB Insert</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Check Endpoint */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Badge className="bg-blue-500 text-white mr-3">GET</Badge>
              <CardTitle>/api/health</CardTitle>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <span className="text-green-500 text-sm">Active</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Service health check endpoint for monitoring and load balancer integration.
          </p>
          
          <div className="mb-4">
            <h4 className="text-sm font-medium text-foreground mb-2">Response (200 OK)</h4>
            <div className="bg-muted rounded-md p-4 overflow-x-auto">
              <pre className="text-sm text-muted-foreground font-mono">
{`{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "database": "connected",
  "uptime": "2h 15m 32s"
}`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
