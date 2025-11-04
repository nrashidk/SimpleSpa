import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import BookingSearch from "@/pages/BookingSearch";
import BookingFlow from "@/pages/BookingFlow";
import CustomerLogin from "@/pages/CustomerLogin";
import AdminLogin from "@/pages/AdminLogin";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminCalendar from "@/pages/admin/Calendar";
import AdminSales from "@/pages/admin/Sales";
import AdminClients from "@/pages/admin/Clients";
import AdminServices from "@/pages/admin/Services";
import AdminStaff from "@/pages/admin/Staff";
import AdminBookings from "@/pages/admin/Bookings";
import AdminInventory from "@/pages/admin/Inventory";
import AdminFinance from "@/pages/admin/Finance";
import AdminReports from "@/pages/admin/Reports";
import AdminFinanceAccounting from "@/pages/admin/FinanceAccounting";
import AdminSettings from "@/pages/admin/Settings";
import AdminMarketplace from "@/pages/admin/Marketplace";
import AdminMarketing from "@/pages/admin/Marketing";
import AdminPromoCodes from "@/pages/admin/PromoCodes";
import AdminAddOns from "@/pages/admin/AddOns";
import SuperAdmin from "@/pages/admin/SuperAdmin";
import SpaSetup from "@/pages/admin/SpaSetup";
import MyAccount from "@/pages/MyAccount";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login/customer" component={CustomerLogin} />
      <Route path="/login/admin" component={AdminLogin} />
      <Route path="/booking" component={BookingSearch} />
      <Route path="/booking/flow" component={BookingFlow} />
      <Route path="/my-account" component={MyAccount} />
      
      {/* Admin Routes - Protected with admin role requirement */}
      <Route path="/admin">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/calendar">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminCalendar />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/sales">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminSales />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/clients">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminClients />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/services">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminServices />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/staff">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminStaff />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/bookings">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminBookings />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/inventory">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminInventory />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/finance">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminFinanceAccounting />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/reports">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminReports />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/settings">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminSettings />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/marketplace">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminMarketplace />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/marketing">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminMarketing />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/promo-codes">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminPromoCodes />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/addons">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <AdminAddOns />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/super-admin">
        {() => (
          <ProtectedRoute requireSuperAdmin>
            <AdminLayout>
              <SuperAdmin />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin/setup">
        {() => (
          <ProtectedRoute requireAdmin>
            <AdminLayout>
              <SpaSetup />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
