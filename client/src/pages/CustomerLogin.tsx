import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiGoogle } from "react-icons/si";
import { Separator } from "@/components/ui/separator";
import { APP_CONFIG } from "@shared/constants";
import { signInWithGoogle, getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

export default function CustomerLogin() {
  const [email, setEmail] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
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
      setIsLoggingIn(false);
    }
  };

  const handleEmailContinue = () => {
    toast({
      title: "Email Login",
      description: "Please use Google Sign-in for now. Email/password login coming soon!",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100/50 via-pink-100/50 to-purple-200/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            Back
          </Button>
        </Link>

        <div className="bg-white rounded-3xl p-8 shadow-lg space-y-6">
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
              disabled={isLoggingIn}
              data-testid="button-google-login"
            >
              {isLoggingIn ? (
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

          <p className="text-xs text-center text-muted-foreground">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
