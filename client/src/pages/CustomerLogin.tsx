import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiFacebook, SiGoogle } from "react-icons/si";
import { Separator } from "@/components/ui/separator";
import { APP_CONFIG } from "@shared/constants";

export default function CustomerLogin() {
  const [email, setEmail] = useState("");

  const handleGoogleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleEmailContinue = () => {
    if (email.trim()) {
      window.location.href = `/api/login?email=${encodeURIComponent(email)}`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100/50 via-pink-100/50 to-purple-200/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back Link */}
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            ← Back
          </Button>
        </Link>

        {/* Login Card */}
        <div className="bg-white rounded-3xl p-8 shadow-lg space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold" data-testid="text-title">
              {APP_CONFIG.APP_NAME} for customers
            </h1>
            <p className="text-muted-foreground" data-testid="text-subtitle">
              Create an account or log in to book and manage your appointments.
            </p>
          </div>

          {/* Social Login Buttons */}
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-14 text-base rounded-full border-2 hover-elevate"
              onClick={handleGoogleLogin}
              data-testid="button-google-login"
            >
              <SiGoogle className="w-5 h-5 mr-3" />
              Continue with Google
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <Separator />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-sm text-muted-foreground">
              OR
            </span>
          </div>

          {/* Email Input */}
          <div className="space-y-4">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 text-base rounded-full border-2"
              data-testid="input-email"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleEmailContinue();
                }
              }}
            />

            <Button
              className="w-full h-14 text-base rounded-full bg-black hover:bg-black/90 text-white"
              onClick={handleEmailContinue}
              disabled={!email.trim()}
              data-testid="button-email-continue"
            >
              Continue
            </Button>
          </div>

          {/* Terms */}
          <p className="text-xs text-center text-muted-foreground">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
