import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export function Configuration() {
  // Environment variables status (would be retrieved from backend in real implementation)
  const envVars = [
    {
      name: "DATABASE_URL",
      description: "PostgreSQL connection string",
      status: "configured",
      value: "postgresql://***",
    },
    {
      name: "MAILGUN_API_KEY",
      description: "Mailgun API key for sending reply emails",
      status: "pending",
      value: undefined,
    },
    {
      name: "MAILGUN_DOMAIN",
      description: "Mailgun domain for sending emails",
      status: "pending",
      value: undefined,
    },
    {
      name: "PORT",
      description: "Server port (default: 5000)",
      status: "configured",
      value: "5000",
    },
    {
      name: "NODE_ENV",
      description: "Runtime environment",
      status: "configured",
      value: process.env.NODE_ENV || "development",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Environment Variables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="mr-2 h-5 w-5 text-primary" />
            Environment Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {envVars.map((envVar) => (
              <div key={envVar.name} className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
                <div>
                  <h4 className="font-medium text-foreground">{envVar.name}</h4>
                  <p className="text-sm text-muted-foreground">{envVar.description}</p>
                </div>
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    envVar.status === "configured" ? "bg-green-500" : "bg-orange-500"
                  }`}></div>
                  <span className={`text-sm ${
                    envVar.status === "configured" ? "text-green-500" : "text-orange-500"
                  }`}>
                    {envVar.status === "configured" ? (envVar.value || "Configured") : "Pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Service Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Service Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Request Settings</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Request Size:</span>
                  <span className="text-foreground">10MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Request Timeout:</span>
                  <span className="text-foreground">30s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CORS Enabled:</span>
                  <span className="text-green-500">Yes</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Logging Settings</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Log Level:</span>
                  <span className="text-foreground">INFO</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Request Logging:</span>
                  <span className="text-green-500">Enabled</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Error Reporting:</span>
                  <span className="text-green-500">Enabled</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
