import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Service } from "@shared/schema";

interface LoyaltyCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardCreated: () => void;
}

export function LoyaltyCardDialog({ open, onOpenChange, onCardCreated }: LoyaltyCardDialogProps) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [cardType, setCardType] = useState("");
  const [totalSessions, setTotalSessions] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [taxCode, setTaxCode] = useState("SR");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/customers'],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ['/api/admin/services'],
  });

  const handleSubmit = async () => {
    if (!customerId || !cardType || !totalSessions || !purchasePrice) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const sessions = parseInt(totalSessions);
    const price = parseFloat(purchasePrice);

    if (sessions <= 0 || price <= 0) {
      toast({
        title: "Invalid values",
        description: "Sessions and price must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/loyalty-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: parseInt(customerId),
          serviceId: serviceId ? parseInt(serviceId) : null,
          cardType,
          totalSessions: sessions,
          usedSessions: 0,
          purchasePrice: price,
          taxCode: taxCode,
          status: 'active',
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create loyalty card');
      }

      toast({
        title: "Loyalty card created",
        description: `${cardType} package created for customer successfully`,
      });

      // Reset form
      setCustomerId("");
      setServiceId("");
      setCardType("");
      setTotalSessions("");
      setPurchasePrice("");
      setTaxCode("SR");
      setNotes("");
      
      onCardCreated();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create loyalty card",
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
          <DialogTitle>Create Loyalty Card Package</DialogTitle>
          <DialogDescription>
            Sell a prepaid service package to a customer
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
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
            <Label htmlFor="card-type">Package Name *</Label>
            <Input
              id="card-type"
              placeholder="e.g., 6-session massage package"
              value={cardType}
              onChange={(e) => setCardType(e.target.value)}
              data-testid="input-card-type"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="service">Service (optional)</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger id="service" data-testid="select-service">
                <SelectValue placeholder="Link to a service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {services.filter(s => s.active).map(service => (
                  <SelectItem key={service.id} value={service.id.toString()}>
                    {service.name} - AED {service.price}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sessions">Total Sessions *</Label>
            <Input
              id="sessions"
              type="number"
              min="1"
              placeholder="e.g., 6"
              value={totalSessions}
              onChange={(e) => setTotalSessions(e.target.value)}
              data-testid="input-sessions"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Purchase Price (AED) *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              data-testid="input-price"
            />
            <p className="text-xs text-muted-foreground">
              {taxCode === 'SR' ? 'Includes 5% VAT' : taxCode === 'ZR' ? 'Zero-rated' : taxCode === 'ES' ? 'VAT Exempt' : 'Out of scope'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax-code-loyalty">UAE Tax Code</Label>
            <Select value={taxCode} onValueChange={setTaxCode}>
              <SelectTrigger id="tax-code-loyalty" data-testid="select-tax-code-loyalty">
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
            data-testid="button-submit-card"
          >
            {isSubmitting ? "Creating..." : "Create Package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
