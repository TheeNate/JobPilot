import { useState } from "react";
import { Sidebar } from "@/components/ui/sidebar";
import { Overview } from "@/components/dashboard/overview";
import { Jobs } from "@/components/dashboard/jobs";
import { Endpoints } from "@/components/dashboard/endpoints";
import { Database } from "@/components/dashboard/database";
import { Configuration } from "@/components/dashboard/configuration";
import { Logs } from "@/components/dashboard/logs";
import { Architecture } from "@/components/dashboard/architecture";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

type TabType = "jobs" | "overview" | "endpoints" | "database" | "config" | "logs" | "architecture";

const tabData = {
  jobs: {
    title: "Job Requests",
    subtitle: "Parsed job intake requests from emails",
  },
  overview: {
    title: "Service Overview",
    subtitle: "Email-based job scheduler backend service",
  },
  endpoints: {
    title: "API Endpoints",
    subtitle: "Available REST API endpoints and documentation",
  },
  database: {
    title: "Database Management",
    subtitle: "PostgreSQL connection and schema information",
  },
  config: {
    title: "Configuration",
    subtitle: "Environment variables and service settings",
  },
  logs: {
    title: "Request Logs",
    subtitle: "Real-time application logs and monitoring",
  },
  architecture: {
    title: "System Architecture",
    subtitle: "Project structure and implementation roadmap",
  },
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("jobs");

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TabType);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "jobs":
        return <Jobs />;
      case "overview":
        return <Overview />;
      case "endpoints":
        return <Endpoints />;
      case "database":
        return <Database />;
      case "config":
        return <Configuration />;
      case "logs":
        return <Logs />;
      case "architecture":
        return <Architecture />;
      default:
        return <Jobs />;
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">
                {tabData[activeTab].title}
              </h2>
              <p className="text-muted-foreground">
                {tabData[activeTab].subtitle}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Last Deploy</p>
                <p className="text-sm font-medium">Just now</p>
              </div>
              <Button 
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                data-testid="button-restart-service"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restart Service
              </Button>
            </div>
          </div>
        </header>

        {/* Tab Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderTabContent()}
        </main>
      </div>
    </div>
  );
}
