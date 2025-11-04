import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, Users, UserCheck } from "lucide-react";

interface NotificationSettingsData {
  // Customer settings
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  sendConfirmation: boolean;
  sendModification: boolean;
  sendCancellation: boolean;
  sendReminder: boolean;
  reminderHoursBefore: number;
  // Staff settings
  staffEmailEnabled: boolean;
  staffSmsEnabled: boolean;
  staffWhatsappEnabled: boolean;
  sendStaffConfirmation: boolean;
  sendStaffModification: boolean;
  sendStaffCancellation: boolean;
}

export default function NotificationSettings() {
  const { toast } = useToast();
  
  const { data: settings, isLoading } = useQuery<NotificationSettingsData>({
    queryKey: ["/api/admin/notification-settings"],
  });

  const [formData, setFormData] = useState<NotificationSettingsData>({
    emailEnabled: false,
    smsEnabled: false,
    whatsappEnabled: false,
    sendConfirmation: true,
    sendModification: true,
    sendCancellation: true,
    sendReminder: false,
    reminderHoursBefore: 24,
    staffEmailEnabled: false,
    staffSmsEnabled: false,
    staffWhatsappEnabled: false,
    sendStaffConfirmation: true,
    sendStaffModification: true,
    sendStaffCancellation: true,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        emailEnabled: settings.emailEnabled ?? false,
        smsEnabled: settings.smsEnabled ?? false,
        whatsappEnabled: settings.whatsappEnabled ?? false,
        sendConfirmation: settings.sendConfirmation ?? true,
        sendModification: settings.sendModification ?? true,
        sendCancellation: settings.sendCancellation ?? true,
        sendReminder: settings.sendReminder ?? false,
        reminderHoursBefore: settings.reminderHoursBefore ?? 24,
        staffEmailEnabled: settings.staffEmailEnabled ?? false,
        staffSmsEnabled: settings.staffSmsEnabled ?? false,
        staffWhatsappEnabled: settings.staffWhatsappEnabled ?? false,
        sendStaffConfirmation: settings.sendStaffConfirmation ?? true,
        sendStaffModification: settings.sendStaffModification ?? true,
        sendStaffCancellation: settings.sendStaffCancellation ?? true,
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: NotificationSettingsData) => {
      return await apiRequest("PUT", "/api/admin/notification-settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-settings"] });
      toast({
        title: "Settings saved",
        description: "Notification preferences have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save notification settings.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Customer Notifications
          </CardTitle>
          <CardDescription>
            Configure when and how customers receive notifications about their bookings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Customer Notification Channels */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Notification Channels</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="customer-email">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send notifications via email</p>
                </div>
                <Switch
                  id="customer-email"
                  checked={formData.emailEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, emailEnabled: checked })}
                  data-testid="switch-customer-email"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="customer-sms">SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send notifications via SMS</p>
                </div>
                <Switch
                  id="customer-sms"
                  checked={formData.smsEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, smsEnabled: checked })}
                  data-testid="switch-customer-sms"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="customer-whatsapp">WhatsApp Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send notifications via WhatsApp</p>
                </div>
                <Switch
                  id="customer-whatsapp"
                  checked={formData.whatsappEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, whatsappEnabled: checked })}
                  data-testid="switch-customer-whatsapp"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Customer Notification Events */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Send Notifications For</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="customer-confirmation">Booking Confirmation</Label>
                <Switch
                  id="customer-confirmation"
                  checked={formData.sendConfirmation}
                  onCheckedChange={(checked) => setFormData({ ...formData, sendConfirmation: checked })}
                  data-testid="switch-customer-confirmation"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="customer-modification">Booking Modification</Label>
                <Switch
                  id="customer-modification"
                  checked={formData.sendModification}
                  onCheckedChange={(checked) => setFormData({ ...formData, sendModification: checked })}
                  data-testid="switch-customer-modification"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="customer-cancellation">Booking Cancellation</Label>
                <Switch
                  id="customer-cancellation"
                  checked={formData.sendCancellation}
                  onCheckedChange={(checked) => setFormData({ ...formData, sendCancellation: checked })}
                  data-testid="switch-customer-cancellation"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Staff Notifications
          </CardTitle>
          <CardDescription>
            Configure when and how staff members receive notifications about bookings assigned to them
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Staff Notification Channels */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Notification Channels</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="staff-email">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send notifications to staff via email</p>
                </div>
                <Switch
                  id="staff-email"
                  checked={formData.staffEmailEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, staffEmailEnabled: checked })}
                  data-testid="switch-staff-email"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="staff-sms">SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send notifications to staff via SMS</p>
                </div>
                <Switch
                  id="staff-sms"
                  checked={formData.staffSmsEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, staffSmsEnabled: checked })}
                  data-testid="switch-staff-sms"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="staff-whatsapp">WhatsApp Notifications</Label>
                  <p className="text-sm text-muted-foreground">Send notifications to staff via WhatsApp</p>
                </div>
                <Switch
                  id="staff-whatsapp"
                  checked={formData.staffWhatsappEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, staffWhatsappEnabled: checked })}
                  data-testid="switch-staff-whatsapp"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Staff Notification Events */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Notify Staff When</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="staff-confirmation">New Booking Created</Label>
                <Switch
                  id="staff-confirmation"
                  checked={formData.sendStaffConfirmation}
                  onCheckedChange={(checked) => setFormData({ ...formData, sendStaffConfirmation: checked })}
                  data-testid="switch-staff-confirmation"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="staff-modification">Booking Modified</Label>
                <Switch
                  id="staff-modification"
                  checked={formData.sendStaffModification}
                  onCheckedChange={(checked) => setFormData({ ...formData, sendStaffModification: checked })}
                  data-testid="switch-staff-modification"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="staff-cancellation">Booking Cancelled</Label>
                <Switch
                  id="staff-cancellation"
                  checked={formData.sendStaffCancellation}
                  onCheckedChange={(checked) => setFormData({ ...formData, sendStaffCancellation: checked })}
                  data-testid="switch-staff-cancellation"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={updateMutation.isPending}
              data-testid="button-save-notification-settings"
            >
              {updateMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
