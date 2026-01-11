import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportHeader } from "@/components/ReportHeader";
import {
  Calendar,
  DollarSign,
  FileText,
  ListChecks,
  TrendingUp,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { DateRangeFilter, DateRangeType } from "@/components/DateRangeFilter";

type ReportType = 
  | "appointments-summary"
  | "payment-summary"
  | "finance-summary"
  | "sales-list"
  | "sales-summary";

// Helper function to calculate date range from DateRangeFilter value
function getDateRangeFromFilter(filterValue: {
  type: DateRangeType;
  startDate?: string;
  endDate?: string;
  month?: string;
}): { startDate: string; endDate: string } {
  const now = new Date();
  
  switch (filterValue.type) {
    case "this-month":
      return {
        startDate: format(startOfMonth(now), "yyyy-MM-dd"),
        endDate: format(endOfMonth(now), "yyyy-MM-dd")
      };
    case "last-month":
      const lastMonth = subMonths(now, 1);
      return {
        startDate: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
        endDate: format(endOfMonth(lastMonth), "yyyy-MM-dd")
      };
    case "last-3-months":
      // Start at beginning of month 3 months ago, end today
      const threeMonthsAgo = subMonths(now, 3);
      return {
        startDate: format(startOfMonth(threeMonthsAgo), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd")
      };
    case "last-6-months":
      // Start at beginning of month 6 months ago, end today
      const sixMonthsAgo = subMonths(now, 6);
      return {
        startDate: format(startOfMonth(sixMonthsAgo), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd")
      };
    case "last-12-months":
      // Start at beginning of month 12 months ago, end today
      const twelveMonthsAgo = subMonths(now, 12);
      return {
        startDate: format(startOfMonth(twelveMonthsAgo), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd")
      };
    case "month-to-date":
      if (filterValue.month) {
        const [year, month] = filterValue.month.split("-").map(Number);
        const selectedMonthStart = new Date(year, month - 1, 1);
        const selectedMonthEnd = endOfMonth(selectedMonthStart);
        
        // True month-to-date: if selected month is current month, use today as end
        // If past month, use full month
        const isSameMonth = year === now.getFullYear() && month === now.getMonth() + 1;
        return {
          startDate: format(selectedMonthStart, "yyyy-MM-dd"),
          endDate: isSameMonth ? format(now, "yyyy-MM-dd") : format(selectedMonthEnd, "yyyy-MM-dd")
        };
      }
      return {
        startDate: format(startOfMonth(now), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd")
      };
    case "custom":
      // Validate custom dates - both must be provided and start must be <= end
      if (!filterValue.startDate || !filterValue.endDate || filterValue.startDate > filterValue.endDate) {
        // Fall back to this month if invalid
        return {
          startDate: format(startOfMonth(now), "yyyy-MM-dd"),
          endDate: format(now, "yyyy-MM-dd")
        };
      }
      return {
        startDate: filterValue.startDate,
        endDate: filterValue.endDate
      };
    default:
      return {
        startDate: format(startOfMonth(subMonths(now, 6)), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd")
      };
  }
}

// Type definitions for report data
interface FinanceSummaryData {
  sales?: {
    grossSales: number;
    discounts: number;
    refunds: number;
    netSales: number;
  };
  totalSales?: {
    giftCardSales: number;
    serviceCharges: number;
    tips: number;
  };
  payments?: {
    card: number;
    cash: number;
    online: number;
  };
  redemptions?: number;
}

interface SalesSummaryRow {
  type: string;
  salesQty: number;
  itemsSold: number;
  grossSales: number;
  totalDiscounts: number;
  refunds: number;
  netSales: number;
  taxes: number;
  totalSales: number;
}

interface SalesSummaryData {
  total?: SalesSummaryRow;
  service?: SalesSummaryRow;
  product?: SalesSummaryRow;
  memberships?: SalesSummaryRow;
}

interface SalesListItem {
  saleNo: string;
  saleDate: string;
  saleStatus: string;
  location: string;
  client: string;
  channel: string;
  itemsSold: number;
  totalSales: number;
  giftCard: number;
  serviceCharges: number;
  amountDue: number;
}

interface SalesListData {
  total?: {
    itemsSold: number;
    totalSales: number;
    giftCard: number;
    serviceCharges: number;
    amountDue: number;
  };
  sales?: SalesListItem[];
}

interface AppointmentsSummaryRow {
  location: string;
  appointments: number;
  services: number;
  percentRequested: number;
  totalApptValue: number;
  averageApptValue: number;
  percentOnline: number;
  percentCancelled: number;
  percentNoShow: number;
  totalClients: number;
  newClients: number;
  percentNewClients: number;
  percentReturningClients: number;
}

interface AppointmentsSummaryData {
  total?: AppointmentsSummaryRow;
  locations?: AppointmentsSummaryRow[];
}

interface PaymentSummaryRow {
  paymentMethod: string;
  paymentsCount: number;
  paymentAmount: number;
  refundsCount: number;
  refundsAmount: number;
  netPayments: number;
}

interface PaymentSummaryData {
  total?: PaymentSummaryRow;
  payments?: PaymentSummaryRow[];
}

// Helper functions to format currency and percentages
const formatCurrency = (amount: number) => {
  return `AED ${amount.toFixed(2)}`;
};

const formatPercent = (value: number | string | null | undefined) => {
  // Handle null/undefined - show dash for missing data
  if (value === null || value === undefined) {
    return '—';
  }
  // Convert string to number (backend returns percentages as strings like "23.5")
  const numeric = typeof value === 'string' ? parseFloat(value) : value;
  // Guard against NaN
  if (isNaN(numeric)) {
    return '—';
  }
  // Backend returns percentages as whole numbers (23.5 for 23.5%)
  // Just format with 2 decimal places and add % suffix
  return `${numeric.toFixed(2)}%`;
};

export default function AdminFinanceAccounting() {
  const [selectedReport, setSelectedReport] = useState<ReportType>("finance-summary");
  
  // Unified date range filter state
  const [dateRangeFilter, setDateRangeFilter] = useState<{
    type: DateRangeType;
    startDate?: string;
    endDate?: string;
    month?: string;
  }>({
    type: "last-6-months",
  });
  
  // Sorting state for Sales Summary
  const [salesSummarySortColumn, setSalesSummarySortColumn] = useState<string | null>(null);
  const [salesSummarySortDirection, setSalesSummarySortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Sorting state for Sales List
  const [salesListSortColumn, setSalesListSortColumn] = useState<string | null>(null);
  const [salesListSortDirection, setSalesListSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Sorting state for Appointments Summary
  const [appointmentsSummarySortColumn, setAppointmentsSummarySortColumn] = useState<string | null>(null);
  const [appointmentsSummarySortDirection, setAppointmentsSummarySortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Sorting state for Payment Summary
  const [paymentSummarySortColumn, setPaymentSummarySortColumn] = useState<string | null>(null);
  const [paymentSummarySortDirection, setPaymentSummarySortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Calculate date range based on filter
  const dateRange = useMemo(() => getDateRangeFromFilter(dateRangeFilter), [dateRangeFilter]);
  
  // Build URLs with query parameters
  const financeSummaryUrl = `/api/admin/reports/finance-summary?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
  const salesSummaryUrl = `/api/admin/reports/sales-summary?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
  const salesListUrl = `/api/admin/reports/sales-list?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
  const appointmentsSummaryUrl = `/api/admin/reports/appointments-summary?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
  const paymentSummaryUrl = `/api/admin/reports/payment-summary?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
  
  // Fetch Finance Summary data
  const { data: financeSummaryData, isLoading: isLoadingFinanceSummary } = useQuery({
    queryKey: [financeSummaryUrl],
    enabled: selectedReport === "finance-summary",
  });
  
  // Fetch Sales Summary data
  const { data: salesSummaryData, isLoading: isLoadingSalesSummary } = useQuery({
    queryKey: [salesSummaryUrl],
    enabled: selectedReport === "sales-summary",
  });
  
  // Fetch Sales List data
  const { data: salesListData, isLoading: isLoadingSalesList } = useQuery({
    queryKey: [salesListUrl],
    enabled: selectedReport === "sales-list",
  });
  
  // Fetch Appointments Summary data
  const { data: appointmentsSummaryData, isLoading: isLoadingAppointmentsSummary } = useQuery({
    queryKey: [appointmentsSummaryUrl],
    enabled: selectedReport === "appointments-summary",
  });
  
  // Fetch Payment Summary data
  const { data: paymentSummaryData, isLoading: isLoadingPaymentSummary } = useQuery({
    queryKey: [paymentSummaryUrl],
    enabled: selectedReport === "payment-summary",
  });

  const menuItems = [
    {
      id: "finance-summary" as ReportType,
      label: "Finance summary",
      icon: DollarSign,
      description: "High-level summary of sales, payments and liabilities",
    },
    {
      id: "sales-summary" as ReportType,
      label: "Sales summary",
      icon: TrendingUp,
      description: "Sales quantities and value, excluding tips and gift card sales",
    },
    {
      id: "sales-list" as ReportType,
      label: "Sales list",
      icon: ListChecks,
      description: "Complete listing of all sales transactions",
    },
    {
      id: "appointments-summary" as ReportType,
      label: "Appointments summary",
      icon: Calendar,
      description: "General overview of appointment trends and patterns",
    },
    {
      id: "payment-summary" as ReportType,
      label: "Payment summary",
      icon: FileText,
      description: "Payments split by payment methods",
    },
  ];

  const renderAppointmentsSummary = () => {
    if (isLoadingAppointmentsSummary) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    // Safely extract data with proper type validation
    const data = (appointmentsSummaryData as AppointmentsSummaryData) || {};
    const total = {
      appointments: data.total?.appointments ?? 0,
      services: data.total?.services ?? 0,
      percentRequested: data.total?.percentRequested ?? 0,
      totalApptValue: data.total?.totalApptValue ?? 0,
      averageApptValue: data.total?.averageApptValue ?? 0,
      percentOnline: data.total?.percentOnline ?? 0,
      percentCancelled: data.total?.percentCancelled ?? 0,
      percentNoShow: data.total?.percentNoShow ?? 0,
      totalClients: data.total?.totalClients ?? 0,
      newClients: data.total?.newClients ?? 0,
      percentNewClients: data.total?.percentNewClients ?? 0,
      percentReturningClients: data.total?.percentReturningClients ?? 0,
    };
    let locations = [...(data.locations ?? [])];

    // Sort locations data
    if (appointmentsSummarySortColumn) {
      locations.sort((a, b) => {
        const aVal = a[appointmentsSummarySortColumn as keyof typeof a];
        const bVal = b[appointmentsSummarySortColumn as keyof typeof b];
        
        // Try parsing as numbers (backend returns some numeric values as strings)
        const aNum = typeof aVal === 'number' ? aVal : parseFloat(String(aVal || '0'));
        const bNum = typeof bVal === 'number' ? bVal : parseFloat(String(bVal || '0'));
        
        // Use numeric comparison if both parse successfully, otherwise use string comparison
        const comparison = !isNaN(aNum) && !isNaN(bNum)
          ? aNum - bNum
          : String(aVal || '').localeCompare(String(bVal || ''));
        
        return appointmentsSummarySortDirection === 'asc' ? comparison : -comparison;
      });
    }

    const handleSort = (column: string) => {
      if (appointmentsSummarySortColumn === column) {
        setAppointmentsSummarySortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setAppointmentsSummarySortColumn(column);
        setAppointmentsSummarySortDirection('desc');
      }
    };

    return (
      <div className="space-y-6">
        <ReportHeader
          title="Appointments summary"
          description="General overview of appointment trends and patterns, including cancellations and no-shows."
        />

      <div className="flex items-center gap-4">
        <DateRangeFilter 
          value={dateRangeFilter} 
          onChange={setDateRangeFilter} 
        />
        <Button variant="outline" size="sm" data-testid="button-filters">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          Data from 12 mins ago
        </div>
        <Button variant="outline" size="sm" data-testid="button-customize">
          Customize
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('location')}
                      data-testid="button-sort-location"
                    >
                      Location
                      {appointmentsSummarySortColumn === 'location' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('appointments')}
                      data-testid="button-sort-appointments"
                    >
                      Appointments
                      {appointmentsSummarySortColumn === 'appointments' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('services')}
                      data-testid="button-sort-services"
                    >
                      Services
                      {appointmentsSummarySortColumn === 'services' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('percentRequested')}
                      data-testid="button-sort-percent-requested"
                    >
                      % requested
                      {appointmentsSummarySortColumn === 'percentRequested' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('totalApptValue')}
                      data-testid="button-sort-total-appt-value"
                    >
                      Total appt. value
                      {appointmentsSummarySortColumn === 'totalApptValue' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('averageApptValue')}
                      data-testid="button-sort-average-appt-value"
                    >
                      Average appt. value
                      {appointmentsSummarySortColumn === 'averageApptValue' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('percentOnline')}
                      data-testid="button-sort-percent-online"
                    >
                      % online
                      {appointmentsSummarySortColumn === 'percentOnline' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('percentCancelled')}
                      data-testid="button-sort-percent-cancelled"
                    >
                      % cancelled
                      {appointmentsSummarySortColumn === 'percentCancelled' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('percentNoShow')}
                      data-testid="button-sort-percent-no-show"
                    >
                      % no show
                      {appointmentsSummarySortColumn === 'percentNoShow' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('totalClients')}
                      data-testid="button-sort-total-clients"
                    >
                      Total clients
                      {appointmentsSummarySortColumn === 'totalClients' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('newClients')}
                      data-testid="button-sort-new-clients"
                    >
                      New clients
                      {appointmentsSummarySortColumn === 'newClients' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('percentNewClients')}
                      data-testid="button-sort-percent-new-clients"
                    >
                      % new clients
                      {appointmentsSummarySortColumn === 'percentNewClients' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('percentReturningClients')}
                      data-testid="button-sort-percent-returning-clients"
                    >
                      % returning clients
                      {appointmentsSummarySortColumn === 'percentReturningClients' ? (
                        appointmentsSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover-elevate">
                  <td className="p-3 font-semibold" data-testid="text-location-total">Total</td>
                  <td className="p-3">{total.appointments}</td>
                  <td className="p-3">{total.services}</td>
                  <td className="p-3">{formatPercent(total.percentRequested)}</td>
                  <td className="p-3">{formatCurrency(total.totalApptValue)}</td>
                  <td className="p-3">{formatCurrency(total.averageApptValue)}</td>
                  <td className="p-3">{formatPercent(total.percentOnline)}</td>
                  <td className="p-3">{formatPercent(total.percentCancelled)}</td>
                  <td className="p-3">{formatPercent(total.percentNoShow)}</td>
                  <td className="p-3">{total.totalClients}</td>
                  <td className="p-3">{total.newClients}</td>
                  <td className="p-3">{formatPercent(total.percentNewClients)}</td>
                  <td className="p-3">{formatPercent(total.percentReturningClients)}</td>
                </tr>
                {locations.length === 0 ? (
                  <tr className="text-center text-sm text-muted-foreground">
                    <td colSpan={13} className="p-8">
                      No appointment data available for the selected period
                    </td>
                  </tr>
                ) : (
                  locations.map((loc, index) => (
                    <tr key={loc.location || index} className="border-b hover-elevate">
                      <td className="p-3">{loc.location}</td>
                      <td className="p-3">{loc.appointments}</td>
                      <td className="p-3">{loc.services}</td>
                      <td className="p-3">{formatPercent(loc.percentRequested)}</td>
                      <td className="p-3">{formatCurrency(loc.totalApptValue)}</td>
                      <td className="p-3">{formatCurrency(loc.averageApptValue)}</td>
                      <td className="p-3">{formatPercent(loc.percentOnline)}</td>
                      <td className="p-3">{formatPercent(loc.percentCancelled)}</td>
                      <td className="p-3">{formatPercent(loc.percentNoShow)}</td>
                      <td className="p-3">{loc.totalClients}</td>
                      <td className="p-3">{loc.newClients}</td>
                      <td className="p-3">{formatPercent(loc.percentNewClients)}</td>
                      <td className="p-3">{formatPercent(loc.percentReturningClients)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderPaymentSummary = () => {
    if (isLoadingPaymentSummary) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    // Safely extract data with proper type validation
    const data = (paymentSummaryData as PaymentSummaryData) || {};
    const total = {
      paymentsCount: data.total?.paymentsCount ?? 0,
      paymentAmount: data.total?.paymentAmount ?? 0,
      refundsCount: data.total?.refundsCount ?? 0,
      refundsAmount: data.total?.refundsAmount ?? 0,
      netPayments: data.total?.netPayments ?? 0,
    };
    let payments = [...(data.payments ?? [])];

    // Sort payments data
    if (paymentSummarySortColumn) {
      payments.sort((a, b) => {
        const aVal = a[paymentSummarySortColumn as keyof typeof a];
        const bVal = b[paymentSummarySortColumn as keyof typeof b];
        
        // Try parsing as numbers (backend returns some numeric values as strings)
        const aNum = typeof aVal === 'number' ? aVal : parseFloat(String(aVal || '0'));
        const bNum = typeof bVal === 'number' ? bVal : parseFloat(String(bVal || '0'));
        
        // Use numeric comparison if both parse successfully, otherwise use string comparison
        const comparison = !isNaN(aNum) && !isNaN(bNum)
          ? aNum - bNum
          : String(aVal || '').localeCompare(String(bVal || ''));
        
        return paymentSummarySortDirection === 'asc' ? comparison : -comparison;
      });
    }

    const handleSort = (column: string) => {
      if (paymentSummarySortColumn === column) {
        setPaymentSummarySortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setPaymentSummarySortColumn(column);
        setPaymentSummarySortDirection('desc');
      }
    };

    return (
      <div className="space-y-6">
        <ReportHeader
          title="Payments summary"
          description="Payments split by payment methods."
        />

      <div className="flex items-center gap-4">
        <DateRangeFilter 
          value={dateRangeFilter} 
          onChange={setDateRangeFilter} 
        />
        <Button variant="outline" size="sm" data-testid="button-filters">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          Data from 12 mins ago
        </div>
        <Button variant="outline" size="sm" data-testid="button-customize">
          Customize
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('paymentMethod')}
                      data-testid="button-sort-payment-method"
                    >
                      Payment method
                      {paymentSummarySortColumn === 'paymentMethod' ? (
                        paymentSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('paymentsCount')}
                      data-testid="button-sort-payments-count"
                    >
                      No. of payments
                      {paymentSummarySortColumn === 'paymentsCount' ? (
                        paymentSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('paymentAmount')}
                      data-testid="button-sort-payment-amount"
                    >
                      Payment amount
                      {paymentSummarySortColumn === 'paymentAmount' ? (
                        paymentSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('refundsCount')}
                      data-testid="button-sort-refunds-count"
                    >
                      No. of refunds
                      {paymentSummarySortColumn === 'refundsCount' ? (
                        paymentSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('refundsAmount')}
                      data-testid="button-sort-refunds-amount"
                    >
                      Refunds
                      {paymentSummarySortColumn === 'refundsAmount' ? (
                        paymentSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 text-sm font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('netPayments')}
                      data-testid="button-sort-net-payments"
                    >
                      Net payments
                      {paymentSummarySortColumn === 'netPayments' ? (
                        paymentSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover-elevate font-semibold">
                  <td className="p-3" data-testid="text-payment-method-total">Total</td>
                  <td className="p-3">{total.paymentsCount}</td>
                  <td className="p-3">{formatCurrency(total.paymentAmount)}</td>
                  <td className="p-3">{total.refundsCount}</td>
                  <td className="p-3">{formatCurrency(total.refundsAmount)}</td>
                  <td className="p-3">{formatCurrency(total.netPayments)}</td>
                </tr>
                {payments.map((payment, index) => (
                  <tr key={payment.paymentMethod || index} className="border-b hover-elevate">
                    <td className="p-3">{payment.paymentMethod}</td>
                    <td className="p-3">{payment.paymentsCount}</td>
                    <td className="p-3">{formatCurrency(payment.paymentAmount)}</td>
                    <td className="p-3">{payment.refundsCount}</td>
                    <td className="p-3">{formatCurrency(payment.refundsAmount)}</td>
                    <td className="p-3">{formatCurrency(payment.netPayments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderFinanceSummary = () => {
    if (isLoadingFinanceSummary) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    // Safely extract data with proper type validation
    const data = (financeSummaryData as FinanceSummaryData) || {};
    const sales = {
      grossSales: data.sales?.grossSales ?? 0,
      discounts: data.sales?.discounts ?? 0,
      refunds: data.sales?.refunds ?? 0,
      netSales: data.sales?.netSales ?? 0,
    };
    const totalSales = {
      giftCardSales: data.totalSales?.giftCardSales ?? 0,
      serviceCharges: data.totalSales?.serviceCharges ?? 0,
      tips: data.totalSales?.tips ?? 0,
    };
    const payments = {
      card: data.payments?.card ?? 0,
      cash: data.payments?.cash ?? 0,
      online: data.payments?.online ?? 0,
    };
    const redemptions = data.redemptions ?? 0;
    
    const totalPayments = payments.card + payments.cash + payments.online;
    const totalSalesAmount = sales.netSales + totalSales.giftCardSales + totalSales.serviceCharges + totalSales.tips;

    return (
      <div className="space-y-6">
        <ReportHeader
          title="Finance summary"
          description="High-level summary of sales, payments and liabilities"
        />

        <div className="flex items-center gap-4">
          <DateRangeFilter 
            value={dateRangeFilter} 
            onChange={setDateRangeFilter} 
          />
          <Button variant="outline" size="sm" data-testid="button-filters">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">
            Data from moments ago
          </div>
          <Button variant="outline" size="sm" data-testid="button-customize">
            Customize
          </Button>
        </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-semibold w-64"></th>
                  <th className="text-left p-3 font-semibold">Total</th>
                  <th className="text-left p-3 font-semibold">Oct 2025</th>
                  <th className="text-left p-3 font-semibold">Sep 2025</th>
                  <th className="text-left p-3 font-semibold">Aug 2025</th>
                  <th className="text-left p-3 font-semibold">Jul 2025</th>
                  <th className="text-left p-3 font-semibold">Jun 2025</th>
                  <th className="text-left p-3 font-semibold">May 2025</th>
                </tr>
              </thead>
              <tbody>
                {/* Sales Section */}
                <tr className="font-semibold bg-muted/30">
                  <td className="p-3">Sales</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Gross sales</td>
                  <td className="p-3">{formatCurrency(sales.grossSales)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Discounts</td>
                  <td className="p-3">{formatCurrency(sales.discounts)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Refunds / Returns</td>
                  <td className="p-3">{formatCurrency(sales.refunds)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate font-semibold border-b">
                  <td className="p-3 pl-6">Net sales</td>
                  <td className="p-3">{formatCurrency(sales.netSales)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>

                {/* Total Sales Section */}
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Gift card sales</td>
                  <td className="p-3">{formatCurrency(totalSales.giftCardSales)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Service charges</td>
                  <td className="p-3">{formatCurrency(totalSales.serviceCharges)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Tips</td>
                  <td className="p-3">{formatCurrency(totalSales.tips)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate font-semibold border-b">
                  <td className="p-3">Total sales</td>
                  <td className="p-3">{formatCurrency(totalSalesAmount)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>

                {/* Payments Section */}
                <tr className="font-semibold bg-muted/30">
                  <td className="p-3">Payments</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Card</td>
                  <td className="p-3">{formatCurrency(payments.card)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Cash</td>
                  <td className="p-3">{formatCurrency(payments.cash)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Online</td>
                  <td className="p-3">{formatCurrency(payments.online)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate font-semibold border-b">
                  <td className="p-3">Total payments</td>
                  <td className="p-3">{formatCurrency(totalPayments)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>

                {/* Redemptions Section */}
                <tr className="font-semibold bg-muted/30">
                  <td className="p-3">Redemptions</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                </tr>
                <tr className="hover-elevate">
                  <td className="p-3 pl-6">Gift card redemptions</td>
                  <td className="p-3">{formatCurrency(redemptions)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
                <tr className="hover-elevate font-semibold">
                  <td className="p-3">Total redemptions</td>
                  <td className="p-3">{formatCurrency(redemptions)}</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                  <td className="p-3">AED 0.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderSalesList = () => {
    if (isLoadingSalesList) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    // Safely extract data with proper type validation
    const data = (salesListData as SalesListData) || {};
    const total = {
      itemsSold: data.total?.itemsSold ?? 0,
      totalSales: data.total?.totalSales ?? 0,
      giftCard: data.total?.giftCard ?? 0,
      serviceCharges: data.total?.serviceCharges ?? 0,
      amountDue: data.total?.amountDue ?? 0,
    };
    let sales = [...(data.sales ?? [])];

    // Sort sales data
    if (salesListSortColumn) {
      sales.sort((a, b) => {
        const aVal = a[salesListSortColumn as keyof typeof a];
        const bVal = b[salesListSortColumn as keyof typeof b];
        const comparison = typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal || '').localeCompare(String(bVal || ''));
        return salesListSortDirection === 'asc' ? comparison : -comparison;
      });
    }

    const handleSort = (column: string) => {
      if (salesListSortColumn === column) {
        setSalesListSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setSalesListSortColumn(column);
        setSalesListSortDirection('desc');
      }
    };

    return (
      <div className="space-y-6">
        <ReportHeader
          title="Sales list"
          description="Complete listing of all sales transactions."
        />

      <div className="flex items-center gap-4">
        <DateRangeFilter 
          value={dateRangeFilter} 
          onChange={setDateRangeFilter} 
        />
        <Button variant="outline" size="sm" data-testid="button-filters">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          Data from 10 mins ago
        </div>
        <Button variant="outline" size="sm" data-testid="button-customize">
          Customize
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('saleNo')}
                      data-testid="button-sort-sale-no"
                    >
                      Sale no.
                      {salesListSortColumn === 'saleNo' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('saleDate')}
                      data-testid="button-sort-sale-date"
                    >
                      Sale date
                      {salesListSortColumn === 'saleDate' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('saleStatus')}
                      data-testid="button-sort-sale-status"
                    >
                      Sale status
                      {salesListSortColumn === 'saleStatus' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('location')}
                      data-testid="button-sort-location"
                    >
                      Location
                      {salesListSortColumn === 'location' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('client')}
                      data-testid="button-sort-client"
                    >
                      Client
                      {salesListSortColumn === 'client' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('channel')}
                      data-testid="button-sort-channel"
                    >
                      Channel
                      {salesListSortColumn === 'channel' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('itemsSold')}
                      data-testid="button-sort-items-sold"
                    >
                      Items sold
                      {salesListSortColumn === 'itemsSold' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('totalSales')}
                      data-testid="button-sort-total-sales"
                    >
                      Total sales
                      {salesListSortColumn === 'totalSales' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('giftCard')}
                      data-testid="button-sort-gift-card"
                    >
                      Gift card
                      {salesListSortColumn === 'giftCard' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('serviceCharges')}
                      data-testid="button-sort-service-charges"
                    >
                      Service charges
                      {salesListSortColumn === 'serviceCharges' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('amountDue')}
                      data-testid="button-sort-amount-due"
                    >
                      Amount due
                      {salesListSortColumn === 'amountDue' ? (
                        salesListSortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover-elevate font-semibold">
                  <td className="p-3" data-testid="text-sales-total">Total</td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3"></td>
                  <td className="p-3">{total.itemsSold}</td>
                  <td className="p-3">{formatCurrency(total.totalSales)}</td>
                  <td className="p-3">{formatCurrency(total.giftCard)}</td>
                  <td className="p-3">{formatCurrency(total.serviceCharges)}</td>
                  <td className="p-3">{formatCurrency(total.amountDue)}</td>
                </tr>
                {sales.length === 0 ? (
                  <tr className="text-center text-muted-foreground">
                    <td colSpan={11} className="p-8">
                      No sales data available for the selected period
                    </td>
                  </tr>
                ) : (
                  sales.map((sale, index) => (
                    <tr key={sale.saleNo || index} className="border-b hover-elevate">
                      <td className="p-3">{sale.saleNo}</td>
                      <td className="p-3">{sale.saleDate}</td>
                      <td className="p-3">{sale.saleStatus}</td>
                      <td className="p-3">{sale.location}</td>
                      <td className="p-3">{sale.client}</td>
                      <td className="p-3">{sale.channel}</td>
                      <td className="p-3">{sale.itemsSold}</td>
                      <td className="p-3">{formatCurrency(sale.totalSales)}</td>
                      <td className="p-3">{formatCurrency(sale.giftCard)}</td>
                      <td className="p-3">{formatCurrency(sale.serviceCharges)}</td>
                      <td className="p-3">{formatCurrency(sale.amountDue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderSalesSummary = () => {
    if (isLoadingSalesSummary) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    // Safely extract data with proper type validation
    const data = (salesSummaryData as SalesSummaryData) || {};
    const total = {
      type: 'Total',
      salesQty: data.total?.salesQty ?? 0,
      itemsSold: data.total?.itemsSold ?? 0,
      grossSales: data.total?.grossSales ?? 0,
      totalDiscounts: data.total?.totalDiscounts ?? 0,
      refunds: data.total?.refunds ?? 0,
      netSales: data.total?.netSales ?? 0,
      taxes: data.total?.taxes ?? 0,
      totalSales: data.total?.totalSales ?? 0,
    };
    const service = {
      type: 'Service',
      salesQty: data.service?.salesQty ?? 0,
      itemsSold: data.service?.itemsSold ?? 0,
      grossSales: data.service?.grossSales ?? 0,
      totalDiscounts: data.service?.totalDiscounts ?? 0,
      refunds: data.service?.refunds ?? 0,
      netSales: data.service?.netSales ?? 0,
      taxes: data.service?.taxes ?? 0,
      totalSales: data.service?.totalSales ?? 0,
    };
    const product = {
      type: 'Product',
      salesQty: data.product?.salesQty ?? 0,
      itemsSold: data.product?.itemsSold ?? 0,
      grossSales: data.product?.grossSales ?? 0,
      totalDiscounts: data.product?.totalDiscounts ?? 0,
      refunds: data.product?.refunds ?? 0,
      netSales: data.product?.netSales ?? 0,
      taxes: data.product?.taxes ?? 0,
      totalSales: data.product?.totalSales ?? 0,
    };
    const memberships = {
      type: 'Memberships',
      salesQty: data.memberships?.salesQty ?? 0,
      itemsSold: data.memberships?.itemsSold ?? 0,
      grossSales: data.memberships?.grossSales ?? 0,
      totalDiscounts: data.memberships?.totalDiscounts ?? 0,
      refunds: data.memberships?.refunds ?? 0,
      netSales: data.memberships?.netSales ?? 0,
      taxes: data.memberships?.taxes ?? 0,
      totalSales: data.memberships?.totalSales ?? 0,
    };

    // Sort data rows (excluding Total)
    const dataRows = [service, product, memberships];
    if (salesSummarySortColumn) {
      dataRows.sort((a, b) => {
        const aVal = a[salesSummarySortColumn as keyof typeof a];
        const bVal = b[salesSummarySortColumn as keyof typeof b];
        const comparison = typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
        return salesSummarySortDirection === 'asc' ? comparison : -comparison;
      });
    }

    const handleSort = (column: string) => {
      if (salesSummarySortColumn === column) {
        setSalesSummarySortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setSalesSummarySortColumn(column);
        setSalesSummarySortDirection('desc');
      }
    };

    return (
      <div className="space-y-6">
        <ReportHeader
          title="Sales summary"
          description="Sales quantities and value, excluding tips and gift card sales."
        />

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>Type</Label>
          <Select defaultValue="all">
            <SelectTrigger className="w-44" data-testid="select-sales-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="service">Service</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="membership">Membership</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DateRangeFilter 
          value={dateRangeFilter} 
          onChange={setDateRangeFilter} 
        />
        <Button variant="outline" size="sm" data-testid="button-filters">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          Data from 8 mins ago
        </div>
        <Button variant="outline" size="sm" data-testid="button-customize">
          Customize
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('type')}
                      data-testid="button-sort-type"
                    >
                      Type 
                      {salesSummarySortColumn === 'type' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('salesQty')}
                      data-testid="button-sort-sales-qty"
                    >
                      Sales qty
                      {salesSummarySortColumn === 'salesQty' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('itemsSold')}
                      data-testid="button-sort-items-sold"
                    >
                      Items sold
                      {salesSummarySortColumn === 'itemsSold' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('grossSales')}
                      data-testid="button-sort-gross-sales"
                    >
                      Gross sales
                      {salesSummarySortColumn === 'grossSales' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('totalDiscounts')}
                      data-testid="button-sort-discounts"
                    >
                      Total discounts
                      {salesSummarySortColumn === 'totalDiscounts' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('refunds')}
                      data-testid="button-sort-refunds"
                    >
                      Refunds
                      {salesSummarySortColumn === 'refunds' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('netSales')}
                      data-testid="button-sort-net-sales"
                    >
                      Net sales
                      {salesSummarySortColumn === 'netSales' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('taxes')}
                      data-testid="button-sort-taxes"
                    >
                      Taxes
                      {salesSummarySortColumn === 'taxes' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                  <th className="text-left p-3 font-semibold">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-auto p-0 hover:bg-transparent"
                      onClick={() => handleSort('totalSales')}
                      data-testid="button-sort-total-sales"
                    >
                      Total sales
                      {salesSummarySortColumn === 'totalSales' ? (
                        salesSummarySortDirection === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 ml-1" />
                      )}
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover-elevate font-semibold">
                  <td className="p-3" data-testid="text-type-total">Total</td>
                  <td className="p-3">{total.salesQty}</td>
                  <td className="p-3">{total.itemsSold}</td>
                  <td className="p-3">{formatCurrency(total.grossSales)}</td>
                  <td className="p-3">{formatCurrency(total.totalDiscounts)}</td>
                  <td className="p-3">{formatCurrency(total.refunds)}</td>
                  <td className="p-3">{formatCurrency(total.netSales)}</td>
                  <td className="p-3">{formatCurrency(total.taxes)}</td>
                  <td className="p-3">{formatCurrency(total.totalSales)}</td>
                </tr>
                {dataRows.map((row) => (
                  <tr key={row.type} className="border-b hover-elevate text-primary">
                    <td className="p-3">
                      <a href="#" className="hover:underline">{row.type}</a>
                    </td>
                    <td className="p-3">{row.salesQty}</td>
                    <td className="p-3">{row.itemsSold}</td>
                    <td className="p-3">{formatCurrency(row.grossSales)}</td>
                    <td className="p-3">{formatCurrency(row.totalDiscounts)}</td>
                    <td className="p-3">{formatCurrency(row.refunds)}</td>
                    <td className="p-3">{formatCurrency(row.netSales)}</td>
                    <td className="p-3">{formatCurrency(row.taxes)}</td>
                    <td className="p-3">{formatCurrency(row.totalSales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    );
  };

  const renderContent = () => {
    switch (selectedReport) {
      case "appointments-summary":
        return renderAppointmentsSummary();
      case "payment-summary":
        return renderPaymentSummary();
      case "finance-summary":
        return renderFinanceSummary();
      case "sales-list":
        return renderSalesList();
      case "sales-summary":
        return renderSalesSummary();
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 space-y-6">
        <h1 className="text-xl font-bold">Finance & Accounting</h1>

        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Reports
          </h3>
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedReport(item.id)}
                className={`w-full flex items-start gap-3 px-3 py-2 rounded-md text-sm transition-colors hover-elevate ${
                  selectedReport === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent"
                }`}
                data-testid={`nav-${item.id}`}
              >
                <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-medium">{item.label}</div>
                  {selectedReport === item.id && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {item.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}
