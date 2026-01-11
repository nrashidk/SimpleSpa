import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, Clock, User, Phone, Mail, Sparkles, TicketPercent } from "lucide-react";
import { format } from "date-fns";
import { type Service } from "./ServiceSelector";

interface Addon {
  id: number;
  name: string;
  price: string | number;
  extraTimeMinutes?: number;
}

interface Bundle {
  id: number;
  name: string;
  description: string | null;
  priceType: string;
  customPrice: string | null;
  discountPercent: string | null;
}

interface BookingSummaryProps {
  services?: Service[];
  addons?: Addon[];
  bundle?: Bundle | null;
  bundlePrice?: number | null;
  date: Date | null;
  time: string | null;
  staffName: string | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  appliedPromo?: {
    code: string;
    discountType: string;
    discountValue: number;
  } | null;
}

export default function BookingSummary({
  services = [],
  addons = [],
  bundle = null,
  bundlePrice = null,
  date,
  time,
  staffName,
  customerName,
  customerPhone,
  customerEmail,
  appliedPromo,
}: BookingSummaryProps) {
  const totalDuration = services.reduce((sum, service) => sum + service.duration, 0);
  
  // Calculate addon totals
  const addonPrice = addons.reduce((sum, addon) => {
    const price = typeof addon.price === 'string' ? parseFloat(addon.price) : addon.price;
    return sum + price;
  }, 0);
  
  const addonExtraTime = addons.reduce((sum, addon) => sum + (addon.extraTimeMinutes || 0), 0);
  
  // In UAE, prices include VAT (5%). Formula: netAmount = (totalPrice × 100) / 105
  // If bundle is selected, use bundle price instead of individual service prices
  let subtotalIncVAT: number;
  if (bundle && bundlePrice !== null) {
    subtotalIncVAT = bundlePrice + addonPrice;
  } else {
    subtotalIncVAT = services.reduce((sum, service) => sum + (service.price || 0), 0) + addonPrice;
  }
  const subtotalNetAmount = (subtotalIncVAT * 100) / 105; // Extract net amount (before VAT)
  const subtotalVAT = subtotalIncVAT - subtotalNetAmount; // VAT on original subtotal
  
  // Calculate discount on the NET amount (before VAT)
  let discountOnNet = 0;
  if (appliedPromo) {
    if (appliedPromo.discountType === 'percentage') {
      discountOnNet = (subtotalNetAmount * parseFloat(appliedPromo.discountValue.toString())) / 100;
    } else {
      // For flat rate discount, extract the net portion of the discount
      const flatDiscount = parseFloat(appliedPromo.discountValue.toString());
      discountOnNet = (flatDiscount * 100) / 105;
    }
    // Cap discount to never exceed the net amount (prevent negative values)
    discountOnNet = Math.min(discountOnNet, subtotalNetAmount);
  }
  
  // Calculate final amounts after discount
  const netAmountAfterDiscount = Math.max(0, subtotalNetAmount - discountOnNet);
  const vatOnDiscountedAmount = (netAmountAfterDiscount * 5) / 100; // 5% VAT on discounted net
  const total = netAmountAfterDiscount + vatOnDiscountedAmount;
  
  // Total discount including VAT portion
  const totalDiscountIncVAT = subtotalIncVAT - total;

  return (
    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Booking Summary</h3>
      
      {bundle && (
        <Alert className="mb-4 border-primary bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertDescription>
            <strong>Package Deal:</strong> {bundle.name}
            {bundle.description && ` - ${bundle.description}`}
          </AlertDescription>
        </Alert>
      )}

      {appliedPromo && (
        <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950">
          <TicketPercent className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            <strong>Offer Applied!</strong> SAVED AED {totalDiscountIncVAT.toFixed(2)}
          </AlertDescription>
        </Alert>
      )}
      
      <div className="space-y-4">
        {services.length > 0 && (
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Services</p>
              <div className="space-y-1 mt-1">
                {services.map((service) => (
                  <div key={service.id} className="flex items-center justify-between" data-testid={`summary-service-${service.id}`}>
                    <p className="font-medium">{service.name}</p>
                    <Badge variant="secondary" className="text-xs">
                      {service.duration} min
                    </Badge>
                  </div>
                ))}
              </div>
              {totalDuration > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Total duration: {totalDuration + addonExtraTime} minutes
                  {addonExtraTime > 0 && ` (includes +${addonExtraTime} min from add-ons)`}
                </p>
              )}
            </div>
          </div>
        )}

        {addons.length > 0 && (
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Add-ons</p>
              <div className="space-y-1 mt-1">
                {addons.map((addon, index) => (
                  <div key={addon.id || index} className="flex items-center justify-between" data-testid={`summary-addon-${addon.id}`}>
                    <p className="font-medium">{addon.name}</p>
                    <p className="text-sm text-muted-foreground">
                      AED {(typeof addon.price === 'string' ? parseFloat(addon.price) : addon.price).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
              {addonExtraTime > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Extra time: +{addonExtraTime} minutes
                </p>
              )}
            </div>
          </div>
        )}

        {date && (
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium" data-testid="summary-date">
                {format(date, 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>
        )}

        {time && (
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Time</p>
              <p className="font-medium" data-testid="summary-time">{time}</p>
            </div>
          </div>
        )}

        {staffName !== undefined && (
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Specialist</p>
              <p className="font-medium" data-testid="summary-staff">
                {staffName || "Any Available"}
              </p>
            </div>
          </div>
        )}

        {customerName && (
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium" data-testid="summary-customer-name">{customerName}</p>
              </div>
            </div>

            {customerPhone && (
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium" data-testid="summary-customer-phone">{customerPhone}</p>
                </div>
              </div>
            )}

            {customerEmail && (
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium" data-testid="summary-customer-email">{customerEmail}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {services.length === 0 && !date && !time && !staffName && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Start by selecting services to see your booking details
          </p>
        )}

        {services.length > 0 && (
          <div className="pt-4 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">AED {subtotalIncVAT.toFixed(2)}</span>
            </div>
            
            {appliedPromo && totalDiscountIncVAT > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount ({appliedPromo.code})</span>
                <span>-AED {totalDiscountIncVAT.toFixed(2)}</span>
              </div>
            )}
            
            <div className="flex justify-between text-base font-semibold pt-2 border-t">
              <span>Total</span>
              <span>AED {total.toFixed(2)}</span>
            </div>
            
            <p className="text-xs text-muted-foreground">Includes VAT (AED {vatOnDiscountedAmount.toFixed(2)})</p>
          </div>
        )}
      </div>
    </Card>
  );
}
