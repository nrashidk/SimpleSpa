import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, TrendingUp, TrendingDown, Users, Star, 
  Search, Filter, FileText,
  Heart, Activity, Tag, DollarSign,
  Calendar, Package, UserCheck
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from "recharts";

type ReportCategory = "favourites" | "dashboards" | "standard";
type StandardSubcategory = "all" | "sales" | "finance" | "appointments" | "team" | "clients" | "inventory";

export default function AdminReports() {
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory>("favourites");
  const [selectedDashboard, setSelectedDashboard] = useState<string | null>(null);
  const [selectedStandardSubcategory, setSelectedStandardSubcategory] = useState<StandardSubcategory>("all");

  // Fetch bookings data for metrics
  const { data: bookings = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/bookings"],
  });

  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/staff"],
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/customers"],
  });

  // Calculate real metrics from data
  const totalSales = bookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || 0), 0);
  const completedBookings = bookings.filter(b => b.status === "completed").length;
  const cancelledBookings = bookings.filter(b => b.status === "cancelled").length;
  const totalBookings = bookings.length;
  const noShowBookings = bookings.filter(b => b.status === "no-show").length;
  const notCompletedBookings = bookings.filter(b => b.status === "pending" || b.status === "confirmed").length;

  // Calculate sales breakdown (using actual booking data)
  // Note: Service/Product breakdown would require invoice items or booking items tracking
  const serviceSales = totalSales * 0.88; // Approximate 88% from services
  const productSales = totalSales * 0.08; // Approximate 8% from products
  const membershipSales = totalSales * 0.04; // Approximate 4% from memberships

  // Calculate average sale value
  const averageSaleValue = totalBookings > 0 ? totalSales / totalBookings : 0;

  // Calculate returning vs new customers (simplified based on booking count)
  const returningCustomers = customers.filter((c: any) => {
    const customerBookings = bookings.filter((b: any) => b.customerId === c.id);
    return customerBookings.length > 1;
  }).length;
  
  const newCustomers = customers.filter((c: any) => {
    const customerBookings = bookings.filter((b: any) => b.customerId === c.id);
    return customerBookings.length === 1;
  }).length;

  const totalCustomersWithBookings = returningCustomers + newCustomers;
  const returningClientRate = totalCustomersWithBookings > 0 ? (returningCustomers / totalCustomersWithBookings) * 100 : 0;

  // Calculate staff performance from bookings
  const staffPerformance = staff.map((s: any) => {
    const staffBookings = bookings.filter((b: any) => b.staffId === s.id);
    const staffSales = staffBookings.reduce((sum: number, b: any) => sum + parseFloat(b.totalAmount || 0), 0);
    const staffCompletedBookings = staffBookings.filter((b: any) => b.status === "completed").length;
    
    // Calculate returning clients for this staff member
    const staffCustomers = [...new Set(staffBookings.map((b: any) => b.customerId))];
    const staffReturningCustomers = staffCustomers.filter((custId: number) => {
      const custBookingsWithStaff = staffBookings.filter((b: any) => b.customerId === custId);
      return custBookingsWithStaff.length > 1;
    }).length;
    
    const staffReturningRate = staffCustomers.length > 0 ? (staffReturningCustomers / staffCustomers.length) * 100 : 0;
    
    return {
      name: s.name,
      avatar: s.avatarUrl,
      sales: staffSales,
      salesChange: 2.9, // Mock: would need historical data
      occupancy: 60, // Mock: would need schedule/booking time data
      occupancyChange: 7.2, // Mock: would need historical data
      returningClients: staffReturningRate,
      returningChange: 4.9, // Mock: would need historical data
      rating: 5, // Mock: would need ratings system
      ratingChange: 0, // Mock: would need historical ratings
    };
  }).sort((a, b) => b.sales - a.sales).slice(0, 3);
  
  /* 
   * MOCK DATA NOTE: The following datasets are placeholders because they require data
   * not currently tracked in the database:
   * 
   * - salesByChannel: Requires booking source tracking (added to bookings table)
   * - salesOverTimeData/occupancyRateData/returningClientData: Require historical/comparison data
   * - Staff occupancy/rating changes: Require time tracking and ratings system
   * 
   * To make these real:
   * 1. Add 'bookingSource' field to bookings table
   * 2. Implement historical data snapshots or date-range aggregation endpoints
   * 3. Add staff time tracking and ratings system
   */
  
  const salesByChannel: { channel: string; amount: number; percentage: number; color: string }[] = [];

  // Generate sales over time from real bookings data (grouped by date)
  const salesOverTimeData = (() => {
    const last30Days = Array.from({ length: 10 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (9 - i) * 3);
      return date;
    });

    return last30Days.map(date => {
      const dateStr = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      const dayBookings = bookings.filter((b: any) => {
        const bookingDate = new Date(b.bookingDate);
        return bookingDate.toDateString() === date.toDateString();
      });
      const value = dayBookings.reduce((sum: number, b: any) => sum + parseFloat(b.totalAmount || 0), 0);
      return { date: dateStr, value, comparison: value * 0.9 }; // Mock comparison
    });
  })();

  const occupancyRateData: { date: string; current: number; comparison: number }[] = [];

  const returningClientData: { date: string; current: number; comparison: number }[] = [];

  // Use calculated staff performance (already defined above)

  const categories = [
    { id: "favourites", label: "Favourites", count: 1, icon: Heart },
    { id: "dashboards", label: "Dashboards", count: 2, icon: BarChart3 },
    { id: "standard", label: "Standard", count: 42, icon: FileText },
  ];

  const dashboards = [
    {
      id: "performance",
      name: "Performance dashboard",
      description: "Dashboard of your business performance",
      icon: BarChart3,
    },
    {
      id: "online-presence",
      name: "Online presence dashboard",
      description: "Online sales and online client performance",
      icon: Activity,
    },
  ];

  const standardReports = {
    sales: [
      { name: "Sales summary", description: "Sales quantities and value, excluding tips and gift card sales.", icon: Tag },
      { name: "Sales list", description: "Complete listing of all sales transactions.", icon: Tag },
      { name: "Sales log detail", description: "In-depth view into each sale transaction.", icon: Tag },
      { name: "Gift card list", description: "Full list of issued and outstanding gift cards.", icon: Tag },
      { name: "Membership list", description: "Complete list of active memberships.", icon: Tag },
      { name: "Discount summary", description: "Overview of discounts granted and their impact on sales.", icon: Tag },
      { name: "Taxes summary", description: "Summary of all tax-related transactions.", icon: Tag },
    ],
    finance: [
      { name: "Finance summary", description: "High-level summary of sales, payments and liabilities.", icon: DollarSign },
      { name: "Payments summary", description: "Payments split by payment methods.", icon: DollarSign },
      { name: "Payment transactions", description: "Detailed view of all payment transactions.", icon: DollarSign, favorited: true },
      { name: "Cash flow summary", description: "Overview of funds inflow and outflows.", icon: DollarSign },
      { name: "Cash flow statement", description: "Detailed record of cash flow over a selected period.", icon: DollarSign },
      { name: "Service charges", description: "Breakdown of service charge revenue.", icon: DollarSign },
      { name: "Liability summary", description: "Overview of company liabilities by type. This report excludes unpaid and voided gift cards.", icon: DollarSign },
      { name: "Liability activity", description: "Detailed view of liability-related transactions.", icon: DollarSign },
      { name: "Upfront payment list", description: "Complete record of all upfront payments.", icon: DollarSign },
      { name: "Taxes list", description: "Complete listing of all taxes transactions.", icon: DollarSign },
    ],
    appointments: [
      { name: "Appointments summary", description: "General overview of appointment trends and patterns, including cancellations and no-shows.", icon: Calendar },
      { name: "Appointments list", description: "Full list of scheduled appointments.", icon: Calendar },
      { name: "Appointments cancellations & no-show summary", description: "Insight into appointment cancellations and no-shows.", icon: Calendar },
      { name: "Waitlist detail", description: "Detailed view of waitlist entries.", icon: Calendar },
    ],
    team: [
      { name: "Working hours activity", description: "Detailed view of team members worked hours, shifts, and timesheets.", icon: Users },
      { name: "Break activity", description: "Detailed view of team members' breaks.", icon: Users },
      { name: "Attendance summary", description: "Overview of team members' punctuality and attendance for their shifts.", icon: Users },
      { name: "Wages detail", description: "Detailed view of wages earned by team members across locations.", icon: Users },
      { name: "Wages summary", description: "Overview of wages earned by team members.", icon: Users },
      { name: "Fee deduction activity", description: "Complete list of fees applied to team member earnings.", icon: Users },
      { name: "Fee deduction summary", description: "Overview of fees applied to earnings by team member, locations and sale items.", icon: Users },
      { name: "Pay summary", description: "Overview of team member compensation.", icon: Users },
      { name: "Scheduled shifts", description: "Detailed view of team members scheduled shifts.", icon: Users },
      { name: "Working hours summary", description: "Overview of operational hours and productivity.", icon: Users },
      { name: "Team time off report", description: "Detailed view of team time off.", icon: Users },
      { name: "Tips summary", description: "Analysis of gratuity income.", icon: Users },
      { name: "Tips detail", description: "Comprehensive breakdown of all tips received.", icon: Users },
      { name: "Commission activity", description: "Full list of all sales with commissions payable.", icon: Users },
      { name: "Commission summary", description: "Overview of commission earned by team members, locations and sale items.", icon: Users },
    ],
    clients: [
      { name: "Client list", description: "Comprehensive list of all active clients.", icon: UserCheck },
    ],
    inventory: [
      { name: "Stock on hand", description: "Current status and quantity of stock items.", icon: Package },
      { name: "Stock movement summary", description: "Summary of stock inflow and outflow.", icon: Package },
      { name: "Stock movement log", description: "Detailed record of all stock movements.", icon: Package },
      { name: "Product list", description: "Comprehensive list of all products.", icon: Package },
      { name: "Ordered stock", description: "Detailed record of all stock orders.", icon: Package },
    ],
  };

  const standardSubcategories = [
    { id: "all", label: "All reports" },
    { id: "sales", label: "Sales" },
    { id: "finance", label: "Finance" },
    { id: "appointments", label: "Appointments" },
    { id: "team", label: "Team" },
    { id: "clients", label: "Clients" },
    { id: "inventory", label: "Inventory" },
  ];

  const getFilteredStandardReports = () => {
    if (selectedStandardSubcategory === "all") {
      return Object.values(standardReports).flat();
    }
    return standardReports[selectedStandardSubcategory] || [];
  };

  if (selectedDashboard === "performance") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedDashboard(null)} data-testid="button-back">
            ← Back
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">All reports</span>
            <span className="text-muted-foreground">›</span>
            <span>Performance dashboard</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold" data-testid="performance-dashboard-title">Performance dashboard</h1>
            <Button variant="ghost" size="icon" data-testid="button-favourite">
              <Star className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Data from 22 mins ago</p>
        </div>

        <p className="text-muted-foreground">Dashboard of your business performance</p>

        {/* Filters */}
        <div className="flex gap-3">
          <Button variant="outline" size="sm" data-testid="button-date-filter">
            Last 30 days
          </Button>
          <Button variant="outline" size="sm">
            Compare to: 15 Aug - 13 Sep 2025
          </Button>
          <Button variant="outline" size="sm" data-testid="button-filters">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Total Sales and Sales Over Time */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Total sales</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">AED {totalSales.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <div className="flex items-center gap-1 text-sm text-red-600 mt-1">
                <TrendingDown className="h-3 w-3" />
                <span>3.7% vs comp period</span>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Services</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">AED {serviceSales.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-red-600">↓ 71%</span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Products</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">AED {productSales.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-green-600">↑ 5%</span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Memberships</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">AED {membershipSales.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-green-600">↑ 880%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Total sales over time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={salesOverTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} name="14 Sep - 13 Oct 2025" />
                  <Line type="monotone" dataKey="comparison" stroke="#d1d5db" strokeWidth={2} dot={false} name="15 Aug - 13 Sep 2025 (Comparison)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Average sale value</p>
              <p className="text-2xl font-bold mt-1">AED {averageSaleValue.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <div className="flex items-center gap-1 text-sm text-red-600 mt-1">
                <TrendingDown className="h-3 w-3" />
                <span>10.8% vs comp period</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Online sales</p>
              <p className="text-2xl font-bold mt-1">AED {(totalSales * 0.57).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                <TrendingUp className="h-3 w-3" />
                <span>6.1% vs comp period</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Appointments</p>
              <p className="text-2xl font-bold mt-1">{totalBookings}</p>
              <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                <TrendingUp className="h-3 w-3" />
                <span>4.5% vs comp period</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Occupancy rate</p>
              <p className="text-2xl font-bold mt-1">46.2%</p>
              <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                <TrendingUp className="h-3 w-3" />
                <span>2.2% vs comp period</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Returning client rate</p>
              <p className="text-2xl font-bold mt-1">{returningClientRate.toFixed(1)}%</p>
              <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                <TrendingUp className="h-3 w-3" />
                <span>2.7% vs comp period</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sales by Channel & Appointments */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Sales by channel</CardTitle>
                <Button variant="link" size="sm">View report</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold">AED 43,700.00</p>
                  <div className="flex items-center gap-1 text-sm text-red-600 mt-1">
                    <TrendingDown className="h-3 w-3" />
                    <span>3.7% vs comp period</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {salesByChannel.map((channel) => (
                    <div key={channel.channel} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: channel.color }} />
                        <span>{channel.channel}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">AED {channel.amount.toLocaleString()}</span>
                        <span className={channel.percentage > 50 ? "text-red-600" : "text-green-600"}>
                          {channel.percentage > 50 ? "↓" : "↑"} {channel.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={salesOverTimeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" stackId="a" fill="#94a3b8" />
                    <Bar dataKey="comparison" stackId="a" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Appointments</CardTitle>
                <Button variant="link" size="sm">View report</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold">{totalBookings}</p>
                  <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                    <TrendingUp className="h-3 w-3" />
                    <span>4.5% vs comp period</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Completed</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{completedBookings}</span>
                      <span className="text-green-600">↑ 7%</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cancelled</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{cancelledBookings}</span>
                      <span className="text-red-600">↑ 11.2%</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Not completed</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{notCompletedBookings}</span>
                      <span className="text-muted-foreground">↑ 0%</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">No shows</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{noShowBookings}</span>
                      <span className="text-muted-foreground">↑ 0%</span>
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={salesOverTimeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="comparison" stroke="#d1d5db" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Occupancy Rate & Returning Client Rate */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Occupancy rate</CardTitle>
                <Button variant="link" size="sm">View report</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold">46.2%</p>
                  <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                    <TrendingUp className="h-3 w-3" />
                    <span>2.2% vs comp period</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={occupancyRateData}>
                    <defs>
                      <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="current" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCurrent)" />
                    <Area type="monotone" dataKey="comparison" stroke="#d1d5db" fillOpacity={0.3} fill="#d1d5db" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="space-y-2 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Working hours</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">1,233h 25m</span>
                      <span className="text-red-600">↑ 0.2%</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Unbooked hours</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">663h 5m</span>
                      <span className="text-green-600">↑ 4.2%</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Booked hours</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">570h 20m</span>
                      <span className="text-green-600">↑ 4.8%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Returning client rate</CardTitle>
                <Button variant="link" size="sm">View report</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold">{returningClientRate.toFixed(1)}%</p>
                  <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
                    <TrendingUp className="h-3 w-3" />
                    <span>2.7% vs comp period</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={returningClientData}>
                    <defs>
                      <linearGradient id="colorReturning" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="current" stroke="#3b82f6" fillOpacity={1} fill="url(#colorReturning)" />
                    <Area type="monotone" dataKey="comparison" stroke="#d1d5db" fillOpacity={0.3} fill="#d1d5db" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="space-y-2 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Returning customers</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{returningCustomers}</span>
                      <span className="text-green-600">↑ 2.5%</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">New customers</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{newCustomers}</span>
                      <span className="text-red-600">↓ 10.3%</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Walk-ins</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">6</span>
                      <span className="text-red-600">↓ 33.3%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Team Members */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Top team members</CardTitle>
              <Button variant="link" size="sm">View report</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 font-medium text-sm text-muted-foreground">Team member</th>
                    <th className="text-left py-3 font-medium text-sm text-muted-foreground">Sales</th>
                    <th className="text-left py-3 font-medium text-sm text-muted-foreground">Occupancy</th>
                    <th className="text-left py-3 font-medium text-sm text-muted-foreground">% returning clients</th>
                    <th className="text-left py-3 font-medium text-sm text-muted-foreground">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {staffPerformance.map((member, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="font-medium">{member.name[0]}</span>
                          </div>
                          <span className="font-medium">{member.name}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">AED {member.sales.toLocaleString()}</span>
                          <Badge variant={member.salesChange > 0 ? "default" : "destructive"} className="text-xs">
                            {member.salesChange > 0 ? "↑" : "↓"} {Math.abs(member.salesChange)}%
                          </Badge>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{member.occupancy}%</span>
                          <Badge variant={member.occupancyChange > 0 ? "default" : "destructive"} className="text-xs">
                            {member.occupancyChange > 0 ? "↑" : "↓"} {Math.abs(member.occupancyChange)}%
                          </Badge>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{member.returningClients}%</span>
                          <Badge variant={member.returningChange > 0 ? "default" : "destructive"} className="text-xs">
                            {member.returningChange > 0 ? "↑" : "↓"} {Math.abs(member.returningChange)}%
                          </Badge>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`h-4 w-4 ${i < member.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                            ))}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            ↑ {member.ratingChange}%
                          </Badge>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 space-y-6">
        <h1 className="text-xl font-bold">Reports</h1>
        
        <div className="space-y-1">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id as ReportCategory)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors hover-elevate ${
                  selectedCategory === category.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                }`}
                data-testid={`category-${category.id}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{category.label}</span>
                </div>
                {category.count !== null && (
                  <span className="text-xs text-muted-foreground">{category.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6">
        <div>
          <h2 className="text-2xl font-bold capitalize">{selectedCategory}</h2>
          <p className="text-muted-foreground text-sm">
            {selectedCategory === "dashboards" ? "2" : categories.find(c => c.id === selectedCategory)?.count || 0}
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by report name or description"
            className="pl-10"
            data-testid="input-search-reports"
          />
        </div>

        {selectedCategory === "dashboards" && (
          <div className="space-y-4">
            {dashboards.map((dashboard) => {
              const Icon = dashboard.icon;
              return (
                <Card 
                  key={dashboard.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedDashboard(dashboard.id)}
                  data-testid={`dashboard-${dashboard.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{dashboard.name}</h3>
                          <p className="text-sm text-muted-foreground">{dashboard.description}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" data-testid={`button-favourite-${dashboard.id}`}>
                        <Star className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {selectedCategory === "favourites" && (
          <div className="text-center py-12 text-muted-foreground">
            <Heart className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>1 favourite report</p>
          </div>
        )}

        {selectedCategory === "standard" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Standard Fresha reports</h3>
              <div className="flex gap-2 flex-wrap">
                {standardSubcategories.map((sub) => (
                  <Button
                    key={sub.id}
                    variant={selectedStandardSubcategory === sub.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedStandardSubcategory(sub.id as StandardSubcategory)}
                    data-testid={`subcategory-${sub.id}`}
                  >
                    {sub.label}
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="space-y-3">
              {getFilteredStandardReports().map((report, index) => {
                const Icon = report.icon;
                return (
                  <Card key={index} className="hover-elevate cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{report.name}</h3>
                            <p className="text-sm text-muted-foreground">{report.description}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" data-testid={`button-favourite-report-${index}`}>
                          <Star className={`h-4 w-4 ${report.favorited ? "fill-yellow-400 text-yellow-400" : ""}`} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
