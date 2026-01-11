import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Clock, User, Building2, Mail, Calendar, FileText, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type AdminApplication = {
  id: number;
  userId: string;
  businessName: string;
  businessType: string;
  status: string;
  appliedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  licenseUrl: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  reviewer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
};

export default function SuperAdmin() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<string>("pending");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<AdminApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: applications = [], isLoading } = useQuery<AdminApplication[]>({
    queryKey: ["/api/super-admin/applications", selectedTab],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedTab !== "all") {
        params.append("status", selectedTab);
      }
      const url = `/api/super-admin/applications${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (applicationId: number) => {
      return apiRequest("POST", `/api/super-admin/applications/${applicationId}/approve`);
    },
    onSuccess: async () => {
      toast({
        title: "Application Approved",
        description: "The admin application has been approved successfully.",
      });
      // Invalidate all application queries to force refetch
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/super-admin/applications"],
        refetchType: 'all'
      });
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve the application",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ applicationId, reason }: { applicationId: number; reason: string }) => {
      return apiRequest("POST", `/api/super-admin/applications/${applicationId}/reject`, { reason });
    },
    onSuccess: async () => {
      toast({
        title: "Application Rejected",
        description: "The admin application has been rejected.",
      });
      // Invalidate all application queries to force refetch
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/super-admin/applications"],
        refetchType: 'all'
      });
      setRejectDialogOpen(false);
      setSelectedApplication(null);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject the application",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (application: AdminApplication) => {
    approveMutation.mutate(application.id);
  };

  const handleRejectClick = (application: AdminApplication) => {
    setSelectedApplication(application);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    if (selectedApplication) {
      rejectMutation.mutate({
        applicationId: selectedApplication.id,
        reason: rejectionReason,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200" data-testid={`badge-status-pending`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200" data-testid={`badge-status-approved`}><Check className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200" data-testid={`badge-status-rejected`}><X className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  // Filter out applications without license attachments
  const applicationsWithLicense = applications.filter((app) => app.licenseUrl);
  
  const filteredApplications = applicationsWithLicense.filter((app) => {
    if (selectedTab === "all") return true;
    return app.status === selectedTab;
  });

  const pendingCount = applicationsWithLicense.filter((app) => app.status === "pending").length;
  const approvedCount = applicationsWithLicense.filter((app) => app.status === "approved").length;
  const rejectedCount = applicationsWithLicense.filter((app) => app.status === "rejected").length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-super-admin">Super Admin Dashboard</h1>
        <p className="text-muted-foreground">Review and manage admin applications</p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList data-testid="tabs-applications">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending {pendingCount > 0 && `(${pendingCount})`}
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            Approved {approvedCount > 0 && `(${approvedCount})`}
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            Rejected {rejectedCount > 0 && `(${rejectedCount})`}
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            All ({applicationsWithLicense.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} data-testid={`skeleton-application-${i}`}>
                  <CardHeader>
                    <div className="h-6 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse w-2/3 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded animate-pulse" />
                      <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredApplications.length === 0 ? (
            <Card data-testid="card-no-applications">
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No {selectedTab !== "all" ? selectedTab : ""} applications found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredApplications.map((application) => (
                <Card key={application.id} data-testid={`card-application-${application.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 mb-2">
                      <Building2 className="w-5 h-5" />
                      {application.businessName}
                    </CardTitle>
                    <CardDescription className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3" />
                        <span data-testid={`text-applicant-${application.id}`}>
                          {application.user?.firstName} {application.user?.lastName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-3 h-3" />
                        <span data-testid={`text-email-${application.id}`}>{application.user?.email}</span>
                      </div>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>Applied: {new Date(application.appliedAt).toLocaleDateString()}</span>
                    </div>

                    {application.licenseUrl && (
                      <div className="flex items-center gap-2">
                        <a
                          href={application.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover-elevate active-elevate-2 px-3 py-2 rounded-md border"
                          data-testid={`link-license-${application.id}`}
                        >
                          <FileText className="w-4 h-4" />
                          <span>View License Document</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {(application.status === "approved" || application.status === "rejected") && application.reviewedAt && (
                      <div className="p-3 bg-muted rounded-md space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Reviewed on {new Date(application.reviewedAt).toLocaleDateString()}
                        </p>
                        {application.reviewer && (
                          <p className="text-xs text-muted-foreground">
                            Reviewed by {application.reviewer.firstName} {application.reviewer.lastName}
                          </p>
                        )}
                      </div>
                    )}

                    {application.status === "approved" && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
                        <p className="text-sm text-green-600 dark:text-green-400">
                          <strong>Approved</strong>
                        </p>
                      </div>
                    )}

                    {application.status === "rejected" && application.rejectionReason && (
                      <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          <strong>Reason:</strong> {application.rejectionReason}
                        </p>
                      </div>
                    )}

                    {application.status === "pending" && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(application)}
                          disabled={approveMutation.isPending}
                          className="flex-1"
                          data-testid={`button-approve-${application.id}`}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRejectClick(application)}
                          disabled={rejectMutation.isPending}
                          className="flex-1"
                          data-testid={`button-reject-${application.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent data-testid="dialog-reject-application">
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting {selectedApplication?.businessName}'s application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Rejection Reason</Label>
              <Textarea
                id="reason"
                placeholder="Enter the reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                data-testid="textarea-rejection-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectionReason("");
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
