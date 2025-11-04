import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Calendar, Shield, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";
import { staffRoleInfo } from "@shared/schema";

const staffFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  specialty: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.enum(["basic", "view_own_calendar", "view_all_calendars", "manage_bookings", "admin_access"]).default("basic"),
  active: z.boolean().default(true),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

export default function AdminStaff() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  const { data: staff = [], isLoading } = useQuery<Staff[]>({
    queryKey: ["/api/admin/staff"],
  });

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: "",
      specialty: "",
      email: "",
      phone: "",
      role: "basic",
      active: true,
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/staff', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/staff'] });
      setIsDialogOpen(false);
      setEditingStaff(null);
      form.reset();
      toast({
        title: "Staff member added",
        description: "The staff member has been added successfully.",
      });
    },
    onError: (error: any) => {
      const status = error?.status ?? error?.response?.status;
      const data = error?.data ?? error?.response?.data;
      
      if (status === 412 && data?.setupRequired) {
        toast({
          title: "Setup Required",
          description: "Please complete the setup wizard first.",
          variant: "destructive",
        });
        window.location.href = "/admin/setup";
        return;
      }
      
      if (status === 401) {
        toast({
          title: "Unauthorized",
          description: "Please log in again.",
          variant: "destructive",
        });
        window.location.href = "/api/login";
        return;
      }
      
      if (status === 403) {
        toast({
          title: "Forbidden",
          description: "You don't have permission to perform this action.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to add staff member",
        variant: "destructive",
      });
    },
  });

  const updateStaffMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: any }) => {
      return apiRequest('PUT', `/api/admin/staff/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/staff'] });
      setIsDialogOpen(false);
      setEditingStaff(null);
      form.reset();
      toast({
        title: "Staff member updated",
        description: "The staff member has been updated successfully.",
      });
    },
    onError: (error: any) => {
      const status = error?.status ?? error?.response?.status;
      const data = error?.data ?? error?.response?.data;
      
      if (status === 412 && data?.setupRequired) {
        toast({
          title: "Setup Required",
          description: "Please complete the setup wizard first.",
          variant: "destructive",
        });
        window.location.href = "/admin/setup";
        return;
      }
      
      if (status === 401) {
        toast({
          title: "Unauthorized",
          description: "Please log in again.",
          variant: "destructive",
        });
        window.location.href = "/api/login";
        return;
      }
      
      if (status === 403) {
        toast({
          title: "Forbidden",
          description: "You don't have permission to perform this action.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to update staff member",
        variant: "destructive",
      });
    },
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/staff'] });
      toast({
        title: "Staff member deleted",
        description: "The staff member has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      const status = error?.status ?? error?.response?.status;
      const data = error?.data ?? error?.response?.data;
      
      if (status === 412 && data?.setupRequired) {
        toast({
          title: "Setup Required",
          description: "Please complete the setup wizard first.",
          variant: "destructive",
        });
        window.location.href = "/admin/setup";
        return;
      }
      
      if (status === 401) {
        toast({
          title: "Unauthorized",
          description: "Please log in again.",
          variant: "destructive",
        });
        window.location.href = "/api/login";
        return;
      }
      
      if (status === 403) {
        toast({
          title: "Forbidden",
          description: "You don't have permission to perform this action.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Error",
        description: error.message || "Failed to delete staff member",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StaffFormValues) => {
    if (editingStaff) {
      updateStaffMutation.mutate({ id: editingStaff.id, data });
    } else {
      createStaffMutation.mutate(data);
    }
  };

  const handleEdit = (member: Staff) => {
    setEditingStaff(member);
    form.reset({
      name: member.name,
      specialty: member.specialty || "",
      email: member.email || "",
      phone: member.phone || "",
      role: member.role as any,
      active: member.active ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this staff member?')) {
      deleteStaffMutation.mutate(id);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingStaff(null);
      form.reset();
    }
  };

  if (isLoading) {
    return <div className="p-8">Loading staff...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="staff-title">Staff Management</h1>
          <p className="text-muted-foreground">Manage staff members, schedules, and performance</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-staff" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Staff Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingStaff ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
              <DialogDescription>
                {editingStaff ? "Update staff member information" : "Add a new staff member to your team"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" data-testid="input-staff-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="specialty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Specialty</FormLabel>
                        <FormControl>
                          <Input placeholder="Massage Therapist" data-testid="input-staff-specialty" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-staff-role">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="basic">Basic Staff</SelectItem>
                            <SelectItem value="view_own_calendar">View Own Calendar</SelectItem>
                            <SelectItem value="view_all_calendars">View All Calendars</SelectItem>
                            <SelectItem value="manage_bookings">Manage Bookings</SelectItem>
                            <SelectItem value="admin_access">Admin Access</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" data-testid="input-staff-email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+971 50 123 4567" data-testid="input-staff-phone" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => handleDialogClose(false)} data-testid="button-cancel-staff">
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="button-save-staff">
                    {editingStaff ? "Update Staff" : "Add Staff"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {staff.map((member) => (
          <Card key={member.id}>
            <CardHeader>
              <div className="flex items-start gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <CardTitle className="text-lg">{member.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{member.specialty}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{member.email || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{member.phone || "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <Badge variant="outline" className="gap-1" data-testid={`badge-role-${member.id}`}>
                    <Shield className="h-3 w-3" />
                    {staffRoleInfo[member.role as keyof typeof staffRoleInfo]?.label || "Basic Staff"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEdit(member)}
                  data-testid={`button-edit-staff-${member.id}`}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(member.id)}
                  data-testid={`button-delete-staff-${member.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {staff.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No staff members yet. Add your first staff member to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
