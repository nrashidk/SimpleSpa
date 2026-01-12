import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  MessageSquare, 
  Mail, 
  Copy, 
  Check,
  Sparkles,
  AlertCircle,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Info
} from "lucide-react";

type NotificationChannel = "sms" | "whatsapp" | "email";
type Provider = "twilio" | "msg91";

interface ProviderConfig {
  id?: number;
  provider: Provider;
  channel: NotificationChannel;
  credentials: Record<string, string>;
  isActive: boolean;
  fromPhone?: string;
  fromEmail?: string;
  balance?: string;
  lastValidated?: string;
}

interface TwilioAccountInfo {
  accountSid: string;
  accountName: string;
  status: string;
  balance: string;
  currency: string;
}

interface TwilioPhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  smsUrl?: string;
}

interface PreflightCheck {
  passed: boolean;
  message: string;
  balance?: string;
}

interface PreflightChecks {
  credentialsFormat: PreflightCheck;
  accountActive: PreflightCheck;
  sufficientBalance: PreflightCheck;
  phoneNumberFormat: PreflightCheck;
  whatsAppEnabled: PreflightCheck;
}

interface ValidationResult {
  valid: boolean;
  accountInfo?: TwilioAccountInfo;
  whatsappNumbers?: TwilioPhoneNumber[];
  preflightChecks?: {
    valid: boolean;
    checks: PreflightChecks;
    overallMessage: string;
  };
  error?: string;
  solution?: string;
}

interface HealthCheck {
  configured: boolean;
  webhookUrl?: string;
  url?: string;
  lastMessageAt?: string;
  messageCount24h: number;
  status: 'healthy' | 'warning' | 'error' | 'not_configured';
  statusMessage: string;
}

interface DiagnosticEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
}

interface DiagnosticsResult {
  diagnostics: DiagnosticEntry[];
  sandboxInstructions: {
    title: string;
    steps: string[];
    link: string;
  };
}

