import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Product, Staff } from "@shared/schema";

interface ProductSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaleCreated: () => void;
}

export function ProductSaleDialog({ open, onOpenChange, onSaleCreated }: ProductSaleDialogProps) {
  const { toast } = useToast();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [taxCode, setTaxCode] = useState("SR");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/admin/products'],
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/customers'],
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ['/api/admin/staff'],
  });

  const { data: user } = useQuery<{ id?: string, staffId?: number }>({
    queryKey: ['/api/user'],
  });

  // Default to authenticated user's staffId if available
  const [soldBy, setSoldBy] = useState(user?.staffId?.toString() || "");

  const selectedProduct = products.find(p => p.id.toString() === selectedProductId);
  const totalPrice = selectedProduct 
    ? (parseFloat(selectedProduct.sellingPrice || "0") * parseInt(quantity || "1")).toFixed(2)
    : "0.00";
  
  // Calculate VAT (UAE 5% inclusive)
  const totalPriceNum = parseFloat(totalPrice);
  const netAmount = totalPriceNum / 1.05; // Net before VAT
  const vatAmount = totalPriceNum - netAmount; // VAT amount

  const handleSubmit = async () => {
    if (!selectedProductId || !customerId || !quantity || !soldBy) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields (product, customer, staff, quantity)",
        variant: "destructive",
      });
      return;
    }

    if (!selectedProduct) {
      toast({
        title: "Product not found",
        description: "Selected product is invalid",
        variant: "destructive",
      });
      return;
    }

    const qty = parseInt(quantity);
    if (qty <= 0) {
      toast({
        title: "Invalid quantity",
        description: "Quantity must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    if ((selectedProduct.stockQuantity || 0) < qty) {
      toast({
        title: "Insufficient stock",
        description: `Only ${selectedProduct.stockQuantity || 0} units available`,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/product-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerId: parseInt(customerId),
          productId: parseInt(selectedProductId),
          quantity: qty,
          unitPrice: selectedProduct.sellingPrice,
          totalPrice: parseFloat(totalPrice),
          netAmount: netAmount.toFixed(2),
          vatAmount: vatAmount.toFixed(2),
          taxCode: taxCode,
          soldBy: parseInt(soldBy),
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create product sale');
      }

      toast({
        title: "Sale recorded",
        description: `${qty} × ${selectedProduct.name} sold successfully. Inventory updated.`,
      });

      // Reset form
      setSelectedProductId("");
      setCustomerId("");
      setSoldBy("");
      setQuantity("1");
      setTaxCode("SR");
      setNotes("");
      
      onSaleCreated();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create product sale",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sell Product</DialogTitle>
          <DialogDescription>
            Record a product sale. Inventory will be automatically updated.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product">Product *</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger id="product" data-testid="select-product">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.filter(p => p.active).map(product => (
                  <SelectItem key={product.id} value={product.id.toString()}>
                    {product.name} - AED {product.sellingPrice} (Stock: {product.stockQuantity || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger id="customer" data-testid="select-customer">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map(customer => (
                  <SelectItem key={customer.id} value={customer.id.toString()}>
                    {customer.name} {customer.phone ? `(${customer.phone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff">Sold By (Staff) *</Label>
            <Select value={soldBy} onValueChange={setSoldBy}>
              <SelectTrigger id="staff" data-testid="select-sold-by">
                <SelectValue placeholder="Select staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff.map(member => (
                  <SelectItem key={member.id} value={member.id.toString()}>
                    {member.name} {member.specialty ? `- ${member.specialty}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              data-testid="input-quantity"
            />
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Available stock: {selectedProduct.stockQuantity || 0} units
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-code">UAE Tax Code</Label>
            <Select value={taxCode} onValueChange={setTaxCode}>
              <SelectTrigger id="tax-code" data-testid="select-tax-code">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SR">SR - Standard Rate (5% VAT)</SelectItem>
                <SelectItem value="ZR">ZR - Zero-Rated (0%)</SelectItem>
                <SelectItem value="ES">ES - Exempt</SelectItem>
                <SelectItem value="OP">OP - Out of Scope</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedProduct && (
            <div className="p-3 bg-muted rounded-md">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Amount:</span>
                <span className="text-lg font-bold">AED {totalPrice}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {taxCode === 'SR' ? 'Includes 5% VAT' : taxCode === 'ZR' ? 'Zero-rated' : taxCode === 'ES' ? 'VAT Exempt' : 'Out of scope'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              placeholder="Add notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            data-testid="button-submit-sale"
          >
            {isSubmitting ? "Recording..." : "Record Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
