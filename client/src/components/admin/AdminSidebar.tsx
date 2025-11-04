import {
  LayoutDashboard,
  Sparkles,
  Users,
  Calendar,
  Package,
  DollarSign,
  BarChart3,
  Settings,
  UserCircle,
  ShoppingCart,
  UserCheck,
  Store,
  Megaphone,
  Puzzle,
  Shield,
  ChevronUp,
  Key,
  LogOut,
  User,
  TicketPercent,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";

const menuItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
    requirePermission: "canAccessDashboard" as const,
  },
  {
    title: "Calendar",
    url: "/admin/calendar",
    icon: Calendar,
    requirePermission: "canViewOwnCalendar" as const,
  },
  {
    title: "Sales",
    url: "/admin/sales",
    icon: DollarSign,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Clients",
    url: "/admin/clients",
    icon: UserCheck,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Services",
    url: "/admin/services",
    icon: Sparkles,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Service Add-ons",
    url: "/admin/service-addons",
    icon: Sparkles,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Staff",
    url: "/admin/staff",
    icon: Users,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Bookings",
    url: "/admin/bookings",
    icon: Calendar,
    requirePermission: "canViewOwnCalendar" as const,
  },
  {
    title: "Inventory",
    url: "/admin/inventory",
    icon: Package,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Finance",
    url: "/admin/finance",
    icon: DollarSign,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Reports",
    url: "/admin/reports",
    icon: BarChart3,
    requirePermission: "canAccessDashboard" as const,
  },
  {
    title: "Marketplace",
    url: "/admin/marketplace",
    icon: Store,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Marketing",
    url: "/admin/marketing",
    icon: Megaphone,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Promo Codes",
    url: "/admin/promo-codes",
    icon: TicketPercent,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Add-ons",
    url: "/admin/addons",
    icon: Puzzle,
    requirePermission: "isAdmin" as const,
  },
  {
    title: "Settings",
    url: "/admin/settings",
    icon: Settings,
  },
];

export function AdminSidebar() {
  const [location] = useLocation();
  const { user, isSuperAdmin } = useAuth();
  const staffPermissions = useStaffPermissions();
  
  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "AD";
    const first = firstName?.[0] || "";
    const last = lastName?.[0] || "";
    return (first + last).toUpperCase() || "AD";
  };

  const getFullName = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "Admin User";
    return [firstName, lastName].filter(Boolean).join(" ");
  };

  // Filter menu items based on staff permissions
  const visibleMenuItems = menuItems.filter((item) => {
    if (!item.requirePermission) return true; // Always show items without permission requirement
    return staffPermissions[item.requirePermission];
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">Admin Panel</h2>
            <p className="text-xs text-muted-foreground">Serene Spa</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`admin-nav-${item.title.toLowerCase()}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/admin/super-admin"}
                    data-testid="admin-nav-super-admin"
                  >
                    <Link href="/admin/super-admin">
                      <Shield className="h-4 w-4" />
                      <span>Super Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="flex items-center gap-3 w-full hover-elevate rounded-md p-2 transition-colors"
              data-testid="admin-profile-menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{getInitials(user?.firstName, user?.lastName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium" data-testid="text-admin-name">
                  {getFullName(user?.firstName, user?.lastName)}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-admin-email">
                  {user?.email || "admin@spa.com"}
                </p>
              </div>
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin/settings" data-testid="menu-account-settings">
                <User className="mr-2 h-4 w-4" />
                <span>Account Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/settings?tab=password" data-testid="menu-change-password">
                <Key className="mr-2 h-4 w-4" />
                <span>Change Password</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => window.location.href = "/api/logout"}
              data-testid="menu-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
