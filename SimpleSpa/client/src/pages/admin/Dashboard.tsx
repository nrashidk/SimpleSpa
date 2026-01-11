import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, subDays, isToday, isSameDay, subMonths } from "date-fns";
import { Calendar, Clock, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import type { Booking, BookingItem, Service, Staff, Customer } from "@shared/schema";
import { useState } from "react";

type WidgetType = "sales" | "appointments" | "activity" | "upcoming" | "services" | "team";
type PeriodType = "7days" | "30days" | "thisMonth" | "lastMonth" | "thisYear";

const availableWidgets: { type: WidgetType; label: string }[] = [
  { type: "sales", label: "Recent Sales" },
  { type: "appointments", label: "Upcoming Appointments" },
  { type: "activity", label: "Appointments Activity" },
  { type: "upcoming", label: "Today's Next Appointments" },
  { type: "services", label: "Top Services" },
  { type: "team", label: "Top Team Member" },
];

const periodOptions: { value: PeriodType; label: string }[] = [
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisYear", label: "This year" },
];

export default function AdminDashboard() {
  const [activeWidgets, setActiveWidgets] = useState<WidgetType[]>([
    "sales", "appointments", "activity", "upcoming", "services", "team"
  ]);
  const [widgetPeriods, setWidgetPeriods] = useState<Record<WidgetType, PeriodType>>({
    sales: "7days",
    appointments: "7days",
    activity: "7days",
    upcoming: "7days",
    services: "thisMonth",
    team: "thisMonth",
  });
  // Fetch all required data
  const { data: bookings = [], isLoading: loadingBookings } = useQuery<Booking[]>({
    queryKey: ["/api/admin/bookings"],
  });

  const { data: bookingItems = [] } = useQuery<BookingItem[]>({
    queryKey: ["/api/admin/booking-items"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/admin/services"],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/admin/staff"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/admin/customers"],
  });

  // Calculate stats
  const todaysBookings = bookings.filter(b => isToday(new Date(b.bookingDate)));
  const confirmedCount = todaysBookings.filter(b => b.status === "confirmed").length;
  const cancelledCount = todaysBookings.filter(b => b.status === "cancelled").length;
  const totalBookings = todaysBookings.length;

  // Sales data for last 7 days
  const salesData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dayBookings = bookings.filter(b => {
      const bookingDate = new Date(b.bookingDate);
      return isSameDay(bookingDate, date);
    });
    
    const completedBookings = dayBookings.filter(b => b.status === 'completed');
    const dailyRevenue = completedBookings.reduce((sum, b) => {
      const amount = parseFloat(b.totalAmount?.toString() || '0');
      const discount = parseFloat(b.discountAmount?.toString() || '0');
      return sum + (amount - discount);
    }, 0);
    
    return {
      date: format(date, 'MMM dd'),
      Sales: dailyRevenue,
      Appointments: dayBookings.length,
    };
  });

  // Upcoming appointments chart data
  const appointmentsData = [
    { name: 'Confirmed', value: confirmedCount },
    { name: 'Cancelled', value: cancelledCount },
  ];

  // Recent completed appointments
  const recentActivity = bookings
    .filter(b => b.status === 'completed')
    .slice(0, 4)
    .map(booking => {
      const customer = customers.find(c => c.id === booking.customerId);
      const items = bookingItems.filter(item => item.bookingId === booking.id);
      const firstItem = items[0];
      const service = firstItem ? services.find(s => s.id === firstItem.serviceId) : null;
      const staffMember = staff.find(s => s.id === booking.staffId);
      return {
        ...booking,
        customerName: customer?.name || 'Unknown Customer',
        serviceName: service?.name || 'Unknown Service',
        staffName: staffMember?.name || 'Any professional',
      };
    });

  // Today's upcoming appointments
  const upcomingToday = todaysBookings
    .filter(b => b.status === 'confirmed')
    .slice(0, 4)
    .map(booking => {
      const customer = customers.find(c => c.id === booking.customerId);
      const items = bookingItems.filter(item => item.bookingId === booking.id);
      const firstItem = items[0];
      const service = firstItem ? services.find(s => s.id === firstItem.serviceId) : null;
      const staffMember = staff.find(s => s.id === booking.staffId);
      return {
        ...booking,
        customerName: customer?.name || 'Unknown Customer',
        serviceName: service?.name || 'Unknown Service',
        staffName: staffMember?.name || 'Any professional',
      };
    });

  // Top services by booking count
  const serviceBookingCounts = services.map(service => {
    const thisMonthCount = bookingItems.filter(item => {
      const booking = bookings.find(b => b.id === item.bookingId);
      if (!booking) return false;
      const bookingDate = new Date(booking.bookingDate);
      const now = new Date();
      return item.serviceId === service.id && 
             bookingDate.getMonth() === now.getMonth() &&
             bookingDate.getFullYear() === now.getFullYear();
    }).length;

    const lastMonthCount = bookingItems.filter(item => {
      const booking = bookings.find(b => b.id === item.bookingId);
      if (!booking) return false;
      const bookingDate = new Date(booking.bookingDate);
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return item.serviceId === service.id && 
             bookingDate.getMonth() === lastMonth.getMonth() &&
             bookingDate.getFullYear() === lastMonth.getFullYear();
    }).length;

    const servicePrice = parseFloat(service.price?.toString() || "0");
    return {
      name: service.name,
      thisMonth: thisMonthCount,
      lastMonth: lastMonthCount,
      revenue: `AED ${(thisMonthCount * servicePrice).toFixed(0)}`,
    };
  }).sort((a, b) => b.thisMonth - a.thisMonth).slice(0, 5);

  // Top team members by revenue
  const teamMemberStats = staff.map(member => {
    const thisMonthBookings = bookings.filter(b => {
      const bookingDate = new Date(b.bookingDate);
      const now = new Date();
      return b.staffId === member.id && 
             bookingDate.getMonth() === now.getMonth() &&
             bookingDate.getFullYear() === now.getFullYear() &&
             b.status === 'completed';
    });

    const lastMonthBookings = bookings.filter(b => {
      const bookingDate = new Date(b.bookingDate);
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return b.staffId === member.id && 
             bookingDate.getMonth() === lastMonth.getMonth() &&
             bookingDate.getFullYear() === lastMonth.getFullYear() &&
             b.status === 'completed';
    });

    const thisMonthRevenue = thisMonthBookings.reduce((sum, b) => {
      const amount = parseFloat(b.totalAmount?.toString() || '0');
      const discount = parseFloat(b.discountAmount?.toString() || '0');
      return sum + (amount - discount);
    }, 0);
    
    const lastMonthRevenue = lastMonthBookings.reduce((sum, b) => {
      const amount = parseFloat(b.totalAmount?.toString() || '0');
      const discount = parseFloat(b.discountAmount?.toString() || '0');
      return sum + (amount - discount);
    }, 0);

    return {
      name: member.name,
      thisMonth: `AED ${thisMonthRevenue.toFixed(0)}`,
      lastMonth: `AED ${lastMonthRevenue.toFixed(0)}`,
    };
  }).slice(0, 5);

  const totalRevenue = bookings
    .filter(b => b.status === 'completed')
    .reduce((sum, booking) => {
      const totalAmount = parseFloat(booking.totalAmount?.toString() || "0");
      const discountAmount = parseFloat(booking.discountAmount?.toString() || "0");
      return sum + (totalAmount - discountAmount);
    }, 0);

  // Helper functions for widget management
  const handlePeriodChange = (widgetType: WidgetType, period: PeriodType) => {
    setWidgetPeriods(prev => ({ ...prev, [widgetType]: period }));
  };

  const handleReplaceWidget = (currentWidget: WidgetType, newWidget: WidgetType) => {
    setActiveWidgets(prev => prev.map(w => w === currentWidget ? newWidget : w));
  };

  const getAvailableWidgetsForReplacement = (currentWidget: WidgetType) => {
    return availableWidgets.filter(w => w.type !== currentWidget && !activeWidgets.includes(w.type));
  };

  // Widget menu component
  const WidgetMenu = ({ widgetType }: { widgetType: WidgetType }) => {
    const availableForReplacement = getAvailableWidgetsForReplacement(widgetType);
    const currentPeriod = widgetPeriods[widgetType];
    const currentPeriodLabel = periodOptions.find(p => p.value === currentPeriod)?.label || "Last 7 days";

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`menu-${widgetType}`}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" data-testid={`menu-content-${widgetType}`}>
          <DropdownMenuLabel>Period: {currentPeriodLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {periodOptions.map((period) => (
            <DropdownMenuItem
              key={period.value}
              onSelect={() => handlePeriodChange(widgetType, period.value)}
              data-testid={`period-${widgetType}-${period.value}`}
              className={currentPeriod === period.value ? "bg-accent" : ""}
            >
              {period.label}
            </DropdownMenuItem>
          ))}

          {availableForReplacement.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Replace with</DropdownMenuLabel>
              {availableForReplacement.map((widget) => (
                <DropdownMenuItem
                  key={widget.type}
                  onSelect={() => handleReplaceWidget(widgetType, widget.type)}
                  data-testid={`replace-${widgetType}-${widget.type}`}
                >
                  {widget.label}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (loadingBookings) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="admin-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your business performance</p>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Sales Chart */}
        {activeWidgets.includes("sales") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Recent sales</h3>
                  <p className="text-2xl font-bold mt-1">AED {totalRevenue.toFixed(0)}</p>
                  <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                    <span>Appointments <span className="font-semibold text-foreground">{bookings.length}</span></span>
                    <span>Appointments cost <span className="font-semibold text-foreground">AED {totalRevenue.toFixed(0)}</span></span>
                  </div>
                </div>
                <WidgetMenu widgetType="sales" />
              </CardTitle>
            </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="Sales" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="Appointments" 
                  stroke="hsl(var(--accent))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--accent))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
          )}

        {/* Upcoming Appointments Chart */}
        {activeWidgets.includes("appointments") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Upcoming appointments</h3>
                  <p className="text-2xl font-bold mt-1">{totalBookings} booked</p>
                  <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                    <span>Confirmed appointments <span className="font-semibold text-foreground">{confirmedCount}</span></span>
                    <span>Cancelled appointments <span className="font-semibold text-foreground">{cancelledCount}</span></span>
                  </div>
                </div>
                <WidgetMenu widgetType="appointments" />
              </CardTitle>
            </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={appointmentsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
          )}
      </div>

      {/* Activity and Appointments Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Appointments Activity */}
        {activeWidgets.includes("activity") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Appointments activity</span>
                <WidgetMenu widgetType="activity" />
              </CardTitle>
            </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((appointment, index) => (
                  <div key={index} className="flex items-start gap-3" data-testid={`activity-${index}`}>
                    <div className="flex flex-col items-center">
                      <div className="flex items-center justify-center rounded-md bg-muted p-2">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {format(new Date(appointment.bookingDate), 'dd')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(appointment.bookingDate), 'MMM')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{appointment.customerName}</p>
                          <p className="text-sm text-muted-foreground">
                            {appointment.serviceName} • {appointment.staffName}
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                          Completed
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>
          )}

        {/* Today's Next Appointments */}
        {activeWidgets.includes("upcoming") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Today's next appointments</span>
                <WidgetMenu widgetType="upcoming" />
              </CardTitle>
            </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingToday.length > 0 ? (
                upcomingToday.map((appointment, index) => (
                  <div key={index} className="flex items-start gap-3" data-testid={`upcoming-${index}`}>
                    <div className="flex flex-col items-center">
                      <div className="flex items-center justify-center rounded-md bg-primary/10 p-2">
                        <Clock className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {format(new Date(appointment.bookingDate), 'dd')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(appointment.bookingDate), 'MMM')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{appointment.serviceName}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(appointment.bookingDate), 'h:mma')} with {appointment.staffName}
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                          Booked
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No appointments scheduled for today</p>
              )}
            </div>
          </CardContent>
        </Card>
          )}
      </div>

      {/* Tables Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Services */}
        {activeWidgets.includes("services") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Top services</span>
                <WidgetMenu widgetType="services" />
              </CardTitle>
            </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-4 pb-2 border-b text-sm font-medium text-muted-foreground">
                <div>Service</div>
                <div className="text-right">This month</div>
                <div className="text-right">Last month</div>
              </div>
              {serviceBookingCounts.length > 0 ? (
                serviceBookingCounts.map((service, index) => (
                  <div key={index} className="grid grid-cols-3 gap-4 py-2 text-sm" data-testid={`top-service-${index}`}>
                    <div className="font-medium">{service.name}</div>
                    <div className="text-right font-semibold">{service.thisMonth}</div>
                    <div className="text-right text-muted-foreground">{service.lastMonth}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No service data available</p>
              )}
            </div>
          </CardContent>
        </Card>
          )}

        {/* Top Team Members */}
        {activeWidgets.includes("team") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Top team member</span>
                <WidgetMenu widgetType="team" />
              </CardTitle>
            </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-4 pb-2 border-b text-sm font-medium text-muted-foreground">
                <div>Team member</div>
                <div className="text-right">This month</div>
                <div className="text-right">Last month</div>
              </div>
              {teamMemberStats.length > 0 ? (
                teamMemberStats.map((member, index) => (
                  <div key={index} className="grid grid-cols-3 gap-4 py-2 text-sm" data-testid={`top-team-${index}`}>
                    <div className="font-medium">{member.name}</div>
                    <div className="text-right font-semibold">{member.thisMonth}</div>
                    <div className="text-right text-muted-foreground">{member.lastMonth}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No team data available</p>
              )}
            </div>
          </CardContent>
        </Card>
          )}
      </div>
    </div>
  );
}
