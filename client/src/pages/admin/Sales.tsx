import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { Calendar, Download, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Booking, BookingItem, Service, ProductSale, LoyaltyCard } from "@shared/schema";
import { ProductSaleDialog } from "@/components/ProductSaleDialog";
import { LoyaltyCardDialog } from "@/components/LoyaltyCardDialog";

export default function AdminSales() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isAddSaleOpen, setIsAddSaleOpen] = useState(false);
  const [isProductSaleOpen, setIsProductSaleOpen] = useState(false);
  const [isLoyaltyCardOpen, setIsLoyaltyCardOpen] = useState(false);
  
  // Add sale form state
  const [saleType, setSaleType] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  // Fetch data
  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['/api/admin/bookings'],
  });

  const { data: bookingItems = [] } = useQuery<BookingItem[]>({
    queryKey: ['/api/admin/booking-items'],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ['/api/admin/services'],
  });

  const { data: productSales = [] } = useQuery<ProductSale[]>({
    queryKey: ['/api/admin/product-sales'],
  });

  const { data: loyaltyCards = [] } = useQuery<LoyaltyCard[]>({
    queryKey: ['/api/admin/loyalty-cards'],
  });

  // Mutation to create a sale
  const createSaleMutation = useMutation({
    mutationFn: async (saleData: {
      transactionType: string;
      amount: string;
      paymentMethod: string;
      notes?: string;
    }) => {
      return await apiRequest('POST', '/api/admin/sales', saleData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/product-sales'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/loyalty-cards'] });
      toast({
        title: "Sale added",
        description: "The sale has been recorded successfully.",
      });
      setIsAddSaleOpen(false);
      // Reset form
      setSaleType("");
      setSaleAmount("");
      setPaymentMethod("");
      setSaleNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create sale",
        variant: "destructive",
      });
    },
  });

  // Filter bookings for selected date
  const dailyBookings = bookings.filter(b => {
    const bookingDate = new Date(b.bookingDate);
    return format(bookingDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
  });

  // Filter product sales for selected date
  const dailyProductSales = productSales.filter(p => {
    const saleDate = new Date(p.saleDate);
    return format(saleDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
  });

  // Filter loyalty cards for selected date
  const dailyLoyaltyCards = loyaltyCards.filter(lc => {
    const purchaseDate = new Date(lc.purchaseDate);
    return format(purchaseDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
  });

  // Calculate totals
  const servicesTotal = dailyBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + parseFloat(b.totalAmount?.toString() || '0'), 0);

  const productsTotal = dailyProductSales
    .reduce((sum, p) => sum + parseFloat(p.totalPrice?.toString() || '0'), 0);

  const loyaltyCardsTotal = dailyLoyaltyCards
    .reduce((sum, lc) => sum + parseFloat(lc.purchasePrice?.toString() || '0'), 0);

  const grandTotal = servicesTotal + productsTotal + loyaltyCardsTotal;

  // Calculate transaction summary
  const transactionSummary = [
    {
      itemType: 'Services',
      itemsSold: dailyBookings.filter(b => b.status === 'completed').length,
      refunds: 0,
      grossTotal: servicesTotal.toFixed(2),
    },
    {
      itemType: 'Service with add-on',
      itemsSold: 0,
      refunds: 0,
      grossTotal: '0.00',
    },
    {
      itemType: 'Products',
      itemsSold: dailyProductSales.length,
      refunds: 0,
      grossTotal: productsTotal.toFixed(2),
    },
    {
      itemType: 'Vouchers',
      itemsSold: 0,
      refunds: 0,
      grossTotal: '0.00',
    },
    {
      itemType: 'Shipping',
      itemsSold: 0,
      refunds: 0,
      grossTotal: '0.00',
    },
    {
      itemType: 'Loyalty cards',
      itemsSold: dailyLoyaltyCards.length,
      refunds: 0,
      grossTotal: loyaltyCardsTotal.toFixed(2),
    },
    {
      itemType: 'Memberships',
      itemsSold: 0,
      refunds: 0,
      grossTotal: '0.00',
    },
    {
      itemType: 'Late cancellation fee',
      itemsSold: 0,
      refunds: 0,
      grossTotal: '0.00',
    },
    {
      itemType: 'No show fee',
      itemsSold: dailyBookings.filter(b => b.status === 'no-show').length,
      refunds: 0,
      grossTotal: '0.00',
    },
    {
      itemType: 'Refund amount',
      itemsSold: 0,
      refunds: 0,
      grossTotal: '0.00',
    },
    {
      itemType: 'Total Sales',
      itemsSold: 0,
      refunds: 0,
      grossTotal: grandTotal.toFixed(2),
    },
  ];

  // Calculate cash movement summary
  const paymentsCollected = dailyBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + parseFloat(b.totalAmount?.toString() || '0'), 0);

  const cashMovementSummary = [
    {
      type: 'Payment type',
      paymentsCollected: 'Payments collected',
      depositsCollected: 'Deposits collected',
      refundsCollected: 'Refunds collected',
      lateCancellationsFee: 'Late cancellations fee',
    },
    {
      type: 'Total online',
      paymentsCollected: '0.00',
      depositsCollected: '0.00',
      refundsCollected: '0.00',
      lateCancellationsFee: '0.00',
    },
    {
      type: 'Cash',
      paymentsCollected: paymentsCollected.toFixed(2),
      depositsCollected: '0.00',
      refundsCollected: '0.00',
      lateCancellationsFee: '0.00',
    },
    {
      type: 'Card',
      paymentsCollected: '0.00',
      depositsCollected: '0.00',
      refundsCollected: '0.00',
      lateCancellationsFee: '0.00',
    },
    {
      type: 'Gift card redemptions',
      paymentsCollected: '0.00',
      depositsCollected: '0.00',
      refundsCollected: '0.00',
      lateCancellationsFee: '0.00',
    },
    {
      type: 'UPI card redemptions',
      paymentsCollected: '0.00',
      depositsCollected: '0.00',
      refundsCollected: '0.00',
      lateCancellationsFee: '0.00',
    },
    {
      type: 'Payments collected',
      paymentsCollected: paymentsCollected.toFixed(2),
      depositsCollected: '0.00',
      refundsCollected: '0.00',
      lateCancellationsFee: '0.00',
    },
    {
      type: 'Of which tips',
      paymentsCollected: '0.00',
      depositsCollected: '0.00',
      refundsCollected: '0.00',
      lateCancellationsFee: '0.00',
    },
  ];

  const totalRevenue = dailyBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + parseFloat(b.totalAmount?.toString() || '0'), 0);

  const handleExport = () => {
    const csvHeader = 'Item Type,Items Sold,Refunds,Gross Total\n';
    const csvRows = transactionSummary.map(row => 
      `${row.itemType},${row.itemsSold},${row.refunds},${row.grossTotal}`
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-${format(selectedDate, 'yyyy-MM-dd')}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    
    toast({
      title: "Export successful",
      description: `Sales data for ${format(selectedDate, 'dd MMM yyyy')} has been downloaded.`,
    });
  };

  const handleAddSale = () => {
    setIsAddSaleOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="admin-sales-title">Daily sales</h1>
          <p className="text-muted-foreground">
            View, filter and export transactions and cash movement for the day
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} data-testid="export-sales">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={() => setIsProductSaleOpen(true)} data-testid="sell-product">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Sell Product
          </Button>
          <Button variant="outline" onClick={() => setIsLoyaltyCardOpen(true)} data-testid="sell-loyalty-card">
            Sell Package
          </Button>
          <Button onClick={handleAddSale} data-testid="add-sale">Add sale</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedDate(subDays(selectedDate, 1))}
          data-testid="prev-day"
        >
          Previous
        </Button>
        <div className="flex items-center gap-2 px-4 py-2 border rounded-md">
          <Calendar className="h-4 w-4" />
          <span className="font-medium">{format(selectedDate, 'EEEE, dd MMM, yyyy')}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedDate(new Date())}
          data-testid="today"
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedDate(subDays(selectedDate, -1))}
          data-testid="next-day"
        >
          Next
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Transaction Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-sm text-muted-foreground">
                    <th className="text-left py-3 font-medium">Item type</th>
                    <th className="text-right py-3 font-medium">Items sold</th>
                    <th className="text-right py-3 font-medium">Refunds</th>
                    <th className="text-right py-3 font-medium">Gross total</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionSummary.map((row, index) => (
                    <tr
                      key={index}
                      className={`border-b text-sm ${
                        row.itemType === 'Total Sales'
                          ? 'font-semibold bg-muted/50'
                          : ''
                      }`}
                      data-testid={`transaction-row-${index}`}
                    >
                      <td className="py-3">{row.itemType}</td>
                      <td className="text-right py-3">{row.itemsSold}</td>
                      <td className="text-right py-3">{row.refunds}</td>
                      <td className="text-right py-3">AED {row.grossTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Cash Movement Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Cash movement summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-sm">
                    <th className="text-left py-3 font-medium min-w-[200px]">
                      {cashMovementSummary[0].type}
                    </th>
                    <th className="text-right py-3 font-medium min-w-[150px]">
                      {cashMovementSummary[0].paymentsCollected}
                    </th>
                    <th className="text-right py-3 font-medium min-w-[150px]">
                      {cashMovementSummary[0].depositsCollected}
                    </th>
                    <th className="text-right py-3 font-medium min-w-[150px]">
                      {cashMovementSummary[0].refundsCollected}
                    </th>
                    <th className="text-right py-3 font-medium min-w-[180px]">
                      {cashMovementSummary[0].lateCancellationsFee}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cashMovementSummary.slice(1).map((row, index) => (
                    <tr
                      key={index}
                      className={`border-b text-sm ${
                        row.type === 'Payments collected' || row.type === 'Of which tips'
                          ? 'font-semibold bg-muted/50'
                          : ''
                      }`}
                      data-testid={`cash-movement-row-${index}`}
                    >
                      <td className="py-3">{row.type}</td>
                      <td className="text-right py-3">
                        {row.paymentsCollected.includes('AED') ? row.paymentsCollected : `AED ${row.paymentsCollected}`}
                      </td>
                      <td className="text-right py-3">
                        {row.depositsCollected.includes('AED') ? row.depositsCollected : `AED ${row.depositsCollected}`}
                      </td>
                      <td className="text-right py-3">
                        {row.refundsCollected.includes('AED') ? row.refundsCollected : `AED ${row.refundsCollected}`}
                      </td>
                      <td className="text-right py-3">
                        {row.lateCancellationsFee.includes('AED') ? row.lateCancellationsFee : `AED ${row.lateCancellationsFee}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product Sale Dialog */}
      <ProductSaleDialog
        open={isProductSaleOpen}
        onOpenChange={setIsProductSaleOpen}
        onSaleCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/admin/product-sales'] });
          queryClient.invalidateQueries({ queryKey: ['/api/admin/products'] });
        }}
      />

      {/* Loyalty Card Dialog */}
      <LoyaltyCardDialog
        open={isLoyaltyCardOpen}
        onOpenChange={setIsLoyaltyCardOpen}
        onCardCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/admin/loyalty-cards'] });
          queryClient.invalidateQueries({ queryKey: ['/api/admin/customers'] });
        }}
      />

      {/* Add Sale Dialog */}
      <Dialog open={isAddSaleOpen} onOpenChange={setIsAddSaleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sale</DialogTitle>
            <DialogDescription>
              Record a walk-in sale or manual transaction
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sale-type">Sale Type</Label>
              <Select value={saleType} onValueChange={setSaleType}>
                <SelectTrigger id="sale-type" data-testid="select-sale-type">
                  <SelectValue placeholder="Select sale type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="membership">Membership</SelectItem>
                  <SelectItem value="voucher">Voucher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-amount">Amount (AED)</Label>
              <Input
                id="sale-amount"
                type="number"
                placeholder="0.00"
                value={saleAmount}
                onChange={(e) => setSaleAmount(e.target.value)}
                data-testid="input-sale-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment-method" data-testid="select-payment-method">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-notes">Notes (optional)</Label>
              <Input
                id="sale-notes"
                placeholder="Add any notes"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                data-testid="input-sale-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSaleOpen(false)} data-testid="button-cancel-sale">
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!saleType || !saleAmount || !paymentMethod) {
                  toast({
                    title: "Missing fields",
                    description: "Please fill in all required fields",
                    variant: "destructive",
                  });
                  return;
                }
                createSaleMutation.mutate({
                  transactionType: saleType,
                  amount: saleAmount,
                  paymentMethod,
                  notes: saleNotes || undefined,
                });
              }}
              disabled={createSaleMutation.isPending}
              data-testid="button-save-sale"
            >
              {createSaleMutation.isPending ? "Saving..." : "Save Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
