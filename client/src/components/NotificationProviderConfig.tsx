import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle2, XCircle, Loader2, MessageSquare, Mail, Phone } from "lucide-react";

type NotificationChannel = "sms" | "whatsapp" | "email";
type Provider = "twilio" | "msg91";

interface ProviderConfig {
  id?: number;
  provider: Provider;
  channel: NotificationChannel;
  credentials: Record<string, string>;
  isActive: boolean;
  balance?: string;
  lastValidated?: string;
}

export default function NotificationProviderConfig() {
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState<Provider>("twilio");
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannel>("sms");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  // Fetch existing providers
  const { data: providers = [], isLoading } = useQuery<ProviderConfig[]>({
    queryKey: ["/api/admin/notification-providers"],
  });

  // Get credential fields based on provider and channel
  const getCredentialFields = (provider: Provider, channel: NotificationChannel): { field: string; label: string; type: string }[] => {
    const fields: { field: string; label: string; type: string }[] = [];
    
    if (provider === "twilio") {
      fields.push(
        { field: "accountSid", label: "Account SID", type: "text" },
        { field: "authToken", label: "Auth Token", type: "password" }
      );
    } else if (provider === "msg91") {
      fields.push({ field: "authKey", label: "Auth Key", type: "password" });
    }
    
    // Add channel-specific fields
    if (channel === "sms" || channel === "whatsapp") {
      fields.push({ field: "fromPhone", label: "From Phone Number", type: "text" });
    } else if (channel === "email") {
      fields.push({ field: "fromEmail", label: "From Email Address", type: "email" });
    }
    
    return fields;
  };

  // Validate provider credentials
  const validateMutation = useMutation({
    mutationFn: async (data: { provider: Provider; channel: NotificationChannel; credentials: Record<string, string> }) => {
      return await apiRequest("POST", "/api/admin/notification-providers/validate", data);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Validation successful",
        description: `Balance: ${data.balance || "N/A"}`,
      });
    },
    onError: () => {
      toast({
        title: "Validation failed",
        description: "Please check your credentials and try again.",
        variant: "destructive",
      });
    },
  });

  // Save provider configuration
  const saveMutation = useMutation({
    mutationFn: async (data: { spaId: number; provider: Provider; channel: NotificationChannel; credentials: Record<string, string>; fromEmail?: string; fromPhone?: string }) => {
      return await apiRequest("POST", "/api/admin/notification-providers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-providers"] });
      toast({
        title: "Provider configured",
        description: "Your notification provider has been saved successfully.",
      });
      setCredentials({});
    },
    onError: () => {
      toast({
        title: "Configuration failed",
        description: "Failed to save provider configuration.",
        variant: "destructive",
      });
    },
  });

  // Delete provider
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/notification-providers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-providers"] });
      toast({
        title: "Provider removed",
        description: "The notification provider has been removed.",
      });
    },
  });

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      await validateMutation.mutateAsync({ 
        provider: selectedProvider, 
        channel: selectedChannel,
        credentials 
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = () => {
    if (Object.keys(credentials).length === 0) {
      toast({
        title: "Missing credentials",
        description: "Please fill in all credential fields.",
        variant: "destructive",
      });
      return;
    }
    
    // Extract fromEmail or fromPhone from credentials
    const { fromEmail, fromPhone, ...providerCredentials } = credentials;
    
    saveMutation.mutate({ 
      spaId: 1, // TODO: Get from auth context
      provider: selectedProvider, 
      channel: selectedChannel, 
      credentials: providerCredentials,
      fromEmail: fromEmail || undefined,
      fromPhone: fromPhone || undefined,
    });
  };

  const getChannelIcon = (channel: NotificationChannel) => {
    switch (channel) {
      case "sms": return <MessageSquare className="h-4 w-4" />;
      case "whatsapp": return <MessageSquare className="h-4 w-4" />;
      case "email": return <Mail className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Providers */}
      {providers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Notification Providers</CardTitle>
            <CardDescription>Your configured messaging providers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`provider-${provider.id}`}>
                <div className="flex items-center gap-3">
                  {getChannelIcon(provider.channel)}
                  <div>
                    <p className="font-medium capitalize">{provider.provider} - {provider.channel}</p>
                    {provider.balance && (
                      <p className="text-sm text-muted-foreground">Balance: {provider.balance}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {provider.isActive ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Inactive
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => provider.id && deleteMutation.mutate(provider.id)}
                    data-testid={`button-delete-provider-${provider.id}`}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Provider Comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className={selectedProvider === "twilio" ? "border-primary" : ""}>
          <CardHeader>
            <CardTitle>Twilio</CardTitle>
            <CardDescription>Global leader in communication APIs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Global coverage</li>
              <li>• SMS, WhatsApp, Voice</li>
              <li>• Pay-as-you-go pricing</li>
              <li>• Excellent delivery rates</li>
            </ul>
            <Button
              variant={selectedProvider === "twilio" ? "default" : "outline"}
              className="w-full"
              onClick={() => setSelectedProvider("twilio")}
              data-testid="button-select-twilio"
            >
              {selectedProvider === "twilio" ? "Selected" : "Select Twilio"}
            </Button>
          </CardContent>
        </Card>

        <Card className={selectedProvider === "msg91" ? "border-primary" : ""}>
          <CardHeader>
            <CardTitle>MSG91</CardTitle>
            <CardDescription>Cost-effective solution for high volume</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Lower costs</li>
              <li>• SMS, WhatsApp, Email</li>
              <li>• Good for UAE/India</li>
              <li>• Bulk messaging friendly</li>
            </ul>
            <Button
              variant={selectedProvider === "msg91" ? "default" : "outline"}
              className="w-full"
              onClick={() => setSelectedProvider("msg91")}
              data-testid="button-select-msg91"
            >
              {selectedProvider === "msg91" ? "Selected" : "Select MSG91"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle>Configure {selectedProvider === "twilio" ? "Twilio" : "MSG91"}</CardTitle>
          <CardDescription>Enter your API credentials to enable notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Channel Selection */}
          <div className="space-y-2">
            <Label>Notification Channel</Label>
            <Select value={selectedChannel} onValueChange={(value) => setSelectedChannel(value as NotificationChannel)}>
              <SelectTrigger data-testid="select-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                {selectedProvider === "msg91" && <SelectItem value="email">Email</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Credential Fields */}
          {getCredentialFields(selectedProvider, selectedChannel).map(({ field, label, type }) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={field}>{label}</Label>
              <Input
                id={field}
                type={type}
                value={credentials[field] || ""}
                onChange={(e) => setCredentials({ ...credentials, [field]: e.target.value })}
                placeholder={`Enter your ${label.toLowerCase()}`}
                data-testid={`input-${field}`}
              />
            </div>
          ))}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={isValidating || Object.keys(credentials).length === 0}
              data-testid="button-validate"
            >
              {isValidating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                "Test Connection"
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || Object.keys(credentials).length === 0}
              data-testid="button-save-provider"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
