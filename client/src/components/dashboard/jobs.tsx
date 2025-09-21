import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshCw, Briefcase, Clock, MapPin, User, Trash2, MoreHorizontal, Eye, Edit, Users, ChevronDown, ChevronUp, Mail, Award, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Job {
  id: string;
  clientEmail: string;
  subject: string;
  bodyPlain: string;
  location: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  jobType: string | null;
  techsNeeded: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  skills: string[];
  isAvailable: string;
  createdAt: string;
}

interface TechnicianMatchResult {
  status: string;
  job: {
    id: string;
    clientEmail: string;
    location: string | null;
    jobType: string | null;
    techsNeeded: number | null;
  };
  matchingTechnicians: Employee[];
  totalMatches: number;
}

export function Jobs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State for expandable technician matching results
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [technicianResults, setTechnicianResults] = useState<Map<string, TechnicianMatchResult>>(new Map());

  const { data: jobs, isLoading, error, refetch } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const deleteMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete job");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Job deleted",
        description: "The job request has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete job request.",
        variant: "destructive",
      });
    },
  });

  const findTechniciansMutation = useMutation({
    mutationFn: async (jobId: string): Promise<TechnicianMatchResult> => {
      const response = await fetch(`/api/jobs/${jobId}/find-technicians`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to find matching technicians");
      }
      
      return response.json();
    },
    onSuccess: (data, jobId) => {
      // Store the results for this job
      setTechnicianResults(prev => new Map(prev).set(jobId, data));
      
      // Expand the job row to show results
      setExpandedJobs(prev => new Set(prev).add(jobId));
      
      toast({
        title: "Technicians Found",
        description: `Found ${data.totalMatches} matching technician${data.totalMatches !== 1 ? 's' : ''} for this job.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Search failed",
        description: error.message || "Failed to find matching technicians.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = async (jobId: string, clientEmail: string) => {
    if (window.confirm(`Are you sure you want to delete the job request from ${clientEmail}? This action cannot be undone.`)) {
      deleteMutation.mutate(jobId);
    }
  };

  const handleFindTechnicians = (jobId: string) => {
    findTechniciansMutation.mutate(jobId);
  };

  const toggleJobExpansion = (jobId: string) => {
    setExpandedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const handleRefresh = () => {
    refetch();
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM dd, yyyy HH:mm");
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return "text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20";
      case "assigned":
        return "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20";
      case "completed":
        return "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20";
      default:
        return "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/20";
    }
  };

  const jobCount = jobs?.length || 0;

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            <p>Error loading jobs: {error instanceof Error ? error.message : "Unknown error"}</p>
            <Button onClick={handleRefresh} className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Jobs</h3>
              <Briefcase className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {jobCount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              All time requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
              <Clock className="h-4 w-4 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {jobs?.filter(job => job.status === "pending").length || 0}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Awaiting assignment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Parsed Fields</h3>
              <MapPin className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-foreground">
              {jobs ? Math.round((jobs.filter(job => job.location).length / jobs.length) * 100) : 0}%
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Successfully parsed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Latest Request</h3>
              <User className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-sm font-medium text-foreground">
              {jobs?.[0]?.clientEmail?.split('@')[0] || "None"}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {jobs?.[0] ? formatDate(jobs[0].createdAt) : "No requests yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Job Requests</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Showing {jobCount} parsed email job requests
              </p>
            </div>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={isLoading}
              data-testid="button-refresh-jobs"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Loading jobs...</span>
            </div>
          ) : jobCount === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No job requests received yet</p>
              <p className="text-sm mt-2">Job requests will appear here when emails are processed</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Timestamp</TableHead>
                    <TableHead className="w-[200px]">Client Email</TableHead>
                    <TableHead className="w-[180px]">Location</TableHead>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead className="w-[80px]">Time</TableHead>
                    <TableHead className="w-[150px]">Job Type</TableHead>
                    <TableHead className="w-[80px] text-center">Techs</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs?.map((job) => (
                    <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span data-testid={`text-timestamp-${job.id}`}>
                            {format(new Date(job.createdAt), "MMM dd")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(job.createdAt), "HH:mm")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium" data-testid={`text-email-${job.id}`}>
                            {job.clientEmail}
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {job.subject}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-location-${job.id}`}>
                        {job.location ? (
                          <span className="text-sm">{job.location}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not parsed</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-date-${job.id}`}>
                        {job.scheduledDate ? (
                          <span className="text-sm">{job.scheduledDate}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not parsed</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-time-${job.id}`}>
                        {job.scheduledTime ? (
                          <span className="text-sm">{job.scheduledTime}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not parsed</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-jobtype-${job.id}`}>
                        {job.jobType ? (
                          <span className="text-sm capitalize">{job.jobType}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not parsed</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-techs-${job.id}`}>
                        {job.techsNeeded ? (
                          <span className="text-sm font-medium">{job.techsNeeded}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span 
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
                          data-testid={`status-${job.id}`}
                        >
                          {job.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              data-testid={`button-menu-${job.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open job menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => {
                                // TODO: Implement view details functionality
                                toast({
                                  title: "View Details",
                                  description: "Job details view coming soon",
                                });
                              }}
                              data-testid={`menu-view-${job.id}`}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                // TODO: Implement edit functionality
                                toast({
                                  title: "Edit Job",
                                  description: "Job editing functionality coming soon",
                                });
                              }}
                              data-testid={`menu-edit-${job.id}`}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Job
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleFindTechnicians(job.id)}
                              disabled={findTechniciansMutation.isPending}
                              data-testid={`menu-match-${job.id}`}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              {findTechniciansMutation.isPending ? "Searching..." : "Find Technicians"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(job.id, job.clientEmail)}
                              disabled={deleteMutation.isPending}
                              className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                              data-testid={`menu-delete-${job.id}`}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Job
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expandable technician matching results */}
                    {technicianResults.has(job.id) && (
                      <TableRow>
                        <TableCell colSpan={9} className="p-0">
                          <div className="border-t bg-muted/30">
                            <div className="p-4 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-blue-500" />
                                  <h4 className="font-medium">
                                    Matching Technicians ({technicianResults.get(job.id)?.totalMatches || 0})
                                  </h4>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleJobExpansion(job.id)}
                                  data-testid={`button-toggle-${job.id}`}
                                >
                                  {expandedJobs.has(job.id) ? (
                                    <>
                                      <ChevronUp className="h-4 w-4 mr-1" />
                                      Collapse
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="h-4 w-4 mr-1" />
                                      Expand
                                    </>
                                  )}
                                </Button>
                              </div>
                              
                              {expandedJobs.has(job.id) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {technicianResults.get(job.id)?.matchingTechnicians.map((technician) => (
                                    <Card key={technician.id} className="bg-background">
                                      <CardContent className="p-4">
                                        <div className="space-y-3">
                                          {/* Technician header */}
                                          <div className="flex items-start justify-between">
                                            <div>
                                              <h5 className="font-medium text-foreground" data-testid={`text-tech-name-${technician.id}`}>
                                                {technician.name}
                                              </h5>
                                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                <Mail className="h-3 w-3" />
                                                <span data-testid={`text-tech-email-${technician.id}`}>
                                                  {technician.email}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <CheckCircle className="h-4 w-4 text-green-500" />
                                              <span className="text-xs text-green-600 font-medium">Available</span>
                                            </div>
                                          </div>
                                          
                                          {/* Skills */}
                                          <div>
                                            <div className="flex items-center gap-1 mb-2">
                                              <Award className="h-3 w-3 text-blue-500" />
                                              <span className="text-xs font-medium text-muted-foreground">Skills</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                              {technician.skills.map((skill, index) => (
                                                <span
                                                  key={index}
                                                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                                                  data-testid={`skill-${technician.id}-${index}`}
                                                >
                                                  {skill}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                          
                                          {/* Actions */}
                                          <div className="flex gap-2 pt-2">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="flex-1"
                                              onClick={() => {
                                                toast({
                                                  title: "Contact Technician",
                                                  description: `Contact functionality for ${technician.name} coming soon`,
                                                });
                                              }}
                                              data-testid={`button-contact-${technician.id}`}
                                            >
                                              <Mail className="h-3 w-3 mr-1" />
                                              Contact
                                            </Button>
                                            <Button
                                              size="sm"
                                              className="flex-1"
                                              onClick={() => {
                                                toast({
                                                  title: "Assign Technician",
                                                  description: `Assignment functionality for ${technician.name} coming soon`,
                                                });
                                              }}
                                              data-testid={`button-assign-${technician.id}`}
                                            >
                                              <CheckCircle className="h-3 w-3 mr-1" />
                                              Assign
                                            </Button>
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              )}
                              
                              {technicianResults.get(job.id)?.totalMatches === 0 && (
                                <div className="text-center py-6 text-muted-foreground">
                                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                  <p>No matching technicians found for this job</p>
                                  <p className="text-sm mt-1">Try adjusting the job requirements or create more employee profiles</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}