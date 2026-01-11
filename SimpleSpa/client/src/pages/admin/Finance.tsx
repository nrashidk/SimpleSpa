import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, FileText, Download, Calendar, Plus, Receipt, Home, Zap, Package as PackageIcon, Users as UsersIcon, MoreHorizontal, Trash2, Building2, ShoppingCart, Pencil, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { calculateTaxInclusive, calculateNetVAT, formatCurrency } from "@shared/taxUtils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Vendor, Expense, Bill } from "@shared/schema";
import { FTACompliance } from "@/components/FTACompliance";

const expenseFormSchema = z.object({
  category: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  amount: z.string().min(1, "Amount is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Amount must be a positive number"),
  date: z.string().min(1, "Date is required"),
});

const vendorFormSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});

const billFormSchema = z.object({
  billNumber: z.string().min(1, "Bill number is required"),
  vendorId: z.string().min(1, "Vendor is required"),
  billDate: z.string().min(1, "Bill date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  totalAmount: z.string().min(1, "Total amount (tax-inclusive) is required").refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Must be a positive number"),
  category: z.string().optional(),
  notes: z.string().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;
type VendorFormValues = z.infer<typeof vendorFormSchema>;
type BillFormValues = z.infer<typeof billFormSchema>;

type BillWithVendor = Bill & { vendorName?: string };

export default function AdminFinance() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<BillWithVendor | null>(null);
  
  // UAE VAT rate (5%)
  const TAX_RATE = 5;

  const expenseCategories = [
    { value: "rent", label: "Rent", icon: Home },
    { value: "utilities", label: "Utilities", icon: Zap },
    { value: "materials", label: "Raw Materials", icon: PackageIcon },
    { value: "salaries", label: "Salaries & Wages", icon: UsersIcon },
    { value: "marketing", label: "Marketing", icon: FileText },
    { value: "other", label: "Other", icon: MoreHorizontal },
  ];

  const vendorCategories = [
    { value: "supplier", label: "Supplier" },
    { value: "utility_provider", label: "Utility Provider" },
    { value: "landlord", label: "Landlord" },
    { value: "service_provider", label: "Service Provider" },
    { value: "contractor", label: "Contractor" },
    { value: "other", label: "Other" },
  ];

  const paymentTermOptions = [
    { value: "immediate", label: "Immediate" },
    { value: "net_15", label: "Net 15" },
    { value: "net_30", label: "Net 30" },
    { value: "net_60", label: "Net 60" },
    { value: "net_90", label: "Net 90" },
  ];

  // Fetch data with React Query
  const { data: vendors = [], isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ['/api/admin/vendors'],
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ['/api/admin/expenses'],
  });

  const { data: bills = [], isLoading: billsLoading } = useQuery<BillWithVendor[]>({
    queryKey: ['/api/admin/bills'],
  });

  // Fetch revenue summary for VAT collected
  const { data: revenueSummary } = useQuery<{
    bookingsTotal: string;
    productSalesTotal: string;
    loyaltyCardsTotal: string;
    totalRevenue: string;
    vatCollected: string;
    totalDiscounts: string;
  }>({
    queryKey: ['/api/admin/revenue-summary'],
  });

  // Fetch VAT payable summary
  const { data: vatPayableSummary } = useQuery<{
    vatCollected: string;
    vatPaid: string;
    vatPayable: string;
  }>({
    queryKey: ['/api/admin/vat-payable'],
  });

  // Expense mutations
  const createExpenseMutation = useMutation({
    mutationFn: async (data: { category: string; description: string; amount: number; expenseDate: string }) => {
      return apiRequest('POST', '/api/admin/expenses', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/expenses'] });
      toast({
        title: "Expense added",
        description: "The expense has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PUT', `/api/admin/expenses/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/expenses'] });
      toast({
        title: "Expense updated",
        description: "The expense has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/expenses'] });
      toast({
        title: "Expense deleted",
        description: "The expense has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete expense. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Vendor mutations
  const createVendorMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/vendors', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/vendors'] });
      toast({
        title: "Vendor added",
        description: "The vendor has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add vendor. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateVendorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PUT', `/api/admin/vendors/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/vendors'] });
      toast({
        title: "Vendor updated",
        description: "The vendor has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update vendor. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteVendorMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/vendors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/vendors'] });
      toast({
        title: "Vendor deleted",
        description: "The vendor has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete vendor. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Bill mutations
  const createBillMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/bills', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bills'] });
      toast({
        title: "Bill added",
        description: "The bill has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add bill. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateBillMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PUT', `/api/admin/bills/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bills'] });
      toast({
        title: "Bill updated",
        description: "The bill has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update bill. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteBillMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/bills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bills'] });
      toast({
        title: "Bill deleted",
        description: "The bill has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete bill. Please try again.",
        variant: "destructive",
      });
    },
  });

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      category: "",
      description: "",
      amount: "",
      date: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const handleAddExpense = (values: ExpenseFormValues) => {
    createExpenseMutation.mutate({
      category: values.category,
      description: values.description,
      amount: Number(values.amount),
      expenseDate: values.date,
    });
    form.reset();
    setIsAddExpenseOpen(false);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    form.reset({
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      date: format(new Date(expense.expenseDate), "yyyy-MM-dd"),
    });
    setIsAddExpenseOpen(true);
  };

  const handleUpdateExpense = (values: ExpenseFormValues) => {
    if (!editingExpense) return;
    
    updateExpenseMutation.mutate({
      id: editingExpense.id,
      data: {
        category: values.category,
        description: values.description,
        amount: Number(values.amount),
        expenseDate: values.date,
      },
    });
    form.reset();
    setEditingExpense(null);
    setIsAddExpenseOpen(false);
  };

  const handleDeleteExpense = (id: number) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      deleteExpenseMutation.mutate(id);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsAddExpenseOpen(open);
    if (!open) {
      setEditingExpense(null);
      form.reset({
        category: "",
        description: "",
        amount: "",
        date: format(new Date(), "yyyy-MM-dd"),
      });
    }
  };

  // Vendor form and handlers
  const vendorForm = useForm<VendorFormValues>({
    resolver: zodResolver(vendorFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      category: "",
      paymentTerms: "",
      notes: "",
    },
  });

  const handleAddVendor = (values: VendorFormValues) => {
    createVendorMutation.mutate({
      name: values.name,
      email: values.email || undefined,
      phone: values.phone || undefined,
      address: values.address || undefined,
      category: values.category,
      paymentTerms: values.paymentTerms || undefined,
      notes: values.notes || undefined,
    });
    vendorForm.reset();
    setIsAddVendorOpen(false);
  };

  const handleEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    vendorForm.reset({
      name: vendor.name,
      email: vendor.email || "",
      phone: vendor.phone || "",
      address: vendor.address || "",
      category: vendor.category || "",
      paymentTerms: vendor.paymentTerms || "",
      notes: vendor.notes || "",
    });
    setIsAddVendorOpen(true);
  };

  const handleUpdateVendor = (values: VendorFormValues) => {
    if (!editingVendor) return;
    
    updateVendorMutation.mutate({
      id: editingVendor.id,
      data: {
        name: values.name,
        email: values.email || undefined,
        phone: values.phone || undefined,
        address: values.address || undefined,
        category: values.category,
        paymentTerms: values.paymentTerms || undefined,
        notes: values.notes || undefined,
      },
    });
    vendorForm.reset();
    setEditingVendor(null);
    setIsAddVendorOpen(false);
  };

  const handleDeleteVendor = (id: number) => {
    if (confirm('Are you sure you want to delete this vendor?')) {
      deleteVendorMutation.mutate(id);
    }
  };

  const handleVendorDialogClose = (open: boolean) => {
    setIsAddVendorOpen(open);
    if (!open) {
      setEditingVendor(null);
      vendorForm.reset({
        name: "",
        email: "",
        phone: "",
        address: "",
        category: "",
        paymentTerms: "",
        notes: "",
      });
    }
  };

  // Bill form and handlers
  const billForm = useForm<BillFormValues>({
    resolver: zodResolver(billFormSchema),
    defaultValues: {
      billNumber: "",
      vendorId: "",
      billDate: format(new Date(), "yyyy-MM-dd"),
      dueDate: format(new Date(), "yyyy-MM-dd"),
      totalAmount: "",
      category: "",
      notes: "",
    },
  });
  
  // Watch totalAmount to show tax breakdown in real-time
  const watchedTotalAmount = billForm.watch("totalAmount");
  const billTaxBreakdown = watchedTotalAmount && !isNaN(Number(watchedTotalAmount)) 
    ? calculateTaxInclusive(Number(watchedTotalAmount), TAX_RATE)
    : null;

  const handleAddBill = (values: BillFormValues) => {
    const totalAmount = Number(values.totalAmount);
    
    // Calculate tax breakdown using UAE VAT (tax-inclusive)
    const taxBreakdown = calculateTaxInclusive(totalAmount, TAX_RATE);
    
    createBillMutation.mutate({
      billNumber: values.billNumber,
      vendorId: Number(values.vendorId),
      billDate: values.billDate,
      dueDate: values.dueDate,
      subtotal: taxBreakdown.netAmount,
      taxAmount: taxBreakdown.taxAmount,
      totalAmount: taxBreakdown.totalAmount,
      category: values.category || undefined,
      notes: values.notes || undefined,
    });
    billForm.reset();
    setIsAddBillOpen(false);
  };

  const handleEditBill = (bill: BillWithVendor) => {
    setEditingBill(bill);
    billForm.reset({
      billNumber: bill.billNumber,
      vendorId: bill.vendorId.toString(),
      billDate: format(new Date(bill.billDate), "yyyy-MM-dd"),
      dueDate: format(new Date(bill.dueDate), "yyyy-MM-dd"),
      totalAmount: bill.totalAmount.toString(),
      category: bill.category || "",
      notes: bill.notes || "",
    });
    setIsAddBillOpen(true);
  };

  const handleUpdateBill = (values: BillFormValues) => {
    if (!editingBill) return;
    
    const totalAmount = Number(values.totalAmount);
    
    // Calculate tax breakdown using UAE VAT (tax-inclusive)
    const taxBreakdown = calculateTaxInclusive(totalAmount, TAX_RATE);
    
    updateBillMutation.mutate({
      id: editingBill.id,
      data: {
        billNumber: values.billNumber,
        vendorId: Number(values.vendorId),
        billDate: values.billDate,
        dueDate: values.dueDate,
        subtotal: taxBreakdown.netAmount,
        taxAmount: taxBreakdown.taxAmount,
        totalAmount: taxBreakdown.totalAmount,
        category: values.category || undefined,
        notes: values.notes || undefined,
      },
    });
    billForm.reset();
    setEditingBill(null);
    setIsAddBillOpen(false);
  };

  const handleDeleteBill = (id: number) => {
    if (confirm('Are you sure you want to delete this bill?')) {
      deleteBillMutation.mutate(id);
    }
  };

  const handleBillDialogClose = (open: boolean) => {
    setIsAddBillOpen(open);
    if (!open) {
      setEditingBill(null);
      billForm.reset({
        billNumber: "",
        vendorId: "",
        billDate: format(new Date(), "yyyy-MM-dd"),
        dueDate: format(new Date(), "yyyy-MM-dd"),
        totalAmount: "",
        category: "",
        notes: "",
      });
    }
  };

  const getBillStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
      case "unpaid":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
      case "overdue":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
      case "partial":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
      default:
        return "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400";
    }
  };

  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const totalRevenue = Number(revenueSummary?.totalRevenue || 0);
  const netProfit = totalRevenue - totalExpenses;
  
  // Use VAT data from API
  const vatCollectedFromSales = Number(revenueSummary?.vatCollected || 0);
  const vatPaidOnBills = Number(vatPayableSummary?.vatPaid || 0);
  const netVATPayable = Number(vatPayableSummary?.vatPayable || 0);

  const expensesByCategory = expenseCategories.map(cat => {
    const categoryExpenses = expenses.filter(e => e.category === cat.value);
    const total = categoryExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const percentage = totalExpenses > 0 ? ((total / totalExpenses) * 100).toFixed(1) : "0";
    return {
      ...cat,
      total,
      percentage,
      count: categoryExpenses.length,
    };
  }).filter(cat => cat.total > 0);

  const getCategoryIcon = (category: string) => {
    const cat = expenseCategories.find(c => c.value === category);
    return cat?.icon || MoreHorizontal;
  };

  const getCategoryLabel = (category: string) => {
    const cat = expenseCategories.find(c => c.value === category);
    return cat?.label || category;
  };

  const financialStats = [
    {
      title: "Total Revenue (Month)",
      value: `AED ${totalRevenue.toLocaleString()}`,
      change: "No data",
      icon: DollarSign,
    },
    {
      title: "Pending Payments",
      value: "AED 0",
      change: "0 invoices",
      icon: FileText,
    },
    {
      title: "Expenses (Month)",
      value: `AED ${totalExpenses.toLocaleString()}`,
      change: `${expenses.length} expenses`,
      icon: Receipt,
    },
    {
      title: "Net Profit (Month)",
      value: `AED ${netProfit.toLocaleString()}`,
      change: "No data",
      icon: TrendingUp,
    },
  ];

  const recentInvoices: any[] = [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
      case "pending":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
      case "overdue":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
      default:
        return "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400";
    }
  };

  const getVendorCategoryLabel = (category: string) => {
    const cat = vendorCategories.find(c => c.value === category);
    return cat?.label || category;
  };

  const getPaymentTermsLabel = (terms?: string) => {
    const term = paymentTermOptions.find(t => t.value === terms);
    return term?.label || terms || "N/A";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="finance-title">Finance & Accounting</h1>
          <p className="text-muted-foreground">Manage expenses, vendors, bills and financial reports</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="vat-report" data-testid="tab-vat-report">VAT Report</TabsTrigger>
          <TabsTrigger value="fta-compliance" data-testid="tab-fta-compliance">FTA Compliance</TabsTrigger>
          <TabsTrigger value="expenses" data-testid="tab-expenses">Expenses</TabsTrigger>
          <TabsTrigger value="vendors" data-testid="tab-vendors">Vendors</TabsTrigger>
          <TabsTrigger value="bills" data-testid="tab-bills">Bills</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {financialStats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* UAE VAT Summary */}
      <Card>
        <CardHeader>
          <CardTitle>UAE VAT Summary</CardTitle>
          <p className="text-sm text-muted-foreground">Tax-inclusive pricing with automatic deductions</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="text-sm">
                  <p className="font-medium mb-2">How UAE VAT Works:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Service prices <strong>include</strong> 5% VAT (not added separately)</li>
                    <li>Bills/expenses also <strong>include</strong> 5% VAT (deductible)</li>
                    <li>Net VAT = (Tax collected from customers) - (Tax paid on expenses)</li>
                    <li>Pay only the <strong>net difference</strong> to tax authorities</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg">
                <div className="text-sm font-medium text-muted-foreground">VAT Collected</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="vat-collected">
                  {formatCurrency(vatCollectedFromSales)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">From bookings, sales & loyalty cards</p>
              </div>

              <div className="p-4 border rounded-lg">
                <div className="text-sm font-medium text-muted-foreground">VAT Paid</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="vat-paid">
                  {formatCurrency(vatPaidOnBills)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">On vendor bills & expenses</p>
              </div>

              <div className="p-4 border rounded-lg bg-primary/5">
                <div className="text-sm font-medium text-muted-foreground">Net VAT Payable</div>
                <div className={`text-2xl font-bold ${netVATPayable >= 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`} data-testid="vat-net-payable">
                  {formatCurrency(Math.abs(netVATPayable))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {netVATPayable >= 0 ? 'Owed to tax authorities' : 'Tax credit/refund'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Invoices</CardTitle>
            <Button variant="outline" size="sm" data-testid="button-export-invoices">
              <Download className="h-3 w-3 mr-1" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                data-testid={`invoice-${invoice.id}`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div>
                    <p className="font-semibold">{invoice.invoiceNumber}</p>
                    <p className="text-sm text-muted-foreground">{invoice.customer}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-semibold">AED {invoice.amount}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(invoice.date, "MMM d, yyyy")}
                    </p>
                  </div>
                  <Badge className={getStatusColor(invoice.status)}>
                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </Badge>
                  {invoice.paymentMethod && (
                    <Badge variant="secondary">{invoice.paymentMethod}</Badge>
                  )}
                  <Button variant="outline" size="sm" data-testid={`button-view-invoice-${invoice.id}`}>
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        {/* VAT Payable Report Tab */}
        <TabsContent value="vat-report" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>VAT Payable Report</CardTitle>
              <p className="text-sm text-muted-foreground">Detailed breakdown of VAT collected vs VAT paid</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Revenue Breakdown with Discounts */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Revenue Breakdown (After Discounts)</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium text-muted-foreground">Service Revenue (Net)</div>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency(Number(revenueSummary?.bookingsTotal || 0) + Number(revenueSummary?.loyaltyCardsTotal || 0))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Bookings + Loyalty card bundles (after discounts)</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium text-muted-foreground">Product Sales (Net)</div>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency(Number(revenueSummary?.productSalesTotal || 0))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Retail products (after discounts)</p>
                    </div>
                  </div>

                  {Number(revenueSummary?.totalDiscounts || 0) > 0 && (
                    <div className="mt-4 p-4 border border-orange-200 dark:border-orange-900 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">Total Discounts Applied</div>
                          <p className="text-xs text-muted-foreground mt-1">Flat rate and percentage discounts on services and products</p>
                        </div>
                        <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                          -{formatCurrency(Number(revenueSummary?.totalDiscounts || 0))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* VAT Collected Breakdown */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">VAT Collected from Sales & Services</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium text-muted-foreground">Service Revenue VAT</div>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency(((Number(revenueSummary?.bookingsTotal || 0) + Number(revenueSummary?.loyaltyCardsTotal || 0)) * 5) / 105)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">VAT from bookings & loyalty bundles (net amount)</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium text-muted-foreground">Product Sales VAT</div>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency((Number(revenueSummary?.productSalesTotal || 0) * 5) / 105)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">VAT from retail products (net amount)</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Total Revenue (Tax-Inclusive)</div>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {formatCurrency(Number(revenueSummary?.totalRevenue || 0))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-blue-900 dark:text-blue-100">VAT Collected (5%)</div>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {formatCurrency(vatCollectedFromSales)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* VAT Paid Breakdown */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">VAT Paid on Expenses & Bills</h3>
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-green-900 dark:text-green-100">Total Bills Amount</div>
                        <div className="text-xl font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(bills.reduce((sum, bill) => sum + Number(bill.totalAmount), 0))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-green-900 dark:text-green-100">VAT Paid (Deductible)</div>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(vatPaidOnBills)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net VAT Payable */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Net VAT Calculation</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border-b">
                      <span className="text-muted-foreground">VAT Collected from Customers</span>
                      <span className="font-semibold">{formatCurrency(vatCollectedFromSales)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 border-b">
                      <span className="text-muted-foreground">VAT Paid to Vendors</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">- {formatCurrency(vatPaidOnBills)}</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
                      <div>
                        <div className="text-sm font-medium text-orange-900 dark:text-orange-100">Net VAT Payable to Tax Authority</div>
                        <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">Amount to be paid to UAE Tax Authority</p>
                      </div>
                      <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                        {formatCurrency(Math.abs(netVATPayable))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info Alert */}
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="text-sm">
                      <strong>How to File:</strong> Submit this net VAT amount ({formatCurrency(Math.abs(netVATPayable))}) 
                      to the UAE Federal Tax Authority through their online portal. Filing is typically done quarterly.
                    </p>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Expense Tracking</CardTitle>
            <Dialog open={isAddExpenseOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-expense">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingExpense ? "Edit Expense" : "Add New Expense"}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(editingExpense ? handleUpdateExpense : handleAddExpense)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-expense-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {expenseCategories.map((cat) => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter expense description" data-testid="input-expense-description" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (AED)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" data-testid="input-expense-amount" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date</FormLabel>
                          <FormControl>
                            <Input type="date" data-testid="input-expense-date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1" data-testid="button-save-expense">
                        {editingExpense ? "Update Expense" : "Save Expense"}
                      </Button>
                      <Button type="button" variant="outline" className="flex-1" onClick={() => handleDialogClose(false)} data-testid="button-cancel-expense">
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {expensesLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading expenses...
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No expenses found
              </div>
            ) : (
              expenses.map((expense) => {
                const CategoryIcon = getCategoryIcon(expense.category);
                return (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                    data-testid={`expense-${expense.id}`}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CategoryIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{expense.description}</p>
                        <p className="text-sm text-muted-foreground">{getCategoryLabel(expense.category)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">AED {Number(expense.amount).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(expense.expenseDate), "MMM d, yyyy")}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleEditExpense(expense)}
                        data-testid={`button-edit-expense-${expense.id}`}
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                        onClick={() => handleDeleteExpense(expense.id)}
                        data-testid={`button-delete-expense-${expense.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expensesByCategory.map((category) => {
                const CategoryIcon = category.icon;
                return (
                  <div key={category.value} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CategoryIcon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-muted-foreground">{category.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">AED {category.total.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{category.percentage}% ({category.count} items)</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Methods (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cash</span>
                <div className="text-right">
                  <p className="font-semibold">AED 18,500</p>
                  <p className="text-xs text-muted-foreground">41%</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Card</span>
                <div className="text-right">
                  <p className="font-semibold">AED 22,100</p>
                  <p className="text-xs text-muted-foreground">49%</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Online</span>
                <div className="text-right">
                  <p className="font-semibold">AED 4,630</p>
                  <p className="text-xs text-muted-foreground">10%</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
        </TabsContent>

        {/* Vendors Tab */}
        <TabsContent value="vendors" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Vendor Management</CardTitle>
                <Dialog open={isAddVendorOpen} onOpenChange={handleVendorDialogClose}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-vendor">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Vendor
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{editingVendor ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
                    </DialogHeader>
                    <Form {...vendorForm}>
                      <form onSubmit={vendorForm.handleSubmit(editingVendor ? handleUpdateVendor : handleAddVendor)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={vendorForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel>Vendor Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter vendor name" data-testid="input-vendor-name" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={vendorForm.control}
                            name="category"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Category *</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-vendor-category">
                                      <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {vendorCategories.map((cat) => (
                                      <SelectItem key={cat.value} value={cat.value}>
                                        {cat.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={vendorForm.control}
                            name="paymentTerms"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Payment Terms</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-vendor-payment-terms">
                                      <SelectValue placeholder="Select terms" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {paymentTermOptions.map((term) => (
                                      <SelectItem key={term.value} value={term.value}>
                                        {term.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={vendorForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input type="email" placeholder="vendor@example.com" data-testid="input-vendor-email" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={vendorForm.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone</FormLabel>
                                <FormControl>
                                  <Input placeholder="+971 50 123 4567" data-testid="input-vendor-phone" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={vendorForm.control}
                            name="address"
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel>Address</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter address" data-testid="input-vendor-address" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={vendorForm.control}
                            name="notes"
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                  <Textarea placeholder="Additional notes about the vendor" data-testid="textarea-vendor-notes" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button type="submit" className="flex-1" data-testid="button-save-vendor">
                            {editingVendor ? "Update Vendor" : "Save Vendor"}
                          </Button>
                          <Button type="button" variant="outline" className="flex-1" onClick={() => handleVendorDialogClose(false)} data-testid="button-cancel-vendor">
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {vendorsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading vendors...
                  </div>
                ) : vendors.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No vendors found
                  </div>
                ) : (
                  vendors.map((vendor) => (
                    <div
                      key={vendor.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                      data-testid={`vendor-${vendor.id}`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{vendor.name}</p>
                          <p className="text-sm text-muted-foreground">{getVendorCategoryLabel(vendor.category || "")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Payment Terms:</p>
                          <p className="text-sm font-medium">{getPaymentTermsLabel(vendor.paymentTerms ?? undefined)}</p>
                        </div>
                        {vendor.email && (
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Email:</p>
                            <p className="text-sm">{vendor.email}</p>
                          </div>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleEditVendor(vendor)}
                          data-testid={`button-edit-vendor-${vendor.id}`}
                        >
                          Edit
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleDeleteVendor(vendor.id)}
                          data-testid={`button-delete-vendor-${vendor.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bills Tab */}
        <TabsContent value="bills" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Bills & Purchase Invoices</CardTitle>
                <Dialog open={isAddBillOpen} onOpenChange={handleBillDialogClose}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-bill">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Bill
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{editingBill ? "Edit Bill" : "Add New Bill"}</DialogTitle>
                    </DialogHeader>
                    <Form {...billForm}>
                      <form onSubmit={billForm.handleSubmit(editingBill ? handleUpdateBill : handleAddBill)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={billForm.control}
                            name="billNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bill Number *</FormLabel>
                                <FormControl>
                                  <Input placeholder="BILL-001" data-testid="input-bill-number" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={billForm.control}
                            name="vendorId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Vendor *</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-bill-vendor">
                                      <SelectValue placeholder="Select vendor" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {vendors.map((vendor) => (
                                      <SelectItem key={vendor.id} value={vendor.id.toString()}>
                                        {vendor.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={billForm.control}
                            name="billDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bill Date *</FormLabel>
                                <FormControl>
                                  <Input type="date" data-testid="input-bill-date" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={billForm.control}
                            name="dueDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Due Date *</FormLabel>
                                <FormControl>
                                  <Input type="date" data-testid="input-bill-due-date" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={billForm.control}
                            name="totalAmount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Total Amount - Tax Inclusive (AED) *</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" placeholder="0.00" data-testid="input-bill-total" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          {billTaxBreakdown && (
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span>Net Amount:</span>
                                    <span className="font-semibold">{formatCurrency(billTaxBreakdown.netAmount)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>VAT (5% deductible):</span>
                                    <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(billTaxBreakdown.taxAmount)}</span>
                                  </div>
                                  <div className="flex justify-between border-t pt-1">
                                    <span className="font-medium">Total:</span>
                                    <span className="font-semibold">{formatCurrency(billTaxBreakdown.totalAmount)}</span>
                                  </div>
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}
                          <FormField
                            control={billForm.control}
                            name="category"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-bill-category">
                                      <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {expenseCategories.map((cat) => (
                                      <SelectItem key={cat.value} value={cat.value}>
                                        {cat.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={billForm.control}
                            name="notes"
                            render={({ field }) => (
                              <FormItem className="col-span-2">
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                  <Textarea placeholder="Additional notes" data-testid="textarea-bill-notes" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button type="submit" className="flex-1" data-testid="button-save-bill">
                            {editingBill ? "Update Bill" : "Save Bill"}
                          </Button>
                          <Button type="button" variant="outline" className="flex-1" onClick={() => handleBillDialogClose(false)} data-testid="button-cancel-bill">
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {billsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading bills...
                  </div>
                ) : bills.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No bills found
                  </div>
                ) : (
                  bills.map((bill) => (
                    <div
                      key={bill.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                      data-testid={`bill-${bill.id}`}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{bill.billNumber}</p>
                          <p className="text-sm text-muted-foreground">{bill.vendorName || `Vendor #${bill.vendorId}`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Amount:</p>
                          <p className="font-semibold">AED {Number(bill.totalAmount).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Due Date:</p>
                          <p className="text-sm">{format(new Date(bill.dueDate), "MMM dd, yyyy")}</p>
                        </div>
                        <Badge className={getBillStatusColor(bill.status)}>{bill.status}</Badge>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleEditBill(bill)}
                          data-testid={`button-edit-bill-${bill.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => handleDeleteBill(bill.id)}
                          data-testid={`button-delete-bill-${bill.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FTA Compliance Tab */}
        <TabsContent value="fta-compliance">
          <FTACompliance />
        </TabsContent>
      </Tabs>
    </div>
  );
}
