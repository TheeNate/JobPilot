import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Briefcase, Clock, MapPin, User, Trash2, Users, Star, UserCheck, Loader2, ChevronDown, ChevronUp, Brain, Award } from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";


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
  proposedStaffing: string | null;
  matchScore: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function Jobs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [aiAnalysis, setAiAnalysis] = useState<Map<string, any>>(new Map());
  const [loadingAnalysis, setLoadingAnalysis] = useState<Set<string>>(new Set());


  const { data: jobs, isLoading, error, refetch } = useQuery<Job[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const deleteJobMutation = useMutation({
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
    onSettled: () => {
      setDeletingJobId(null);
    }
  });

  const matchTechniciansMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/jobs/${jobId}/match-technicians`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Technicians matched",
        description: "Proposed staffing has been updated with available technicians.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Matching failed",
        description: error.message || "Failed to match technicians for this job.",
        variant: "destructive",
      });
    },
  });

  const toggleRowExpansion = async (jobId: string) => {
    const newExpanded = new Set(expandedRows);

    if (expandedRows.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);

      // Fetch AI analysis if not already loaded
      if (!aiAnalysis.has(jobId) && !loadingAnalysis.has(jobId)) {
        setLoadingAnalysis(new Set(loadingAnalysis).add(jobId));

        try {
          const response = await fetch(`/api/jobs/${jobId}/match-technicians`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });

          if (response.ok) {
            const data = await response.json();
            setAiAnalysis(new Map(aiAnalysis).set(jobId, data.data));
          }
        } catch (error) {
          console.error('Failed to fetch AI analysis:', error);
        } finally {
          setLoadingAnalysis(new Set(Array.from(loadingAnalysis).filter(id => id !== jobId)));
        }
      }
    }

    setExpandedRows(newExpanded);
  };

  const handleDelete = async (jobId: string, clientEmail: string) => {
    if (window.confirm(`Are you sure you want to delete the job request from ${clientEmail}? This action cannot be undone.`)) {
      deleteJobMutation.mutate(jobId);
    }
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
                    <TableHead className="w-[180px]">Proposed Staffing</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[80px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs?.map((job) => (
                    <>
                      <TableRow key={job.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {format(new Date(job.createdAt), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {job.clientEmail}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {job.location || 'Not specified'}
                        </TableCell>
                        <TableCell>{job.scheduledDate || '-'}</TableCell>
                        <TableCell>{job.scheduledTime || '-'}</TableCell>
                        <TableCell>
                          {job.jobType ? (
                            <Badge variant="outline" className="font-normal">
                              {job.jobType}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Not specified</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {job.techsNeeded || '-'}
                        </TableCell>
                        <TableCell>
                          {job.proposedStaffing ? (
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <Users className="h-4 w-4 text-blue-500" />
                                <span className="text-sm font-medium truncate max-w-[120px]" title={job.proposedStaffing}>
                                  {job.proposedStaffing}
                                </span>
                              </div>
                              {job.matchScore && (
                                <div className="flex items-center space-x-1">
                                  <Star className="h-3 w-3 text-yellow-500 fill-current" />
                                  <span className="text-xs text-muted-foreground">{job.matchScore}% match</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2 text-muted-foreground">
                              <Users className="h-4 w-4 opacity-50" />
                              <span className="text-xs italic">No match yet</span>
                            </div>
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
                          <div className="flex items-center justify-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRowExpansion(job.id)}
                              disabled={loadingAnalysis.has(job.id)}
                              title="View AI Analysis"
                            >
                              {loadingAnalysis.has(job.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : expandedRows.has(job.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => matchTechniciansMutation.mutate(job.id)}
                              disabled={matchTechniciansMutation.isPending && matchTechniciansMutation.variables === job.id}
                              title="Match Technicians"
                            >
                              {matchTechniciansMutation.isPending && matchTechniciansMutation.variables === job.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Users className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeletingJobId(job.id);
                                deleteJobMutation.mutate(job.id);
                              }}
                              disabled={deletingJobId === job.id}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete Job"
                            >
                              {deletingJobId === job.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {expandedRows.has(job.id) && (
                        <TableRow key={`${job.id}-expanded`}>
                          <TableCell colSpan={10} className="p-0">
                            <div className="border-t bg-muted/30 p-4 space-y-4">
                              <div className="flex items-center space-x-2 text-sm font-medium text-muted-foreground">
                                <Brain className="h-4 w-4" />
                                <span>AI Analysis for {job.jobType || 'Job'}</span>
                              </div>

                              {loadingAnalysis.has(job.id) ? (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                  <span>Analyzing job requirements and technician matches...</span>
                                </div>
                              ) : aiAnalysis.has(job.id) ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                  {/* Top Recommendation */}
                                  {aiAnalysis.get(job.id)?.aiAnalysis?.topRecommendation && (
                                    <Card>
                                      <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center space-x-2">
                                          <Star className="h-4 w-4 text-yellow-500" />
                                          <span>Top Recommendation</span>
                                        </CardTitle>
                                      </CardHeader>
                                      <CardContent className="pt-0">
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="font-medium">
                                              {aiAnalysis.get(job.id).aiAnalysis.topRecommendation.technician.name}
                                            </span>
                                            <Badge variant="default">
                                              {aiAnalysis.get(job.id).aiAnalysis.topRecommendation.confidenceScore}% match
                                            </Badge>
                                          </div>
                                          <div className="text-sm text-muted-foreground space-y-1">
                                            {aiAnalysis.get(job.id).aiAnalysis.topRecommendation.reasoning?.map((reason: string, idx: number) => (
                                              <div key={idx} className="flex items-start space-x-2">
                                                <span className="text-green-500 mt-0.5">✓</span>
                                                <span>{reason}</span>
                                              </div>
                                            ))}
                                          </div>
                                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            <span>Status: {aiAnalysis.get(job.id).aiAnalysis.topRecommendation.availabilityStatus}</span>
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  )}

                                  {/* Job Analysis */}
                                  {aiAnalysis.get(job.id)?.aiAnalysis?.jobAnalysis && (
                                    <Card>
                                      <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center space-x-2">
                                          <Award className="h-4 w-4 text-blue-500" />
                                          <span>Job Analysis</span>
                                        </CardTitle>
                                      </CardHeader>
                                      <CardContent className="pt-0">
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between text-sm">
                                            <span>Complexity:</span>
                                            <Badge variant={aiAnalysis.get(job.id).aiAnalysis.jobAnalysis.complexity === 'complex' ? 'destructive' : aiAnalysis.get(job.id).aiAnalysis.jobAnalysis.complexity === 'moderate' ? 'default' : 'secondary'}>
                                              {aiAnalysis.get(job.id).aiAnalysis.jobAnalysis.complexity}
                                            </Badge>
                                          </div>
                                          <div className="text-sm">
                                            <span className="font-medium">Required Skills:</span>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                              {aiAnalysis.get(job.id).aiAnalysis.jobAnalysis.requiredSkills?.map((skill: string, idx: number) => (
                                                <Badge key={idx} variant="outline" className="text-xs">
                                                  {skill}
                                                </Badge>
                                              ))}
                                            </div>
                                          </div>
                                          <div className="text-sm">
                                            <span className="font-medium">Duration:</span>
                                            <span className="ml-2 text-muted-foreground">
                                              {aiAnalysis.get(job.id).aiAnalysis.jobAnalysis.estimatedDuration}
                                            </span>
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  )}

                                  {/* Team Composition for Multi-Tech Jobs */}
                                  {aiAnalysis.get(job.id)?.aiAnalysis?.teamComposition && 
                                   aiAnalysis.get(job.id).aiAnalysis.teamComposition.size > 1 && (
                                    <Card className="md:col-span-2">
                                      <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center space-x-2">
                                          <Users className="h-4 w-4 text-blue-500" />
                                          <span>Recommended Team ({aiAnalysis.get(job.id).aiAnalysis.teamComposition.size} technicians)</span>
                                        </CardTitle>
                                      </CardHeader>
                                      <CardContent className="pt-0">
                                        <div className="space-y-4">
                                          {/* Team Members */}
                                          <div className="space-y-3">
                                            {aiAnalysis.get(job.id).aiAnalysis.teamComposition.members.map((member: any, idx: number) => (
                                              <div key={idx} className="flex items-start space-x-3 p-3 border rounded-lg bg-blue-50/50">
                                                <div className="flex-shrink-0 mt-1">
                                                  <User className="h-4 w-4 text-blue-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center space-x-2">
                                                      <span className="font-medium text-sm">{member.technician.name}</span>
                                                      <Badge variant={member.role === 'Lead' ? 'default' : member.role === 'Specialist' ? 'secondary' : 'outline'} className="text-xs">
                                                        {member.role}
                                                      </Badge>
                                                    </div>
                                                    <Badge variant="default" className="text-xs">
                                                      {member.confidenceScore}% match
                                                    </Badge>
                                                  </div>
                                                  <div className="text-xs text-muted-foreground space-y-1">
                                                    {member.reasoning?.map((reason: string, reasonIdx: number) => (
                                                      <div key={reasonIdx} className="flex items-start space-x-1">
                                                        <span className="text-green-500 mt-0.5 text-xs">✓</span>
                                                        <span>{reason}</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          
                                          {/* Team Dynamics & Coordination */}
                                          {(aiAnalysis.get(job.id).aiAnalysis.teamComposition.teamDynamics || 
                                            aiAnalysis.get(job.id).aiAnalysis.teamComposition.coordinationPlan) && (
                                            <div className="space-y-2 p-3 bg-gray-50 rounded-lg border">
                                              {aiAnalysis.get(job.id).aiAnalysis.teamComposition.teamDynamics && (
                                                <div className="text-sm">
                                                  <span className="font-medium text-gray-700">Team Dynamics:</span>
                                                  <span className="ml-2 text-gray-600">
                                                    {aiAnalysis.get(job.id).aiAnalysis.teamComposition.teamDynamics}
                                                  </span>
                                                </div>
                                              )}
                                              {aiAnalysis.get(job.id).aiAnalysis.teamComposition.coordinationPlan && (
                                                <div className="text-sm">
                                                  <span className="font-medium text-gray-700">Coordination:</span>
                                                  <span className="ml-2 text-gray-600">
                                                    {aiAnalysis.get(job.id).aiAnalysis.teamComposition.coordinationPlan}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  )}

                                  {/* Alternative Options */}
                                  {aiAnalysis.get(job.id)?.aiAnalysis?.alternatives?.length > 0 && (
                                    <Card className="md:col-span-2">
                                      <CardHeader className="pb-2">
                                        <CardTitle className="text-sm">Alternative Options</CardTitle>
                                      </CardHeader>
                                      <CardContent className="pt-0">
                                        <div className="space-y-2">
                                          {aiAnalysis.get(job.id).aiAnalysis.alternatives.slice(0, 3).map((alt: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between p-2 border rounded-sm">
                                              <div className="flex-1">
                                                <div className="flex items-center space-x-2">
                                                  <span className="font-medium text-sm">{alt.technician.name}</span>
                                                  <Badge variant="outline" className="text-xs">
                                                    {alt.confidenceScore}% match
                                                  </Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                  {alt.reasoning?.[0] || 'Good alternative option'}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  )}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-muted-foreground">
                                  <p>Click the dropdown button above to load AI analysis</p>
                                </div>
                              )}

                              {aiAnalysis.get(job.id)?.aiAnalysis?.fallbackUsed && (
                                <div className="mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                                  ⚠️ AI analysis unavailable - using enhanced logic-based matching
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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