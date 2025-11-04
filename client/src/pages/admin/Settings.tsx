import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Building2, Mail, Phone, MapPin, DollarSign, Palette, Calendar, Link as LinkIcon, CheckCircle2, XCircle, FileText, Clock, Plus, Trash2, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { SpaSettings, SpaIntegration, Service, ServiceExtraTime, InsertServiceExtraTime } from "@shared/schema";
import NotificationProviderConfig from "@/components/NotificationProviderConfig";
import NotificationSettings from "@/components/NotificationSettings";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminSettings() {
  const { toast } = useToast();
  
  // Fetch existing settings
  const { data: settings, isLoading } = useQuery<SpaSettings>({
    queryKey: ["/api/admin/settings"],
  });

  // Fetch integrations for current spa
  const { data: integrations = [] } = useQuery<SpaIntegration[]>({
    queryKey: ["/api/integrations"],
  });

  // Fetch VAT settings
  const { data: vatSettings } = useQuery<{
    vatEnabled: boolean;
    taxRegistrationNumber: string | null;
    vatRegistrationDate: Date | null;
  }>({
    queryKey: ["/api/admin/vat-settings"],
  });

  // Fetch VAT threshold reminder settings
  const { data: thresholdSettings } = useQuery<{
    vatThresholdReminderEnabled: boolean;
    vatThresholdAmount: string;
    currentYearRevenue?: number;
    percentageOfThreshold?: number;
  }>({
    queryKey: ["/api/admin/vat-threshold-reminder"],
  });

  // Fetch services for extra time configuration
  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/admin/services"],
  });

  // Fetch extra time configurations
  const { data: extraTimes = [] } = useQuery<ServiceExtraTime[]>({
    queryKey: ["/api/admin/service-extra-time"],
  });

  // Check for OAuth callback results
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthSuccess = urlParams.get('oauth_success');
    const oauthError = urlParams.get('oauth_error');

    if (oauthSuccess) {
      toast({
        title: "Integration connected",
        description: `${oauthSuccess} has been successfully connected.`,
      });
      // Clean up URL
      window.history.replaceState({}, '', '/admin/settings');
    } else if (oauthError) {
      toast({
        title: "Connection failed",
        description: `Failed to connect: ${oauthError}`,
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/admin/settings');
    }
  }, [toast]);

  const [businessInfo, setBusinessInfo] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const [financialSettings, setFinancialSettings] = useState({
    currency: "AED",
    taxRate: "5",
  });

  const [branding, setBranding] = useState({
    color: "#1a4d6d",
    logoUrl: "",
  });

  const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string; isOpen?: boolean }>>({});

  const [vatConfig, setVatConfig] = useState({
    vatEnabled: false,
    taxRegistrationNumber: "",
  });

  const [vatThresholdReminder, setVatThresholdReminder] = useState({
    enabled: false,
    thresholdAmount: "375000",
  });

  // Extra Time state
  const [extraTimeDialog, setExtraTimeDialog] = useState<{
    open: boolean;
    serviceId: number | null;
    serviceName: string;
    editingId?: number;
  }>({
    open: false,
    serviceId: null,
    serviceName: "",
  });

  const [extraTimeForm, setExtraTimeForm] = useState<{
    timeType: "processing" | "blocked" | "servicing";
    durationMinutes: string;
    description: string;
    active: boolean;
  }>({
    timeType: "processing",
    durationMinutes: "0",
    description: "",
    active: true,
  });

  // Update state when settings are loaded
  useEffect(() => {
    if (settings) {
      setBusinessInfo({
        name: settings.spaName || "",
        email: settings.contactEmail || "",
        phone: settings.contactPhone || "",
        address: settings.address || "",
      });
      setFinancialSettings({
        currency: settings.currency || "AED",
        taxRate: settings.taxRate || "5",
      });
      setBranding({
        color: settings.brandColor || "#1a4d6d",
        logoUrl: settings.logoUrl || "",
      });
      if (settings.businessHours) {
        setBusinessHours(settings.businessHours as Record<string, { open: string; close: string }>);
      }
    }
  }, [settings]);

  // Update VAT config when loaded
  useEffect(() => {
    if (vatSettings) {
      setVatConfig({
        vatEnabled: vatSettings.vatEnabled || false,
        taxRegistrationNumber: vatSettings.taxRegistrationNumber || "",
      });
    }
  }, [vatSettings]);

  // Update VAT threshold reminder when loaded
  useEffect(() => {
    if (thresholdSettings) {
      setVatThresholdReminder({
        enabled: thresholdSettings.vatThresholdReminderEnabled || false,
        thresholdAmount: thresholdSettings.vatThresholdAmount || "375000",
      });
    }
  }, [thresholdSettings]);

  // Mutation to update settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<SpaSettings>) => {
      return await apiRequest("PUT", "/api/admin/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
  });

  const handleSaveBusinessInfo = () => {
    updateSettingsMutation.mutate(
      {
        spaName: businessInfo.name,
        contactEmail: businessInfo.email,
        contactPhone: businessInfo.phone,
        address: businessInfo.address,
      },
      {
        onSuccess: () => {
          toast({
            title: "Business information saved",
            description: "Your business details have been updated successfully.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save business information.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSaveFinancialSettings = () => {
    updateSettingsMutation.mutate(
      {
        currency: financialSettings.currency,
        taxRate: financialSettings.taxRate,
      },
      {
        onSuccess: () => {
          toast({
            title: "Financial settings saved",
            description: "Your financial settings have been updated successfully.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save financial settings.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSaveBranding = () => {
    updateSettingsMutation.mutate(
      {
        brandColor: branding.color,
        logoUrl: branding.logoUrl,
      },
      {
        onSuccess: () => {
          toast({
            title: "Branding saved",
            description: "Your branding settings have been updated successfully.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save branding.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSaveBusinessHours = () => {
    updateSettingsMutation.mutate(
      {
        businessHours: businessHours,
      },
      {
        onSuccess: () => {
          toast({
            title: "Business hours saved",
            description: "Your business hours have been updated successfully.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save business hours.",
            variant: "destructive",
          });
        },
      }
    );
  };

  // VAT settings mutation
  const updateVatMutation = useMutation({
    mutationFn: async (data: { vatEnabled: boolean; taxRegistrationNumber: string }) => {
      return await apiRequest("PUT", "/api/admin/vat-settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vat-settings"] });
    },
  });

  const handleSaveVatSettings = () => {
    // Validate TRN format if enabling VAT
    if (vatConfig.vatEnabled && vatConfig.taxRegistrationNumber) {
      const cleanTrn = vatConfig.taxRegistrationNumber.replace(/[\s-]/g, '');
      if (!/^\d{15}$/.test(cleanTrn)) {
        toast({
          title: "Invalid TRN",
          description: "UAE Tax Registration Number must be exactly 15 digits.",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate TRN is provided when enabling VAT
    if (vatConfig.vatEnabled && !vatConfig.taxRegistrationNumber) {
      toast({
        title: "TRN Required",
        description: "Please enter your Tax Registration Number to enable VAT.",
        variant: "destructive",
      });
      return;
    }

    updateVatMutation.mutate(
      {
        vatEnabled: vatConfig.vatEnabled,
        taxRegistrationNumber: vatConfig.taxRegistrationNumber,
      },
      {
        onSuccess: () => {
          toast({
            title: "VAT settings saved",
            description: vatConfig.vatEnabled 
              ? "VAT has been enabled for your spa. All new invoices will include VAT calculations."
              : "VAT settings have been updated successfully.",
          });
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to save VAT settings.",
            variant: "destructive",
          });
        },
      }
    );
  };

  // VAT threshold reminder mutation
  const updateThresholdReminderMutation = useMutation({
    mutationFn: async (data: { vatThresholdReminderEnabled: boolean; vatThresholdAmount: string }) => {
      return await apiRequest("PUT", "/api/admin/vat-threshold-reminder", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vat-threshold-reminder"] });
    },
  });

  const handleSaveThresholdReminder = () => {
    // Validate threshold amount
    const amount = parseFloat(vatThresholdReminder.thresholdAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid threshold amount.",
        variant: "destructive",
      });
      return;
    }

    updateThresholdReminderMutation.mutate(
      {
        vatThresholdReminderEnabled: vatThresholdReminder.enabled,
        vatThresholdAmount: vatThresholdReminder.thresholdAmount,
      },
      {
        onSuccess: () => {
          toast({
            title: "Reminder settings saved",
            description: vatThresholdReminder.enabled
              ? "You will be notified when your annual revenue approaches the VAT threshold."
              : "VAT threshold reminders have been disabled.",
          });
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to save reminder settings.",
            variant: "destructive",
          });
        },
      }
    );
  };

  // Connect to integration
  const handleConnectIntegration = async (provider: string, integrationType: string) => {
    try {
      const response = await fetch(
        `/api/oauth/${provider}/connect?integrationType=${integrationType}`
      );
      const data = await response.json();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      toast({
        title: "Connection failed",
        description: "Failed to initiate OAuth connection.",
        variant: "destructive",
      });
    }
  };

  // Disconnect integration
  const disconnectMutation = useMutation({
    mutationFn: async (integrationId: number) => {
      return await apiRequest("POST", `/api/integrations/${integrationId}/disconnect`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({
        title: "Integration disconnected",
        description: "The integration has been disconnected successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect integration.",
        variant: "destructive",
      });
    },
  });

  // Helper to find if integration is connected
  const getIntegrationStatus = (integrationType: string) => {
    return integrations.find(i => i.integrationType === integrationType && i.status === 'active');
  };

  // Extra Time mutations
  const createExtraTimeMutation = useMutation({
    mutationFn: async (data: InsertServiceExtraTime) => {
      return await apiRequest("POST", "/api/admin/service-extra-time", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-extra-time"] });
      toast({
        title: "Extra time created",
        description: "Service extra time has been added successfully.",
      });
      setExtraTimeDialog({ open: false, serviceId: null, serviceName: "" });
      setExtraTimeForm({
        timeType: "processing",
        durationMinutes: "0",
        description: "",
        active: true,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create extra time.",
        variant: "destructive",
      });
    },
  });

  const updateExtraTimeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertServiceExtraTime> }) => {
      return await apiRequest("PUT", `/api/admin/service-extra-time/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-extra-time"] });
      toast({
        title: "Extra time updated",
        description: "Service extra time has been updated successfully.",
      });
      setExtraTimeDialog({ open: false, serviceId: null, serviceName: "" });
      setExtraTimeForm({
        timeType: "processing",
        durationMinutes: "0",
        description: "",
        active: true,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update extra time.",
        variant: "destructive",
      });
    },
  });

  const deleteExtraTimeMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/service-extra-time/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-extra-time"] });
      toast({
        title: "Extra time deleted",
        description: "Service extra time has been removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete extra time.",
        variant: "destructive",
      });
    },
  });

  // Extra Time handlers
  const handleOpenExtraTimeDialog = (serviceId: number, serviceName: string, editData?: ServiceExtraTime) => {
    if (editData) {
      setExtraTimeForm({
        timeType: editData.timeType as "processing" | "blocked" | "servicing",
        durationMinutes: String(editData.durationMinutes),
        description: editData.description || "",
        active: editData.active ?? true,
      });
      setExtraTimeDialog({
        open: true,
        serviceId,
        serviceName,
        editingId: editData.id,
      });
    } else {
      setExtraTimeForm({
        timeType: "processing",
        durationMinutes: "0",
        description: "",
        active: true,
      });
      setExtraTimeDialog({
        open: true,
        serviceId,
        serviceName,
      });
    }
  };

  const handleSaveExtraTime = () => {
    if (!extraTimeDialog.serviceId) return;

    const durationMinutes = parseInt(extraTimeForm.durationMinutes);
    if (isNaN(durationMinutes) || durationMinutes < 0) {
      toast({
        title: "Invalid Duration",
        description: "Please enter a valid duration in minutes.",
        variant: "destructive",
      });
      return;
    }

    const data: InsertServiceExtraTime = {
      serviceId: extraTimeDialog.serviceId,
      timeType: extraTimeForm.timeType,
      durationMinutes,
      description: extraTimeForm.description || null,
      active: extraTimeForm.active,
      displayOrder: 0,
    };

    if (extraTimeDialog.editingId) {
      updateExtraTimeMutation.mutate({ id: extraTimeDialog.editingId, data });
    } else {
      createExtraTimeMutation.mutate(data);
    }
  };

  const handleDeleteExtraTime = (id: number) => {
    if (confirm("Are you sure you want to delete this extra time configuration?")) {
      deleteExtraTimeMutation.mutate(id);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="settings-title">Settings</h1>
        <p className="text-muted-foreground">Manage spa settings, business details, and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Business Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="spa-name">Spa Name</Label>
              <Input
                id="spa-name"
                value={businessInfo.name}
                onChange={(e) => setBusinessInfo({ ...businessInfo, name: e.target.value })}
                data-testid="input-spa-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spa-email">Contact Email</Label>
              <Input
                id="spa-email"
                type="email"
                value={businessInfo.email}
                onChange={(e) => setBusinessInfo({ ...businessInfo, email: e.target.value })}
                data-testid="input-spa-email"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="spa-phone">Contact Phone</Label>
              <Input
                id="spa-phone"
                type="tel"
                value={businessInfo.phone}
                onChange={(e) => setBusinessInfo({ ...businessInfo, phone: e.target.value })}
                data-testid="input-spa-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spa-address">Address</Label>
              <Input
                id="spa-address"
                value={businessInfo.address}
                onChange={(e) => setBusinessInfo({ ...businessInfo, address: e.target.value })}
                data-testid="input-spa-address"
              />
            </div>
          </div>
          <Button onClick={handleSaveBusinessInfo} data-testid="button-save-business-info">Save Changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>Financial Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={financialSettings.currency}
                onChange={(e) => setFinancialSettings({ ...financialSettings, currency: e.target.value })}
                data-testid="input-currency"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax-rate">Tax Rate (%)</Label>
              <Input
                id="tax-rate"
                type="number"
                value={financialSettings.taxRate}
                onChange={(e) => setFinancialSettings({ ...financialSettings, taxRate: e.target.value })}
                step="0.01"
                data-testid="input-tax-rate"
              />
            </div>
          </div>
          <Button onClick={handleSaveFinancialSettings} data-testid="button-save-financial-settings">Save Changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>UAE VAT Settings</CardTitle>
          </div>
          <CardDescription>
            Configure VAT collection for UAE Federal Tax Authority (FTA) compliance. 
            Enable VAT only after registering with FTA (AED 375,000 annual threshold).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              {vatConfig.vatEnabled ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>
                    VAT is enabled. All new invoices will include 5% VAT calculations and comply with FTA requirements.
                    {vatSettings?.vatRegistrationDate && (
                      <span className="block text-sm text-muted-foreground mt-1">
                        Activated on: {new Date(vatSettings.vatRegistrationDate).toLocaleDateString()}
                      </span>
                    )}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  VAT is disabled. Invoices will be issued as standard invoices without VAT. 
                  Enable VAT after obtaining your Tax Registration Number from UAE FTA.
                </span>
              )}
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="vat-enabled">Enable VAT Collection</Label>
                <p className="text-sm text-muted-foreground">
                  Activate VAT for invoices (required after AED 375k annual sales)
                </p>
              </div>
              <Switch
                id="vat-enabled"
                checked={vatConfig.vatEnabled}
                onCheckedChange={(checked) => setVatConfig({ ...vatConfig, vatEnabled: checked })}
                data-testid="switch-vat-enabled"
              />
            </div>

            {vatConfig.vatEnabled && (
              <div className="space-y-2">
                <Label htmlFor="trn">Tax Registration Number (TRN)</Label>
                <Input
                  id="trn"
                  value={vatConfig.taxRegistrationNumber}
                  onChange={(e) => setVatConfig({ ...vatConfig, taxRegistrationNumber: e.target.value })}
                  placeholder="Enter 15-digit TRN (e.g., 123456789012345)"
                  maxLength={15}
                  data-testid="input-trn"
                />
                <p className="text-sm text-muted-foreground">
                  Your 15-digit Tax Registration Number from UAE FTA
                </p>
              </div>
            )}
          </div>

          <Button 
            onClick={handleSaveVatSettings} 
            data-testid="button-save-vat-settings"
            disabled={updateVatMutation.isPending}
          >
            {updateVatMutation.isPending ? "Saving..." : "Save VAT Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>VAT Threshold Reminder</CardTitle>
          </div>
          <CardDescription>
            Get notified when your annual revenue (Jan 1 - Dec 31) approaches the UAE VAT registration threshold.
            This helps you prepare for VAT registration before exceeding AED 375,000 in sales.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {thresholdSettings && thresholdSettings.currentYearRevenue !== undefined && (
            <Alert>
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Current Year Revenue ({new Date().getFullYear()})</span>
                    <span className="text-sm font-bold">
                      AED {thresholdSettings.currentYearRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">VAT Threshold</span>
                    <span className="text-sm text-muted-foreground">
                      AED {parseFloat(thresholdSettings.vatThresholdAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {thresholdSettings.percentageOfThreshold !== undefined && (
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-muted-foreground">Progress to threshold</span>
                        <span className="text-xs font-medium">{thresholdSettings.percentageOfThreshold.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, thresholdSettings.percentageOfThreshold)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="threshold-reminder-enabled">Enable Reminder</Label>
                <p className="text-sm text-muted-foreground">
                  Receive notification when annual revenue reaches the threshold
                </p>
              </div>
              <Switch
                id="threshold-reminder-enabled"
                checked={vatThresholdReminder.enabled}
                onCheckedChange={(checked) => setVatThresholdReminder({ ...vatThresholdReminder, enabled: checked })}
                data-testid="switch-threshold-reminder-enabled"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="threshold-amount">Threshold Amount (AED)</Label>
              <Input
                id="threshold-amount"
                type="number"
                value={vatThresholdReminder.thresholdAmount}
                onChange={(e) => setVatThresholdReminder({ ...vatThresholdReminder, thresholdAmount: e.target.value })}
                placeholder="375000"
                step="1000"
                data-testid="input-threshold-amount"
              />
              <p className="text-sm text-muted-foreground">
                UAE FTA mandates VAT registration at AED 375,000 annual revenue (default)
              </p>
            </div>
          </div>

          <Button 
            onClick={handleSaveThresholdReminder} 
            data-testid="button-save-threshold-reminder"
            disabled={updateThresholdReminderMutation.isPending}
          >
            {updateThresholdReminderMutation.isPending ? "Saving..." : "Save Reminder Settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle>Branding</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="brand-color">Primary Brand Color</Label>
              <div className="flex gap-2">
                <Input
                  id="brand-color"
                  type="color"
                  value={branding.color}
                  onChange={(e) => setBranding({ ...branding, color: e.target.value })}
                  className="w-20 h-10"
                  data-testid="input-brand-color"
                />
                <Input
                  value={branding.color}
                  onChange={(e) => setBranding({ ...branding, color: e.target.value })}
                  className="flex-1"
                  data-testid="input-brand-color-hex"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo-url">Logo URL</Label>
              <Input
                id="logo-url"
                value={branding.logoUrl}
                onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
                data-testid="input-logo-url"
              />
            </div>
          </div>
          <Button onClick={handleSaveBranding} data-testid="button-save-branding">Save Changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business Hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
            const dayKey = day.toLowerCase();
            const hours = businessHours[dayKey] || { open: "09:00", close: "20:00", isOpen: true };
            const isOpen = hours.isOpen !== false; // Default to open if not specified
            
            return (
              <div key={day} className="flex items-center gap-4">
                <div className="w-24">
                  <Label>{day}</Label>
                </div>
                <div className="flex-1 flex gap-2">
                  <Input
                    type="time"
                    value={hours.open}
                    onChange={(e) => setBusinessHours({ ...businessHours, [dayKey]: { ...hours, open: e.target.value } })}
                    className="flex-1"
                    disabled={!isOpen}
                    data-testid={`input-${dayKey}-open`}
                  />
                  <span className="flex items-center px-2">to</span>
                  <Input
                    type="time"
                    value={hours.close}
                    onChange={(e) => setBusinessHours({ ...businessHours, [dayKey]: { ...hours, close: e.target.value } })}
                    className="flex-1"
                    disabled={!isOpen}
                    data-testid={`input-${dayKey}-close`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isOpen}
                    onCheckedChange={(checked) => setBusinessHours({ ...businessHours, [dayKey]: { ...hours, isOpen: checked } })}
                    data-testid={`switch-${dayKey}-open`}
                  />
                  <Label className="text-sm text-muted-foreground">
                    {isOpen ? 'Open' : 'Closed'}
                  </Label>
                </div>
              </div>
            );
          })}
          <Separator />
          <Button onClick={handleSaveBusinessHours} data-testid="button-save-business-hours">Save Business Hours</Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-2xl font-bold mb-4">Notification Providers</h2>
        <NotificationProviderConfig />
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">Notification Preferences</h2>
        <NotificationSettings />
      </div>

      {/* Service Extra Time Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Service Extra Time
              </CardTitle>
              <CardDescription>
                Configure additional time before/after services for setup, cleanup, and processing
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {services.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No services found. Add services first to configure extra time.
              </div>
            ) : (
              services.map((service) => {
                const serviceExtraTimes = extraTimes.filter(et => et.serviceId === service.id);
                return (
                  <div key={service.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{service.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Base duration: {service.duration} minutes
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenExtraTimeDialog(service.id, service.name)}
                        data-testid={`button-add-extra-time-${service.id}`}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Extra Time
                      </Button>
                    </div>

                    {serviceExtraTimes.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {serviceExtraTimes.map((extraTime) => (
                            <TableRow key={extraTime.id}>
                              <TableCell className="font-medium capitalize">
                                {extraTime.timeType}
                              </TableCell>
                              <TableCell>{extraTime.durationMinutes} min</TableCell>
                              <TableCell>{extraTime.description || "-"}</TableCell>
                              <TableCell>
                                {extraTime.active ? (
                                  <Badge variant="default">Active</Badge>
                                ) : (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenExtraTimeDialog(service.id, service.name, extraTime)}
                                    data-testid={`button-edit-extra-time-${extraTime.id}`}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteExtraTime(extraTime.id)}
                                    data-testid={`button-delete-extra-time-${extraTime.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Third-Party Integrations
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect your spa with free third-party services to enhance functionality
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google Calendar Integration */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold">Google Calendar</h3>
                <p className="text-sm text-muted-foreground">
                  2-way sync for appointments (1M requests/day - FREE)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getIntegrationStatus('google_calendar') ? (
                <>
                  <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const integration = getIntegrationStatus('google_calendar');
                      if (integration) disconnectMutation.mutate(integration.id);
                    }}
                    data-testid="button-disconnect-google-calendar"
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleConnectIntegration('google', 'google_calendar')}
                  data-testid="button-connect-google-calendar"
                >
                  Connect
                </Button>
              )}
            </div>
          </div>

          {/* Coming Soon - Other Integrations */}
          <div className="p-4 border rounded-lg bg-muted/50">
            <h3 className="font-semibold mb-2">Coming Soon</h3>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Badge variant="outline">FREE</Badge>
                <span>Google My Business - Review collection & SEO</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">FREE</Badge>
                <span>Google Analytics - Conversion tracking</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">FREE</Badge>
                <span>Google Meet - Video consultations</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">FREE</Badge>
                <span>HubSpot CRM - Contact management (free tier)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">FREE</Badge>
                <span>Mailchimp - Email campaigns (500 contacts)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">FREE</Badge>
                <span>Wave Accounting - Bookkeeping</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">FREE</Badge>
                <span>Buffer Social - Social media (3 accounts)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Extra Time Dialog */}
      <Dialog open={extraTimeDialog.open} onOpenChange={(open) => setExtraTimeDialog({ ...extraTimeDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {extraTimeDialog.editingId ? "Edit" : "Add"} Extra Time - {extraTimeDialog.serviceName}
            </DialogTitle>
            <DialogDescription>
              Configure additional time for setup, cleanup, or processing
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="timeType">Time Type</Label>
              <Select
                value={extraTimeForm.timeType}
                onValueChange={(value: "processing" | "blocked" | "servicing") =>
                  setExtraTimeForm({ ...extraTimeForm, timeType: value })
                }
              >
                <SelectTrigger data-testid="select-time-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="servicing">Servicing</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">
                {extraTimeForm.timeType === "processing" && "Time needed before service (setup, preparation)"}
                {extraTimeForm.timeType === "blocked" && "Time blocked after service (cleanup, room reset)"}
                {extraTimeForm.timeType === "servicing" && "Additional service time not included in base duration"}
              </p>
            </div>

            <div>
              <Label htmlFor="durationMinutes">Duration (minutes)</Label>
              <Input
                id="durationMinutes"
                type="number"
                min="0"
                value={extraTimeForm.durationMinutes}
                onChange={(e) => setExtraTimeForm({ ...extraTimeForm, durationMinutes: e.target.value })}
                data-testid="input-duration-minutes"
              />
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="e.g., Room setup, Equipment cleanup"
                value={extraTimeForm.description}
                onChange={(e) => setExtraTimeForm({ ...extraTimeForm, description: e.target.value })}
                data-testid="input-description"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={extraTimeForm.active}
                onCheckedChange={(checked) => setExtraTimeForm({ ...extraTimeForm, active: checked })}
                data-testid="switch-active"
              />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExtraTimeDialog({ open: false, serviceId: null, serviceName: "" })}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveExtraTime}
              disabled={createExtraTimeMutation.isPending || updateExtraTimeMutation.isPending}
              data-testid="button-save"
            >
              {createExtraTimeMutation.isPending || updateExtraTimeMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
