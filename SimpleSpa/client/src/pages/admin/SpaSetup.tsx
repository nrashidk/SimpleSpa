import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Circle, ArrowRight, ArrowLeft, Building2, MapPin, Clock, CreditCard, Check, Sparkles, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type SetupStep = {
  id: string;
  title: string;
  icon: any;
  description: string;
  optional?: boolean;
};

const steps: SetupStep[] = [
  { id: "basicInfo", title: "Basic Information", icon: Building2, description: "Spa name and contact details" },
  { id: "location", title: "Location", icon: MapPin, description: "Address and geographic details" },
  { id: "hours", title: "Business Hours", icon: Clock, description: "Operating hours and schedule" },
  { id: "services", title: "Services", icon: Sparkles, description: "Add at least one service" },
  { id: "staff", title: "Staff", icon: Users, description: "Add at least one staff member" },
  { id: "activation", title: "Activation", icon: CreditCard, description: "Ready to go live!" },
];

const UAE_EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah"
];

type SetupStatus = {
  spaId: number | null;
  setupComplete: boolean;
  userEmail?: string; // User's registration email
  steps: {
    basicInfo: boolean;
    location: boolean;
    hours: boolean;
    services: boolean;
    staff: boolean;
    activation: boolean;
  };
  spa?: any;
};

