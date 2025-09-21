import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Plus, Server, Plug, Trash2, Edit, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Service {
  id: string;
  serviceName: string;
  serviceUrl: string;
  serviceType: string;
  status: 'active' | 'inactive';
  lastTested: string | null;
  connectionStatus: 'connected' | 'disconnected' | 'unknown';
  createdAt: string;
  updatedAt: string;
}

// Form validation schema
const serviceSchema = z.object({
  serviceName: z.string().min(1, "Service name is required"),
  serviceUrl: z.string().url("Must be a valid URL").refine((url) => {
    try {
      const parsed = new URL(url);
      // Only allow HTTP and HTTPS protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      
      // Only allow standard ports for security
      const port = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
      if (![80, 443].includes(port)) {
        return false;
      }
      
      // Block private IP ranges and localhost
      const hostname = parsed.hostname.toLowerCase();
      
      // Block localhost and loopback variations (IPv4)
      if (['localhost', '0.0.0.0'].includes(hostname)) {
        return false;
      }
      
      // Block all IPv4 private, loopback, link-local, and special-use ranges
      const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const ipv4Match = hostname.match(ipv4Regex);
      if (ipv4Match) {
        const [, a, b, c, d] = ipv4Match.map(Number);
        
        // Validate IP format (0-255 for each octet)
        if (a > 255 || b > 255 || c > 255 || d > 255) {
          return false;
        }
        
        // Block dangerous IP ranges
        if (
          (a === 0) ||                           // 0.0.0.0/8 - "This network"
          (a === 127) ||                         // 127.0.0.0/8 - Loopback
          (a === 10) ||                          // 10.0.0.0/8 - Private
          (a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0/12 - Private
          (a === 192 && b === 168) ||            // 192.168.0.0/16 - Private
          (a === 169 && b === 254) ||            // 169.254.0.0/16 - Link-local
          (a === 100 && b >= 64 && b <= 127) ||  // 100.64.0.0/10 - CGNAT
          (a === 192 && b === 0 && c === 0) ||   // 192.0.0.0/24 - Special-use
          (a === 198 && b >= 18 && b <= 19) ||   // 198.18.0.0/15 - Benchmark
          (a >= 224)                             // 224.0.0.0/4 - Multicast/Reserved
        ) {
          return false;
        }
      }
      
      // Block IPv6 private and special ranges (basic patterns)
      if (hostname.includes(':')) {
        const lower = hostname.toLowerCase();
        if (
          lower === '::1' ||                     // Loopback
          lower.startsWith('fc') ||              // fc00::/7 - Unique local
          lower.startsWith('fd') ||              // fd00::/8 - Unique local  
          lower.startsWith('fe8') ||             // fe80::/10 - Link-local
          lower.startsWith('fe9') ||
          lower.startsWith('fea') ||
          lower.startsWith('feb') ||
          lower.startsWith('::ffff:')            // IPv4-mapped IPv6
        ) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }, {
    message: "URL must be http/https on port 80/443 and not target private/internal networks"
  }),
  serviceType: z.enum(['technician-matching', 'notification', 'email', 'integration'], {
    required_error: "Please select a service type",
  }),
  status: z.enum(['active', 'inactive']).default('inactive')
});

type ServiceFormData = z.infer<typeof serviceSchema>;

function EditServiceDialog({ 
  service, 
  onServiceUpdated 
}: { 
  service: Service; 
  onServiceUpdated: () => void; 
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      serviceName: service.serviceName,
      serviceUrl: service.serviceUrl,
      serviceType: service.serviceType as 'technician-matching' | 'notification' | 'email' | 'integration',
      status: service.status,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      return apiRequest("PUT", `/api/services/${service.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Service updated",
        description: "The service has been successfully updated.",
      });
      setOpen(false);
      onServiceUpdated();
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update service.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ServiceFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          data-testid={`button-edit-${service.id}`}
        >
          <Edit className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Service</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="serviceName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Name</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="e.g., Primary Technician Matcher"
                      data-testid="input-edit-service-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serviceUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service URL</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="https://api.example.com"
                      data-testid="input-edit-service-url"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serviceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-service-type">
                        <SelectValue placeholder="Select service type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="technician-matching">Technician Matching</SelectItem>
                      <SelectItem value="notification">Notification</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="integration">Integration</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-service-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                data-testid="button-cancel-edit-service"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                data-testid="button-update-service"
              >
                {updateMutation.isPending ? "Updating..." : "Update Service"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddServiceDialog({ onServiceAdded }: { onServiceAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      serviceName: "",
      serviceUrl: "",
      serviceType: undefined,
      status: "inactive"
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      return apiRequest("POST", "/api/services", data);
    },
    onSuccess: () => {
      toast({
        title: "Service created",
        description: "The service has been successfully added.",
      });
      form.reset();
      setOpen(false);
      onServiceAdded();
    },
    onError: (error: any) => {
      toast({
        title: "Creation failed",
        description: error.message || "Failed to create service.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ServiceFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2" data-testid="button-add-service">
          <Plus className="h-4 w-4" />
          Add Service
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Service</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="serviceName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Name</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="e.g., Primary Technician Matcher"
                      data-testid="input-service-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serviceUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service URL</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="https://api.example.com"
                      data-testid="input-service-url"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serviceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-service-type">
                        <SelectValue placeholder="Select service type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="technician-matching">Technician Matching</SelectItem>
                      <SelectItem value="notification">Notification</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="integration">Integration</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-service-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                data-testid="button-cancel-service"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                data-testid="button-submit-service"
              >
                {createMutation.isPending ? "Creating..." : "Create Service"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ServiceCard({ service, onUpdate, onDelete }: { 
  service: Service; 
  onUpdate: () => void; 
  onDelete: (id: string) => void; 
}) {
  const { toast } = useToast();

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/services/${service.id}/test`);
    },
    onSuccess: () => {
      toast({
        title: "Connection test completed",
        description: "Service connection test was successful.",
      });
      onUpdate();
    },
    onError: (error: any) => {
      toast({
        title: "Connection test failed",
        description: error.message || "Failed to test service connection.",
        variant: "destructive",
      });
      onUpdate();
    },
  });

  const getStatusIcon = () => {
    switch (service.connectionStatus) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'disconnected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = () => {
    switch (service.connectionStatus) {
      case 'connected':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'disconnected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }
  };

  const getTypeColor = () => {
    switch (service.serviceType) {
      case 'technician-matching':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'notification':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'email':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'integration':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-service-${service.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{service.serviceName}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={service.status === 'active' ? 'border-green-500 text-green-700' : 'border-gray-500 text-gray-700'}
              data-testid={`badge-status-${service.id}`}
            >
              {service.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">URL:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate max-w-[200px]" data-testid={`text-url-${service.id}`}>
              {service.serviceUrl}
            </code>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className={getTypeColor()}>
              {service.serviceType}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {getStatusIcon()}
            <span className="font-medium">Connection:</span>
            <Badge variant="outline" className={getStatusColor()} data-testid={`badge-connection-${service.id}`}>
              {service.connectionStatus}
            </Badge>
          </div>
          {service.lastTested && (
            <div className="text-xs text-muted-foreground">
              Last tested: {new Date(service.lastTested).toLocaleString()}
            </div>
          )}
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => testConnectionMutation.mutate()}
            disabled={testConnectionMutation.isPending}
            className="flex-1"
            data-testid={`button-test-${service.id}`}
          >
            {testConnectionMutation.isPending ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Plug className="h-3 w-3 mr-1" />
                Test Connection
              </>
            )}
          </Button>
          <EditServiceDialog service={service} onServiceUpdated={onUpdate} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(service.id)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            data-testid={`button-delete-${service.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function Services() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: services, isLoading, error, refetch } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const deleteMutation = useMutation({
    mutationFn: async (serviceId: string) => {
      return apiRequest("DELETE", `/api/services/${serviceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({
        title: "Service deleted",
        description: "The service has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete service.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = async (serviceId: string) => {
    const service = services?.find(s => s.id === serviceId);
    if (service && window.confirm(`Are you sure you want to delete "${service.serviceName}"? This action cannot be undone.`)) {
      deleteMutation.mutate(serviceId);
    }
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleServiceAdded = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/services"] });
  };

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400">Error loading services: {(error as Error).message}</p>
        <Button onClick={handleRefresh} className="mt-4" data-testid="button-retry-services">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Service Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage your connected services and integrations
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isLoading}
            data-testid="button-refresh-services"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <AddServiceDialog onServiceAdded={handleServiceAdded} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-2xl font-bold" data-testid="stat-total-services">
                  {services?.length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Total Services</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600" data-testid="stat-active-services">
                  {services?.filter(s => s.status === 'active').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600" data-testid="stat-connected-services">
                  {services?.filter(s => s.connectionStatus === 'connected').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600" data-testid="stat-disconnected-services">
                  {services?.filter(s => s.connectionStatus === 'disconnected').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Disconnected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Services Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-full"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                  <div className="h-8 bg-muted rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : services && services.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              onUpdate={handleRefresh}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border-2 border-dashed border-muted rounded-lg">
          <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No services configured</h3>
          <p className="text-muted-foreground mb-4">
            Get started by adding your first service integration.
          </p>
          <AddServiceDialog onServiceAdded={handleServiceAdded} />
        </div>
      )}
    </div>
  );
}