export default function NotificationProviderConfig() {
  const { toast } = useToast();
  const [selectedProvider, setSelectedProvider] = useState<Provider>("twilio");
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannel>("whatsapp");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [selectedPhoneNumberSid, setSelectedPhoneNumberSid] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [currentStep, setCurrentStep] = useState(1);

  const { data: providers = [], isLoading } = useQuery<ProviderConfig[]>({
    queryKey: ["/api/admin/notification-providers"],
  });

  const { data: healthCheck, refetch: refetchHealth } = useQuery<HealthCheck>({
    queryKey: ["/api/admin/notification-providers/health-check"],
    refetchInterval: 60000,
  });

  const { data: diagnosticsData } = useQuery<DiagnosticsResult>({
    queryKey: ["/api/admin/notification-providers/diagnostics"],
  });

  const hasWhatsAppProvider = providers.some(p => p.channel === 'whatsapp');
  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp/inbound` : '';

  useEffect(() => {
    if (hasWhatsAppProvider) {
      setCurrentStep(2);
    }
  }, [hasWhatsAppProvider]);

  const validateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/notification-providers/validate", data);
      return response as unknown as ValidationResult;
    },
    onSuccess: (data: ValidationResult) => {
      setValidationResult(data);
      if (data.valid) {
        toast({
          title: "Validation successful",
          description: data.accountInfo 
            ? `Account: ${data.accountInfo.accountName} | Balance: $${data.accountInfo.balance}`
            : "Credentials validated",
        });
      }
    },
    onError: (error: any) => {
      setValidationResult(null);
      toast({
        title: "Validation failed",
        description: error.solution || error.message || "Please check your credentials and try again.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/notification-providers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-providers/health-check"] });
      toast({
        title: "Provider configured",
        description: "Your WhatsApp notification provider has been saved successfully.",
      });
      setCredentials({});
      setValidationResult(null);
      setCurrentStep(2);
    },
    onError: () => {
      toast({
        title: "Configuration failed",
        description: "Failed to save provider configuration.",
        variant: "destructive",
      });
    },
  });

  const configureWebhookMutation = useMutation({
    mutationFn: async (phoneNumberSid: string) => {
      return await apiRequest("POST", "/api/admin/notification-providers/configure-webhook", {
        phoneNumberSid
      });
    },
    onSuccess: () => {
      toast({
        title: "Webhook configured",
        description: "Your Twilio webhook has been configured automatically!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-providers/health-check"] });
    },
    onError: (error: any) => {
      toast({
        title: "Auto-config failed",
        description: error.solution || error.message || "Please configure webhook manually in Twilio console.",
        variant: "destructive",
      });
    },
  });

  const testWhatsAppMutation = useMutation({
    mutationFn: async (testPhone: string) => {
      return await apiRequest("POST", "/api/admin/notification-providers/test-whatsapp", {
        testPhoneNumber: testPhone
      });
    },
    onSuccess: () => {
      toast({
        title: "Test message sent!",
        description: "Check your WhatsApp for the test message.",
      });
      setCurrentStep(4);
    },
    onError: (error: any) => {
      toast({
        title: "Test failed",
        description: error.solution || error.message || "Failed to send test message.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/notification-providers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notification-providers/health-check"] });
      toast({
        title: "Provider removed",
        description: "The notification provider has been removed.",
      });
      setCurrentStep(1);
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
    
    const { fromEmail, fromPhone, ...providerCredentials } = credentials;

    saveMutation.mutate({
      provider: selectedProvider,
      channel: selectedChannel,
      credentials: providerCredentials,
      fromEmail: fromEmail || undefined,
      fromPhone: fromPhone || undefined,
    });
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Webhook URL copied to clipboard",
    });
  };

  const handleTestWhatsApp = () => {
    if (!testPhoneNumber) {
      toast({
        title: "Phone number required",
        description: "Please enter your phone number to receive test message.",
        variant: "destructive",
      });
      return;
    }
    testWhatsAppMutation.mutate(testPhoneNumber);
  };

  const getStatusIcon = () => {
    if (!healthCheck) return <WifiOff className="h-5 w-5 text-muted-foreground" />;
    switch (healthCheck.status) {
      case 'healthy': return <Wifi className="h-5 w-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <WifiOff className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStepStatus = (step: number) => {
    if (step < currentStep) return 'completed';
    if (step === currentStep) return 'current';
    return 'pending';
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
      {/* Connection Status */}
      {hasWhatsAppProvider && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon()}
                <div>
                  <CardTitle className="text-lg">WhatsApp Connection Status</CardTitle>
                  <CardDescription>
                    {healthCheck?.statusMessage || 'Checking status...'}
                  </CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchHealth()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-muted rounded-lg">
                <Activity className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{healthCheck?.messageCount24h || 0}</p>
                <p className="text-xs text-muted-foreground">Messages (24h)</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <Clock className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {healthCheck?.lastMessageAt 
                    ? new Date(healthCheck.lastMessageAt).toLocaleString()
                    : 'No messages yet'}
                </p>
                <p className="text-xs text-muted-foreground">Last Message</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <Badge variant={healthCheck?.status === 'healthy' ? 'default' : 'secondary'}>
                  {healthCheck?.status || 'Unknown'}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">Status</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup Completion Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Setup Checklist</CardTitle>
          <CardDescription>Complete these steps to enable WhatsApp booking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { step: 1, label: 'Enter Twilio Credentials', description: 'Account SID, Auth Token, and WhatsApp number' },
              { step: 2, label: 'Configure Webhook', description: 'Set up webhook URL for incoming messages' },
              { step: 3, label: 'Send Test Message', description: 'Verify your configuration is working' },
              { step: 4, label: 'Ready to Go!', description: 'WhatsApp booking is now active' },
            ].map(({ step, label, description }) => (
              <div 
                key={step} 
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  getStepStatus(step) === 'completed' ? 'bg-green-50 border-green-200' :
                  getStepStatus(step) === 'current' ? 'bg-blue-50 border-blue-200' :
                  'bg-muted/50'
                }`}
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  getStepStatus(step) === 'completed' ? 'bg-green-500 text-white' :
                  getStepStatus(step) === 'current' ? 'bg-blue-500 text-white' :
                  'bg-muted-foreground/20 text-muted-foreground'
                }`}>
                  {getStepStatus(step) === 'completed' ? <Check className="h-4 w-4" /> : step}
                </div>
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Providers */}
      {providers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Notification Providers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-4 w-4" />
                  <div>
                    <p className="font-medium capitalize">{provider.provider} - {provider.channel}</p>
                    <p className="text-xs text-muted-foreground">
                      {provider.fromPhone || 'No phone configured'}
                    </p>
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
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-sm">1</span>
            Enter Twilio Credentials
          </CardTitle>
          <CardDescription>Get these from your Twilio Console</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div>
              <Label>Account SID</Label>
              <Input
                type="text"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={credentials.accountSid || ''}
                onChange={(e) => setCredentials({...credentials, accountSid: e.target.value})}
              />
            </div>
            
            <div>
              <Label>Auth Token</Label>
              <Input
                type="password"
                placeholder="Your Twilio auth token"
                value={credentials.authToken || ''}
                onChange={(e) => setCredentials({...credentials, authToken: e.target.value})}
              />
            </div>

            <div>
              <Label>WhatsApp Number</Label>
              <Input
                type="text"
                placeholder="+14155238886"
                value={credentials.fromPhone || ''}
                onChange={(e) => setCredentials({...credentials, fromPhone: e.target.value})}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Your Twilio WhatsApp-enabled number (sandbox or approved)
              </p>
            </div>

            <Button 
              onClick={handleValidate} 
              disabled={isValidating || !credentials.accountSid || !credentials.authToken}
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                'Validate Credentials'
              )}
            </Button>
          </div>

          {/* Validation Result */}
          {validationResult?.valid && (
            <div className="space-y-4 pt-4 border-t">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Credentials Validated</AlertTitle>
                <AlertDescription>
                  <div className="space-y-1 mt-2">
                    <p><strong>Account:</strong> {validationResult.accountInfo?.accountName}</p>
                    <p><strong>Balance:</strong> ${validationResult.accountInfo?.balance}</p>
                    <p><strong>Status:</strong> {validationResult.accountInfo?.status}</p>
                  </div>
                </AlertDescription>
              </Alert>

              {validationResult.whatsappNumbers && validationResult.whatsappNumbers.length > 0 && (
                <div>
                  <Label>Detected Phone Numbers</Label>
                  <Select value={selectedPhoneNumberSid} onValueChange={setSelectedPhoneNumberSid}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a number to configure" />
                    </SelectTrigger>
                    <SelectContent>
                      {validationResult.whatsappNumbers.map((num) => (
                        <SelectItem key={num.sid} value={num.sid}>
                          {num.phoneNumber} - {num.friendlyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Preflight Checks */}
              {validationResult.preflightChecks && (
                <div className="space-y-2">
                  <Label>Pre-flight Checks</Label>
                  {Object.entries(validationResult.preflightChecks.checks).map(([key, check]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      {check.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span>{check.message}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Webhook Configuration */}
      {hasWhatsAppProvider && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-sm">2</span>
              Configure Webhook
            </CardTitle>
            <CardDescription>Set up webhook URL for incoming messages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <Input 
                  readOnly 
                  value={webhookUrl}
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={copyWebhookUrl}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {selectedPhoneNumberSid && (
              <Button 
                onClick={() => configureWebhookMutation.mutate(selectedPhoneNumberSid)}
                disabled={configureWebhookMutation.isPending}
                className="w-full"
              >
                {configureWebhookMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Configuring...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Auto-Configure Webhook
                  </>
                )}
              </Button>
            )}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Manual Setup:</strong> If auto-configure fails, set this URL in your{' '}
                <a 
                  href="https://console.twilio.com/us1/develop/sms/settings/whatsapp-sandbox" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-1"
                >
                  Twilio Console <ExternalLink className="h-3 w-3" />
                </a>
                {' '}under "When a message comes in"
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Test Configuration */}
      {hasWhatsAppProvider && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500 text-white text-sm">3</span>
              Test WhatsApp
            </CardTitle>
            <CardDescription>Send a test message to verify configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Your Phone Number (for test)</Label>
              <Input
                type="tel"
                placeholder="+1234567890"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Make sure you've joined the Twilio WhatsApp sandbox first (see instructions below)
              </p>
            </div>

            <Button 
              onClick={handleTestWhatsApp}
              disabled={testWhatsAppMutation.isPending || !testPhoneNumber}
              variant="outline"
              className="w-full"
            >
              {testWhatsAppMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Test...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Send Test Message
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sandbox Instructions */}
      {diagnosticsData?.sandboxInstructions && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              {diagnosticsData.sandboxInstructions.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              {diagnosticsData.sandboxInstructions.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
            <a 
              href={diagnosticsData.sandboxInstructions.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline mt-3"
            >
              Open Twilio Sandbox Setup <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      )}

      {/* Diagnostics */}
      {diagnosticsData?.diagnostics && diagnosticsData.diagnostics.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="diagnostics">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Diagnostic Logs
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 p-2">
                {diagnosticsData.diagnostics.map((entry, index) => (
                  <div 
                    key={index} 
                    className={`p-2 rounded text-sm ${
                      entry.level === 'error' ? 'bg-red-50 text-red-700' :
                      entry.level === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                      'bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {entry.level === 'error' && <XCircle className="h-4 w-4" />}
                      {entry.level === 'warning' && <AlertTriangle className="h-4 w-4" />}
                      {entry.level === 'info' && <Info className="h-4 w-4" />}
                      <span>{entry.message}</span>
                    </div>
                    {entry.details && (
                      <p className="text-xs mt-1 opacity-70">
                        {JSON.stringify(entry.details)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