export default function SpaSetup() {
  const { toast } = useToast();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<any>({});

  const { data: setupStatus, isLoading } = useQuery<SetupStatus>({
    queryKey: ["/api/admin/setup/status"],
  });

  useEffect(() => {
    if (setupStatus?.spa) {
      setFormData(setupStatus.spa);
    } else if (setupStatus?.userEmail) {
      // Pre-populate contact email with user's email from registration
      setFormData((prev: any) => ({
        ...prev,
        contactEmail: setupStatus.userEmail
      }));
    }
  }, [setupStatus]);

  const saveStepMutation = useMutation({
    mutationFn: async ({ stepName, data }: { stepName: string; data: any }) => {
      return apiRequest("POST", `/api/admin/setup/step/${stepName}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Progress Saved",
        description: "Your changes have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/setup/status"] });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save progress",
        variant: "destructive",
      });
    },
  });

  const completeSetupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/setup/complete");
    },
    onSuccess: () => {
      toast({
        title: "Setup Complete!",
        description: "Your spa is now live and visible to customers.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/setup/status"] });
    },
    onError: (error: any) => {
      toast({
        title: "Completion Failed",
        description: error.message || "Failed to complete setup",
        variant: "destructive",
      });
    },
  });

  const handleNext = async () => {
    const currentStep = steps[currentStepIndex];
    
    // Save current step data
    const stepData = getStepData(currentStep.id);
    if (Object.keys(stepData).length > 0) {
      await saveStepMutation.mutateAsync({ stepName: currentStep.id, data: stepData });
    }

    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleComplete = () => {
    completeSetupMutation.mutate();
  };

  const getStepData = (stepId: string) => {
    switch (stepId) {
      case "basicInfo":
        return {
          name: formData.name,
          description: formData.description,
          contactEmail: formData.contactEmail,
          contactPhone: formData.contactPhone,
          currency: formData.currency || "AED",
        };
      case "location":
        return {
          address: formData.address,
          city: formData.city,
          area: formData.area,
          latitude: formData.latitude,
          longitude: formData.longitude,
        };
      case "hours":
        return {
          businessHours: formData.businessHours || {},
        };
      case "services":
        return {
          serviceName: formData.serviceName,
          serviceDuration: formData.serviceDuration,
          servicePrice: formData.servicePrice,
          serviceDescription: formData.serviceDescription,
        };
      case "staff":
        return {
          staffFirstName: formData.staffFirstName,
          staffLastName: formData.staffLastName,
          staffEmail: formData.staffEmail,
          staffPhone: formData.staffPhone,
        };
      case "activation":
        return {
          active: true,
          setupComplete: true,
        };
      default:
        return {};
    }
  };

  const isStepComplete = (stepId: string) => {
    return setupStatus?.steps?.[stepId as keyof typeof setupStatus.steps] === true;
  };

  const currentStep = steps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading setup wizard...</p>
        </div>
      </div>
    );
  }

  if (setupStatus?.setupComplete) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="bg-green-100 dark:bg-green-900 p-3 rounded-full">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle>Setup Complete!</CardTitle>
                <CardDescription>Your spa is now live and accepting bookings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Congratulations! Your spa setup is complete and your business is now visible to customers.
            </p>
            <Button onClick={() => window.location.href = "/admin"} data-testid="button-go-to-dashboard">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-spa-setup">Spa Setup Wizard</h1>
        <p className="text-muted-foreground">Complete these steps to set up your spa</p>
        <div className="mt-4">
          <Progress value={progress} className="h-2" data-testid="progress-setup" />
          <p className="text-sm text-muted-foreground mt-2">
            Step {currentStepIndex + 1} of {steps.length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Steps Sidebar */}
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                index === currentStepIndex
                  ? "bg-primary/10 border-2 border-primary"
                  : isStepComplete(step.id)
                  ? "bg-green-50 dark:bg-green-950/20"
                  : "bg-card hover:bg-accent"
              }`}
              onClick={() => setCurrentStepIndex(index)}
              data-testid={`step-indicator-${step.id}`}
            >
              {isStepComplete(step.id) ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              ) : (
                <Circle className={`h-5 w-5 flex-shrink-0 ${index === currentStepIndex ? "text-primary" : "text-muted-foreground"}`} />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${index === currentStepIndex ? "text-primary" : ""}`}>
                  {step.title}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="md:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <currentStep.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>{currentStep.title}</CardTitle>
                  <CardDescription>{currentStep.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Info Step */}
              {currentStep.id === "basicInfo" && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Spa Name *</Label>
                    <Input
                      id="name"
                      value={formData.name || ""}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Enter your spa name"
                      data-testid="input-spa-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description || ""}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of your spa"
                      rows={4}
                      data-testid="textarea-spa-description"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="contactEmail">Contact Email</Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={formData.contactEmail || ""}
                        readOnly
                        disabled
                        className="bg-muted cursor-not-allowed"
                        placeholder="contact@spa.com"
                        data-testid="input-contact-email"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        This is your registration email and cannot be changed
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="contactPhone">Contact Phone</Label>
                      <Input
                        id="contactPhone"
                        value={formData.contactPhone || ""}
                        onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                        placeholder="+971 50 123 4567"
                        data-testid="input-contact-phone"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Location Step */}
              {currentStep.id === "location" && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="address">Street Address</Label>
                    <Input
                      id="address"
                      value={formData.address || ""}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="123 Main Street"
                      data-testid="input-address"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="city">Emirate</Label>
                      <Select
                        value={formData.city || ""}
                        onValueChange={(value) => setFormData({ ...formData, city: value })}
                      >
                        <SelectTrigger data-testid="select-city">
                          <SelectValue placeholder="Select an emirate" />
                        </SelectTrigger>
                        <SelectContent>
                          {UAE_EMIRATES.map((emirate) => (
                            <SelectItem key={emirate} value={emirate}>
                              {emirate}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="area">Area/Neighborhood</Label>
                      <Input
                        id="area"
                        value={formData.area || ""}
                        onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                        placeholder="Downtown"
                        data-testid="input-area"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="latitude">Latitude (optional)</Label>
                      <Input
                        id="latitude"
                        type="number"
                        step="0.000001"
                        value={formData.latitude || ""}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        placeholder="25.276987"
                        data-testid="input-latitude"
                      />
                    </div>
                    <div>
                      <Label htmlFor="longitude">Longitude (optional)</Label>
                      <Input
                        id="longitude"
                        type="number"
                        step="0.000001"
                        value={formData.longitude || ""}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        placeholder="55.296249"
                        data-testid="input-longitude"
                      />
                    </div>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 inline mr-1" />
                      Tip: You can use Google Maps to find your exact coordinates. Search for your location, right-click on the map, and copy the coordinates.
                    </p>
                  </div>
                </div>
              )}

              {/* Business Hours Step */}
              {currentStep.id === "hours" && (
                <div className="space-y-4">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                    const dayKey = day.toLowerCase();
                    const hours = formData.businessHours?.[dayKey] || { open: "09:00", close: "20:00", isOpen: true };
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
                            onChange={(e) => setFormData({ 
                              ...formData, 
                              businessHours: { 
                                ...(formData.businessHours || {}), 
                                [dayKey]: { ...hours, open: e.target.value } 
                              } 
                            })}
                            className="flex-1"
                            disabled={!isOpen}
                            data-testid={`input-${dayKey}-open`}
                          />
                          <span className="flex items-center px-2">to</span>
                          <Input
                            type="time"
                            value={hours.close}
                            onChange={(e) => setFormData({ 
                              ...formData, 
                              businessHours: { 
                                ...(formData.businessHours || {}), 
                                [dayKey]: { ...hours, close: e.target.value } 
                              } 
                            })}
                            className="flex-1"
                            disabled={!isOpen}
                            data-testid={`input-${dayKey}-close`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isOpen}
                            onCheckedChange={(checked) => setFormData({ 
                              ...formData, 
                              businessHours: { 
                                ...(formData.businessHours || {}), 
                                [dayKey]: { ...hours, isOpen: checked } 
                              } 
                            })}
                            data-testid={`switch-${dayKey}-open`}
                          />
                          <Label className="text-sm text-muted-foreground">
                            {isOpen ? 'Open' : 'Closed'}
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                  <div className="bg-muted/50 p-4 rounded-lg mt-4">
                    <p className="text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 inline mr-1" />
                      Set your operating hours for each day. Use the toggle to mark days as closed.
                    </p>
                  </div>
                </div>
              )}

              {/* Services Step */}
              {currentStep.id === "services" && (
                <div className="space-y-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900 dark:text-blue-100">Add Your First Service</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          Add at least one service to enable bookings. You can add more services later from the admin dashboard.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="service-name">Service Name *</Label>
                      <Input
                        id="service-name"
                        value={formData.serviceName || ""}
                        onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
                        placeholder="e.g., Full Body Massage"
                        data-testid="input-service-name"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="service-duration">Duration (minutes) *</Label>
                        <Input
                          id="service-duration"
                          type="number"
                          min="1"
                          value={formData.serviceDuration || ""}
                          onChange={(e) => setFormData({ ...formData, serviceDuration: e.target.value })}
                          placeholder="60"
                          data-testid="input-service-duration"
                        />
                      </div>
                      <div>
                        <Label htmlFor="service-price">Price (AED) *</Label>
                        <Input
                          id="service-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.servicePrice || ""}
                          onChange={(e) => setFormData({ ...formData, servicePrice: e.target.value })}
                          placeholder="200.00"
                          data-testid="input-service-price"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="service-description">Description (optional)</Label>
                      <Textarea
                        id="service-description"
                        value={formData.serviceDescription || ""}
                        onChange={(e) => setFormData({ ...formData, serviceDescription: e.target.value })}
                        placeholder="Brief description of the service..."
                        rows={3}
                        data-testid="input-service-description"
                      />
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground text-center">
                    More services can be added from the Services section in your admin dashboard.
                  </p>
                </div>
              )}

              {/* Staff Step */}
              {currentStep.id === "staff" && (
                <div className="space-y-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Users className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900 dark:text-blue-100">Add Your First Staff Member</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          Add at least one staff member to handle bookings. You can add more team members later from the admin dashboard.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="staff-first-name">First Name *</Label>
                        <Input
                          id="staff-first-name"
                          value={formData.staffFirstName || ""}
                          onChange={(e) => setFormData({ ...formData, staffFirstName: e.target.value })}
                          placeholder="John"
                          data-testid="input-staff-first-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="staff-last-name">Last Name (optional)</Label>
                        <Input
                          id="staff-last-name"
                          value={formData.staffLastName || ""}
                          onChange={(e) => setFormData({ ...formData, staffLastName: e.target.value })}
                          placeholder="Smith"
                          data-testid="input-staff-last-name"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="staff-email">Email *</Label>
                        <Input
                          id="staff-email"
                          type="email"
                          value={formData.staffEmail || ""}
                          onChange={(e) => setFormData({ ...formData, staffEmail: e.target.value })}
                          placeholder="john.smith@example.com"
                          data-testid="input-staff-email"
                        />
                      </div>
                      <div>
                        <Label htmlFor="staff-phone">Phone (optional)</Label>
                        <Input
                          id="staff-phone"
                          type="tel"
                          value={formData.staffPhone || ""}
                          onChange={(e) => setFormData({ ...formData, staffPhone: e.target.value })}
                          placeholder="+971 50 123 4567"
                          data-testid="input-staff-phone"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground text-center">
                    More staff members can be added from the Staff section in your admin dashboard.
                  </p>
                </div>
              )}

              {/* Activation Step */}
              {currentStep.id === "activation" && (
                <div className="text-center py-8 space-y-6">
                  <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                    <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold mb-2">You're All Set!</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Your spa is ready to go live. Click "Complete Setup" below to activate your spa and start accepting bookings.
                    </p>
                  </div>
                  <div className="bg-muted/50 p-6 rounded-lg max-w-md mx-auto space-y-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                      <div className="text-left">
                        <p className="font-medium">Basic information configured</p>
                        <p className="text-sm text-muted-foreground">Spa name and contact details</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                      <div className="text-left">
                        <p className="font-medium">Location details added</p>
                        <p className="text-sm text-muted-foreground">Address and area information</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                      <div className="text-left">
                        <p className="font-medium">Business hours set</p>
                        <p className="text-sm text-muted-foreground">Operating schedule configured</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                      <div className="text-left">
                        <p className="font-medium">Service added</p>
                        <p className="text-sm text-muted-foreground">Ready to accept bookings</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                      <div className="text-left">
                        <p className="font-medium">Staff member added</p>
                        <p className="text-sm text-muted-foreground">Team ready to serve</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Everything is configured! You can add more services and staff from the admin dashboard.
                  </p>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={currentStepIndex === 0}
                  data-testid="button-previous"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                
                {currentStepIndex < steps.length - 1 ? (
                  <Button
                    onClick={handleNext}
                    disabled={saveStepMutation.isPending}
                    data-testid="button-next"
                  >
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleComplete}
                    disabled={completeSetupMutation.isPending}
                    data-testid="button-complete-setup"
                  >
                    Complete Setup
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
