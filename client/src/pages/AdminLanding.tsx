import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, Users, TrendingUp, DollarSign, Megaphone, Plug, Package, UserCog, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { APP_CONFIG } from "@shared/constants";
import { signInWithGoogle, handleRedirectResult } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

export default function AdminLanding() {
  const [, setLocation] = useLocation();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user } = useQuery<{ id: string; role: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
    throwOnError: false,
  });

  useEffect(() => {
    handleRedirectResult().then(async (user) => {
      if (user) {
        const idToken = await user.getIdToken();
        await fetch("/api/auth/firebase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
          credentials: "include",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }
    });
  }, [queryClient]);

  useEffect(() => {
    if (user && (user.role === "admin" || user.role === "super_admin")) {
      setLocation("/admin");
    }
  }, [user, setLocation]);

  const handleLogin = async () => {
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

  const features = [
    {
      icon: Calendar,
      title: "Smart Calendar",
      description: "Manage bookings with drag-and-drop scheduling, zoom controls, and real-time availability",
    },
    {
      icon: Users,
      title: "Client Management",
      description: "Track customer preferences, booking history, and build lasting relationships",
    },
    {
      icon: TrendingUp,
      title: "Analytics Dashboard",
      description: "Revenue tracking, performance metrics, and insights to grow your spa business",
    },
    {
      icon: DollarSign,
      title: "Finance & Accounting",
      description: "Complete financial management with expense tracking, invoicing, and profit analysis",
    },
    {
      icon: Megaphone,
      title: "Marketing Tools",
      description: "Email campaigns, SMS automation, promotions, and customer engagement tools",
    },
    {
      icon: Plug,
      title: "Seamless Integration",
      description: "Connect with payment gateways, social media, and third-party platforms effortlessly",
    },
    {
      icon: Package,
      title: "Inventory Management",
      description: "Track stock levels, manage suppliers, and automate reordering for your products",
    },
    {
      icon: UserCog,
      title: "Staff Management",
      description: "Schedule shifts, track performance, manage commissions, and optimize team productivity",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-secondary/20 to-background">
      <div className="relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-24 sm:pb-32">
          <div className="text-center space-y-8">
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                {APP_CONFIG.APP_NAME}
              </h1>
            </div>

            <div className="space-y-4 max-w-4xl mx-auto">
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground">
                Build Your Dream Spa
                <span className="block text-primary mt-2">Management System</span>
              </h2>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Complete admin panel for spa owners. Manage bookings, clients, staff, services, 
                and grow your business with powerful analytics and automation.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="text-lg px-8 py-6 group"
                data-testid="button-admin-login"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="mr-2 w-5 h-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg className="mr-2 w-5 h-5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => setLocation("/booking")}
                className="text-lg px-8 py-6"
                data-testid="button-customer-booking"
              >
                Book an Appointment
              </Button>
            </div>

            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Trusted by wellness professionals worldwide
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-center mb-12">
          <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            Everything You Need to Succeed
          </h3>
          <p className="text-muted-foreground text-lg">
            A complete suite of tools designed for modern spa management
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="p-6 hover-elevate transition-all duration-300 border-border/50"
              data-testid={`card-feature-${index}`}
            >
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="border-t border-border/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Ready to Transform Your Spa Business?
          </h3>
          <p className="text-muted-foreground mb-8 text-lg">
            Login to access your admin panel and start building your spa profile today.
          </p>
          <Button
            size="lg"
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="text-lg px-10 py-6"
            data-testid="button-admin-login-bottom"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="mr-2 w-5 h-5 animate-spin" />
                Signing in...
              </>
            ) : (
              "Get Started Now"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
