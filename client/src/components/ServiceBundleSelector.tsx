import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Package } from "lucide-react";

export interface BundleItem {
  id: number;
  bundleId: number;
  serviceId: number;
  variantId: number | null;
  quantity: number;
  displayOrder: number;
}

export interface Bundle {
  id: number;
  spaId: number;
  categoryId: number | null;
  name: string;
  description: string | null;
  priceType: string;
  customPrice: string | null;
  discountPercent: string | null;
  gender: string | null;
  featured: boolean;
  onlineBookable: boolean;
  active: boolean;
  items: BundleItem[];
}

export interface ServiceVariant {
  id: number;
  serviceId: number;
  name: string;
  duration: number;
  price: string | number;
  active: boolean | null;
}

interface ServiceBundleSelectorProps {
  bundles: Bundle[];
  selectedBundleId: number | null;
  onSelectBundle: (bundleId: number | null) => void;
  services: Array<{ id: string; name: string; price: number }>;
  variants?: ServiceVariant[];
}

export default function ServiceBundleSelector({
  bundles,
  selectedBundleId,
  onSelectBundle,
  services,
  variants = [],
}: ServiceBundleSelectorProps) {
  if (!bundles || bundles.length === 0) {
    return null;
  }

  const calculateBundlePrice = (bundle: Bundle) => {
    if (bundle.priceType === 'custom' && bundle.customPrice) {
      return parseFloat(bundle.customPrice);
    }
    
    // Calculate from services with variant pricing
    const totalServicePrice = bundle.items.reduce((sum, item) => {
      // Check if this bundle item specifies a variant
      if (item.variantId) {
        const variant = variants.find(v => v.id === item.variantId);
        if (variant) {
          const variantPrice = typeof variant.price === 'string' ? parseFloat(variant.price) : variant.price;
          return sum + (variantPrice * item.quantity);
        }
      }
      
      // Fall back to base service price
      const service = services.find(s => s.id === item.serviceId.toString());
      if (service) {
        return sum + (service.price * item.quantity);
      }
      return sum;
    }, 0);

    // Apply discount if present
    if (bundle.discountPercent) {
      const discount = parseFloat(bundle.discountPercent);
      return totalServicePrice * (1 - discount / 100);
    }

    return totalServicePrice;
  };

  const calculateSavings = (bundle: Bundle) => {
    if (bundle.priceType !== 'custom' || !bundle.customPrice) {
      return 0;
    }

    // Calculate total with variant pricing
    const totalServicePrice = bundle.items.reduce((sum, item) => {
      // Check if this bundle item specifies a variant
      if (item.variantId) {
        const variant = variants.find(v => v.id === item.variantId);
        if (variant) {
          const variantPrice = typeof variant.price === 'string' ? parseFloat(variant.price) : variant.price;
          return sum + (variantPrice * item.quantity);
        }
      }
      
      // Fall back to base service price
      const service = services.find(s => s.id === item.serviceId.toString());
      if (service) {
        return sum + (service.price * item.quantity);
      }
      return sum;
    }, 0);

    const bundlePrice = parseFloat(bundle.customPrice);
    return totalServicePrice - bundlePrice;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5" />
          Package Deals
        </h3>
        {selectedBundleId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectBundle(null)}
            data-testid="button-clear-bundle"
          >
            Clear Selection
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {bundles.map(bundle => {
          const isSelected = selectedBundleId === bundle.id;
          const price = calculateBundlePrice(bundle);
          const savings = calculateSavings(bundle);

          return (
            <Card
              key={bundle.id}
              className={`p-4 cursor-pointer transition-all hover-elevate ${
                isSelected ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => onSelectBundle(isSelected ? null : bundle.id)}
              data-testid={`bundle-card-${bundle.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold">{bundle.name}</h4>
                    {bundle.featured && (
                      <Badge variant="default" className="text-xs">Featured</Badge>
                    )}
                  </div>
                  {bundle.description && (
                    <p className="text-sm text-muted-foreground">{bundle.description}</p>
                  )}
                </div>
                {isSelected && (
                  <div className="ml-2 flex-shrink-0">
                    <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-3">
                <p className="text-xs text-muted-foreground font-medium">Includes:</p>
                <ul className="text-sm space-y-1">
                  {bundle.items.map((item, idx) => {
                    const service = services.find(s => s.id === item.serviceId.toString());
                    return (
                      <li key={item.id || idx} className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        <span>
                          {item.quantity > 1 && `${item.quantity}x `}
                          {service?.name || `Service #${item.serviceId}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="flex items-center justify-between pt-3 border-t">
                <div>
                  <p className="text-2xl font-bold">AED {price.toFixed(2)}</p>
                  {savings > 0 && (
                    <p className="text-xs text-green-600 font-medium">
                      Save AED {savings.toFixed(2)}
                    </p>
                  )}
                </div>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  data-testid={`button-select-bundle-${bundle.id}`}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
