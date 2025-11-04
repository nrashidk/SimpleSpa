import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, Users, TrendingUp, DollarSign, Megaphone, Plug, Package, UserCog, ArrowRight, Sparkles } from "lucide-react";
import { APP_CONFIG } from "@shared/constants";

export default function AdminLanding() {
  const [, setLocation] = useLocation();

  // Check if user is already logged in (handle 401 gracefully for non-authenticated visitors)
  const { data: user } = useQuery<{ id: string; role: string }>({
    queryKey: ["/api/auth/user"],
    retry: false, // Don't retry on 401
    throwOnError: false, // Don't throw on error - landing should always render
  });

  // If user is logged in and is admin, redirect to admin panel
  useEffect(() => {
    if (user && user.role === "admin") {
      setLocation("/admin");
    }
  }, [user, setLocation]);

  const handleLogin = () => {
    window.location.href = "/api/login";
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
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Decorative gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-24 sm:pb-32">
          <div className="text-center space-y-8">
            {/* Logo/Brand */}
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                {APP_CONFIG.APP_NAME}
              </h1>
            </div>

            {/* Main Heading */}
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

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={handleLogin}
                className="text-lg px-8 py-6 group"
                data-testid="button-admin-login"
              >
                Login as Admin
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
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

            {/* Trust Badge */}
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Trusted by wellness professionals worldwide
            </p>
          </div>
        </div>
      </div>

      {/* Features Grid */}
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

      {/* Bottom CTA */}
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
            className="text-lg px-10 py-6"
            data-testid="button-admin-login-bottom"
          >
            Get Started Now
          </Button>
        </div>
      </div>
    </div>
  );
}
