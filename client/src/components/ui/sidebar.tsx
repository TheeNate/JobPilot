import { Cog, Database, FileText, Home, Plug, Settings, Table, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: "jobs", label: "Job Requests", icon: Briefcase },
  { id: "overview", label: "Overview", icon: Home },
  { id: "endpoints", label: "API Endpoints", icon: Plug },
  { id: "database", label: "Database", icon: Database },
  { id: "config", label: "Configuration", icon: Settings },
  { id: "logs", label: "Request Logs", icon: FileText },
  { id: "architecture", label: "Architecture", icon: Table },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <div className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground flex items-center">
          <Cog className="text-primary mr-3 h-6 w-6" />
          Scheduler Core
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Backend Service v1.0.0</p>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-md flex items-center transition-all duration-200",
                    "hover:bg-secondary",
                    activeTab === item.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground"
                  )}
                  onClick={() => onTabChange(item.id)}
                  data-testid={`nav-${item.id}`}
                >
                  <Icon className="mr-3 h-4 w-4" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Service Status</span>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            <span className="text-green-500">Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
