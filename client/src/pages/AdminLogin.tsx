import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Upload, FileText, CheckCircle2, Loader2, Clock, CheckCircle, XCircle } from "lucide-react";

type AuthStatus = {
  isAuthenticated: boolean;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
  };
};

type AdminApplication = {
  id: number;
  businessName: string;
  status: string;
  appliedAt: Date;
  licenseUrl: string | null;
};

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Application form
  const [spaName, setSpaName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  
  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginEmail || !loginPassword) {
      toast({ 
        title: "Missing fields", 
        description: "Please enter both email and password",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoggingIn(true);
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          email: loginEmail,
          password: loginPassword
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Login failed");
      }

      // Check setup status to redirect appropriately
      const setupStatusResponse = await fetch("/api/admin/setup/status", {
        credentials: "include"
      });
      
      if (setupStatusResponse.ok) {
        const setupStatus = await setupStatusResponse.json();
        if (!setupStatus.setupComplete) {
          toast({ title: "Login successful! Complete setup to continue." });
          setLocation('/admin/setup');
          return;
        }
      }

      toast({ title: "Login successful!" });
      setLocation('/admin');
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password || !confirmPassword) {
      toast({ 
        title: "Missing fields", 
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({ 
        title: "Passwords don't match", 
        description: "Please ensure both passwords are identical",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 8) {
      toast({ 
        title: "Password too short", 
        description: "Password must be at least 8 characters",
        variant: "destructive"
      });
      return;
    }

    if (!licenseFile) {
      toast({ 
        title: "License document required", 
        description: "Please upload a copy of your business license",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Upload license document
      const formData = new FormData();
      formData.append("file", licenseFile);
      
      const uploadResponse = await fetch("/api/upload/license", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload license document");
      }

      const { fileUrl } = await uploadResponse.json();

      // Submit application
      const response = await fetch("/api/admin/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          email,
          password,
          spaName,
          licenseUrl: fileUrl
        }),
      });

      if (response.ok) {
        setApplicationSubmitted(true);
        toast({ 
          title: "Application submitted!", 
          description: "Your application is pending review by a super admin.",
        });
      } else {
        const error = await response.json();
        toast({ 
          title: "Submission failed", 
          description: error.message || "Could not submit application",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show application submitted state
  if (applicationSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-100/50 via-pink-100/50 to-purple-200/50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <Link href="/">
            <Button variant="ghost" className="mb-6" data-testid="button-back">
              ← Back to Home
            </Button>
          </Link>

          <Card data-testid="card-application-submitted">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold text-green-700 dark:text-green-400">
                  Application Submitted!
                </h3>
                <p className="text-muted-foreground max-w-md">
                  Your application is pending for review. You'll be able to login with your email and password once it's been approved.
                </p>
              </div>
              <Button onClick={() => setShowRegistration(false)} variant="outline" data-testid="button-back-to-login">
                Back to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show registration or login form
  if (showRegistration) {
      // Show registration form
      return (
        <div className="min-h-screen bg-gradient-to-br from-purple-100/50 via-pink-100/50 to-purple-200/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg">
            <Link href="/">
              <Button variant="ghost" className="mb-6" data-testid="button-back">
                ← Back to Home
              </Button>
            </Link>

            <Card data-testid="card-admin-registration">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-3xl">Apply for Admin Access</CardTitle>
                <CardDescription>
                  Create your account to manage your spa business
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitApplication} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@yourspa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      data-testid="input-password"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum 8 characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      data-testid="input-confirm-password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="spa-name-reg">Business Name</Label>
                    <Input
                      id="spa-name-reg"
                      type="text"
                      placeholder="Your Spa Name"
                      value={spaName}
                      onChange={(e) => setSpaName(e.target.value)}
                      required
                      data-testid="input-spa-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="license-upload">Business License (Required)</Label>
                    <div className="border-2 border-dashed rounded-md p-6 text-center space-y-2 hover:border-primary/50 transition-colors">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                      <div>
                        <Input
                          id="license-upload"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => setLicenseFile(e.target.files?.[0] || null)}
                          required
                          data-testid="input-license-file"
                        />
                        <Label htmlFor="license-upload" className="cursor-pointer text-primary hover:underline">
                          {licenseFile ? licenseFile.name : "Click to upload"}
                        </Label>
                        {!licenseFile && (
                          <p className="text-xs text-muted-foreground mt-1">PDF, JPG or PNG (max 10MB)</p>
                        )}
                        {licenseFile && (
                          <div className="mt-2 flex items-center justify-center gap-2 text-green-600">
                            <FileText className="w-4 h-4" />
                            <span className="text-sm">{licenseFile.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isSubmitting}
                    data-testid="button-submit-application"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Application"
                    )}
                  </Button>

                  <div className="text-center text-sm">
                    <span className="text-muted-foreground">Already have an account? </span>
                    <button
                      type="button"
                      onClick={() => setShowRegistration(false)}
                      className="text-primary hover:underline"
                      data-testid="button-show-login"
                    >
                      Sign in
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      );
  }
  
  // Default: Show login form
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100/50 via-pink-100/50 to-purple-200/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            ← Back to Home
          </Button>
        </Link>

        <Card data-testid="card-admin-login">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-3xl">Admin Portal</CardTitle>
            <CardDescription>
              Sign in to manage your spa business
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email Address</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="admin@yourspa.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  data-testid="input-login-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  data-testid="input-login-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoggingIn}
                data-testid="button-login"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              <div className="text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => setShowRegistration(true)}
                  className="text-primary hover:underline"
                  data-testid="button-show-registration"
                >
                  Apply for access
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
