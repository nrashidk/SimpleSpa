import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiGoogle } from "react-icons/si";
import { Separator } from "@/components/ui/separator";
import { APP_CONFIG } from "@shared/constants";
import { signInWithGoogle } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Phone, Mail } from "lucide-react";
import { setCsrfToken } from "@/lib/queryClient";

type AuthMode = "initial" | "email-login" | "email-register" | "phone";

export default function CustomerLogin() {
  const [mode, setMode] = useState<AuthMode>("initial");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const firebaseUser = await signInWithGoogle();
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        const response = await fetch("/api/auth/firebase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
          credentials: "include",
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.csrfToken) {
            setCsrfToken(data.csrfToken);
          }
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          toast({
            title: "Welcome!",
            description: "You have successfully signed in.",
          });
          window.location.href = "/booking";
        } else {
          throw new Error("Authentication failed");
        }
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast({
        title: "Login Failed",
        description: error.message || "Unable to sign in. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
      toast({
        title: "Missing fields",
        description: "Please enter your email and password.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok) {
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        window.location.href = "/booking";
      } else {
        throw new Error(data.message || "Login failed");
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailRegister = async () => {
    if (!email || !password) {
      toast({
        title: "Missing fields",
        description: "Please enter your email and password.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/customer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName }),
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok) {
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Account created!",
          description: "You have successfully registered.",
        });
        window.location.href = "/booking";
      } else {
        throw new Error(data.message || "Registration failed");
      }
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Unable to create account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!phone) {
      toast({
        title: "Phone required",
        description: "Please enter your phone number.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/customer/phone/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok) {
        setOtpSent(true);
        toast({
          title: "Code sent!",
          description: "Please check your phone for the verification code.",
        });
      } else {
        throw new Error(data.message || "Failed to send code");
      }
    } catch (error: any) {
      toast({
        title: "Failed to send code",
        description: error.message || "Please check your phone number and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      toast({
        title: "Code required",
        description: "Please enter the verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/customer/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp, firstName, lastName }),
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok) {
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Welcome!",
          description: "You have successfully signed in.",
        });
        window.location.href = "/booking";
      } else {
        throw new Error(data.message || "Verification failed");
      }
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = () => {
    setMode("initial");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setOtp("");
    setOtpSent(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100/50 via-pink-100/50 to-purple-200/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {mode === "initial" ? (
          <Link href="/">
            <Button variant="ghost" className="mb-6" data-testid="button-back">
              Back
            </Button>
          </Link>
        ) : (
          <Button variant="ghost" className="mb-6" onClick={resetState} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}

        <div className="bg-white rounded-3xl p-8 shadow-lg space-y-6">
          {mode === "initial" && (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold" data-testid="text-title">
                  {APP_CONFIG.APP_NAME} for customers
                </h1>
                <p className="text-muted-foreground" data-testid="text-subtitle">
                  Create an account or log in to book and manage your appointments.
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full h-14 text-base rounded-full border-2 hover-elevate"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  data-testid="button-google-login"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <SiGoogle className="w-5 h-5 mr-3" />
                      Continue with Google
                    </>
                  )}
                </Button>
              </div>

              <div className="relative">
                <Separator />
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-sm text-muted-foreground">
                  OR
                </span>
              </div>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full h-14 text-base rounded-full border-2"
                  onClick={() => setMode("email-login")}
                  data-testid="button-email-option"
                >
                  <Mail className="w-5 h-5 mr-3" />
                  Continue with Email
                </Button>

                <Button
                  variant="outline"
                  className="w-full h-14 text-base rounded-full border-2"
                  onClick={() => setMode("phone")}
                  data-testid="button-phone-option"
                >
                  <Phone className="w-5 h-5 mr-3" />
                  Continue with Phone
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                By continuing, you agree to our Terms of Service and Privacy Policy
              </p>
            </>
          )}

          {mode === "email-login" && (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">Sign in with Email</h1>
                <p className="text-muted-foreground text-sm">
                  Enter your email and password to sign in
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl"
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-xl"
                    data-testid="input-password"
                    onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                  />
                </div>

                <Button
                  className="w-full h-12 text-base rounded-full bg-black hover:bg-black/90 text-white"
                  onClick={handleEmailLogin}
                  disabled={isLoading || !email || !password}
                  data-testid="button-login"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <button
                    onClick={() => setMode("email-register")}
                    className="text-primary font-medium hover:underline"
                    data-testid="link-register"
                  >
                    Create one
                  </button>
                </p>
              </div>
            </>
          )}

          {mode === "email-register" && (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">Create Account</h1>
                <p className="text-muted-foreground text-sm">
                  Fill in your details to create an account
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-12 rounded-xl"
                      data-testid="input-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-12 rounded-xl"
                      data-testid="input-last-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl"
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-xl"
                    data-testid="input-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 rounded-xl"
                    data-testid="input-confirm-password"
                    onKeyDown={(e) => e.key === "Enter" && handleEmailRegister()}
                  />
                </div>

                <Button
                  className="w-full h-12 text-base rounded-full bg-black hover:bg-black/90 text-white"
                  onClick={handleEmailRegister}
                  disabled={isLoading || !email || !password || !confirmPassword}
                  data-testid="button-register"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("email-login")}
                    className="text-primary font-medium hover:underline"
                    data-testid="link-login"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </>
          )}

          {mode === "phone" && (
            <>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">
                  {otpSent ? "Enter verification code" : "Sign in with Phone"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {otpSent 
                    ? "We sent a code to your phone number" 
                    : "Enter your phone number to receive a verification code"}
                </p>
              </div>

              <div className="space-y-4">
                {!otpSent ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+971501234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-12 rounded-xl"
                        data-testid="input-phone"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter with country code (e.g., +971 for UAE)
                      </p>
                    </div>

                    <Button
                      className="w-full h-12 text-base rounded-full bg-black hover:bg-black/90 text-white"
                      onClick={handleRequestOtp}
                      disabled={isLoading || !phone}
                      data-testid="button-request-otp"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending code...
                        </>
                      ) : (
                        "Send Verification Code"
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          placeholder="John"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="h-12 rounded-xl"
                          data-testid="input-first-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          placeholder="Doe"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="h-12 rounded-xl"
                          data-testid="input-last-name"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="otp">Verification Code</Label>
                      <Input
                        id="otp"
                        type="text"
                        placeholder="123456"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="h-12 rounded-xl text-center text-2xl tracking-widest"
                        data-testid="input-otp"
                        onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                      />
                    </div>

                    <Button
                      className="w-full h-12 text-base rounded-full bg-black hover:bg-black/90 text-white"
                      onClick={handleVerifyOtp}
                      disabled={isLoading || !otp}
                      data-testid="button-verify-otp"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Verify & Sign In"
                      )}
                    </Button>

                    <button
                      onClick={() => setOtpSent(false)}
                      className="w-full text-sm text-muted-foreground hover:text-primary"
                      data-testid="button-resend-otp"
                    >
                      Didn't receive the code? Send again
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
