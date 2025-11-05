import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, ArrowDown, Mail, Cloud, Cog, Database, Check, Circle } from "lucide-react";

export function Architecture() {
  return (
    <div className="space-y-6">
      {/* System Architecture */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Table className="mr-2 h-5 w-5 text-primary" />
            System Architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Architecture Diagram */}
          <div className="bg-muted rounded-lg p-6 mb-6">
            <div className="flex flex-col items-center space-y-8">
              {/* Email Provider */}
              <div className="text-center">
                <div className="w-24 h-16 bg-blue-500 rounded-lg flex items-center justify-center mb-2">
                  <Mail className="text-white h-8 w-8" />
                </div>
                <p className="text-sm text-foreground font-medium">Email Provider</p>
                <p className="text-xs text-muted-foreground">Mailgun Webhooks</p>
              </div>
              
              {/* Arrow Down */}
              <ArrowDown className="text-muted-foreground h-6 w-6" />
              
              {/* Webhook API */}
              <div className="text-center">
                <div className="w-24 h-16 bg-orange-500 rounded-lg flex items-center justify-center mb-2">
                  <Cloud className="text-white h-8 w-8" />
                </div>
                <p className="text-sm text-foreground font-medium">Webhook API</p>
                <p className="text-xs text-muted-foreground">Email Processing</p>
              </div>
              
              {/* Arrow Down */}
              <ArrowDown className="text-muted-foreground h-6 w-6" />
              
              {/* Scheduler Core */}
              <div className="text-center">
                <div className="w-24 h-16 bg-primary rounded-lg flex items-center justify-center mb-2">
                  <Cog className="text-white h-8 w-8" />
                </div>
                <p className="text-sm text-foreground font-medium">Scheduler Core</p>
                <p className="text-xs text-muted-foreground">This Service</p>
              </div>
              
              {/* Arrow Down */}
              <ArrowDown className="text-muted-foreground h-6 w-6" />
              
              {/* Database */}
              <div className="text-center">
                <div className="w-24 h-16 bg-green-500 rounded-lg flex items-center justify-center mb-2">
                  <Database className="text-white h-8 w-8" />
                </div>
                <p className="text-sm text-foreground font-medium">PostgreSQL</p>
                <p className="text-xs text-muted-foreground">Neon Database</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project Structure */}
      <Card>
        <CardHeader>
          <CardTitle>Project Structure</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-muted-foreground font-mono">
{`/scheduler-core
├── server/
│   ├── index.ts              `}<span className="text-green-500"># App entrypoint</span>{`
│   ├── routes.ts             `}<span className="text-green-500"># API routes</span>{`
│   ├── storage.ts            `}<span className="text-green-500"># Database operations</span>{`
│   ├── db.ts                 `}<span className="text-green-500"># DB connection</span>{`
│   └── services/
│       ├── parser.ts         `}<span className="text-orange-500"># Email parsing logic</span>{`
│       └── logger.ts         `}<span className="text-green-500"># Logging service</span>{`
├── shared/
│   └── schema.ts             `}<span className="text-green-500"># Database schema</span>{`
├── client/
│   └── src/                  `}<span className="text-blue-500"># Frontend dashboard</span>{`
├── .env                      `}<span className="text-muted-foreground"># Environment variables</span>{`
├── package.json              `}<span className="text-muted-foreground"># Dependencies</span>{`
└── README.md                 `}<span className="text-muted-foreground"># Documentation</span>
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Implementation Roadmap */}
      <Card>
        <CardHeader>
          <CardTitle>Implementation Roadmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Phase 1 */}
            <div className="border border-green-500 rounded-lg p-4 bg-green-500/10">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">Phase 1: Basic Setup</h4>
                <Badge className="bg-green-500 text-white">COMPLETE</Badge>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center">
                  <Check className="text-green-500 w-4 h-4 mr-2" />
                  POST /job-intake endpoint
                </li>
                <li className="flex items-center">
                  <Check className="text-green-500 w-4 h-4 mr-2" />
                  Request logging
                </li>
                <li className="flex items-center">
                  <Check className="text-green-500 w-4 h-4 mr-2" />
                  PostgreSQL connection
                </li>
                <li className="flex items-center">
                  <Check className="text-green-500 w-4 h-4 mr-2" />
                  Project structure
                </li>
              </ul>
            </div>
            
            {/* Phase 2 */}
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">Phase 2: Email Parsing</h4>
                <Badge variant="secondary">PLANNED</Badge>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Parse job details from email body
                </li>
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Extract date, time, location
                </li>
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Identify job type and requirements
                </li>
              </ul>
            </div>
            
            {/* Phase 3 */}
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">Phase 3: Database Integration</h4>
                <Badge variant="secondary">PLANNED</Badge>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Enhanced database schema
                </li>
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Store parsed job data
                </li>
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Employee matching logic
                </li>
              </ul>
            </div>
            
            {/* Phase 4 */}
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-foreground">Phase 4: Email Responses</h4>
                <Badge variant="secondary">PLANNED</Badge>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Mailgun API integration
                </li>
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Automated reply emails
                </li>
                <li className="flex items-center">
                  <Circle className="text-muted-foreground w-4 h-4 mr-2" />
                  Assignment confirmation
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
