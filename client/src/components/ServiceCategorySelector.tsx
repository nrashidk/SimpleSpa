import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft, ChevronRight, Sparkles, ChevronDown } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { ServiceVariant } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  category: string;
  featured?: boolean;
  discount?: number;
  package?: {
    description: string;
    originalPrice: number;
  };
}

interface ServiceCategorySelectorProps {
  selectedServiceIds: string[];
  onServiceToggle: (serviceId: string) => void;
  services: Service[];
  serviceVariants?: ServiceVariant[];
  selectedVariants?: Record<string, number | null>;
  onVariantSelect?: (serviceId: string, variantId: number | null) => void;
  onContinue: () => void;
}

export default function ServiceCategorySelector({
  selectedServiceIds,
  onServiceToggle,
  services,
  serviceVariants = [],
  selectedVariants = {},
  onVariantSelect,
  onContinue,
}: ServiceCategorySelectorProps) {
  const categories = ["Featured", ...Array.from(new Set(services.map(s => s.category)))];
  const [activeCategory, setActiveCategory] = useState("Featured");

  const filteredServices = activeCategory === "Featured" 
    ? services.filter(s => s.featured)
    : services.filter(s => s.category === activeCategory);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="shrink-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <ScrollArea className="w-full">
          <div className="flex gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={activeCategory === category ? "default" : "outline"}
                onClick={() => setActiveCategory(category)}
                className="shrink-0"
                data-testid={`category-${category.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {category}
              </Button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <Button variant="ghost" size="icon" className="shrink-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <h3 className="text-xl font-semibold">{activeCategory}</h3>

      <div className="space-y-3">
        {filteredServices.map((service) => {
          const isSelected = selectedServiceIds.includes(service.id);
          const serviceNumericId = parseInt(service.id);
          const availableVariants = serviceVariants.filter(v => v.serviceId === serviceNumericId && v.active);
          const hasVariants = availableVariants.length > 0;

          return (
            <div key={service.id}>
              <Card
                className={`p-4 cursor-pointer hover-elevate active-elevate-2 transition-all ${
                  isSelected ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => onServiceToggle(service.id)}
                data-testid={`service-card-${service.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-base mb-1">{service.name}</h4>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{service.duration} min</span>
                      {service.discount && (
                        <Badge variant="secondary" className="text-xs text-green-600 dark:text-green-400">
                          Save up to {service.discount}%
                        </Badge>
                      )}
                      {hasVariants && (
                        <Badge variant="outline" className="text-xs">
                          {availableVariants.length} option{availableVariants.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2">
                      {service.package ? (
                        <span className="text-sm">from AED {service.price}</span>
                      ) : (
                        <span className="font-medium">AED {service.price}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSelected ? (
                      <div className="bg-primary rounded-full p-1.5">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    ) : (
                      <div className="border-2 rounded-full p-1.5 w-7 h-7" />
                    )}
                  </div>
                </div>
              </Card>

              {/* Variant Selector - shown when service is selected and has variants */}
              {isSelected && hasVariants && onVariantSelect && (
                <Card className="mt-2 p-3 border-primary/20">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Choose Option:</label>
                    <Select
                      value={selectedVariants[service.id]?.toString() || "base"}
                      onValueChange={(value) => {
                        const variantId = value === "base" ? null : parseInt(value);
                        onVariantSelect(service.id, variantId);
                      }}
                    >
                      <SelectTrigger data-testid={`select-variant-${service.id}`}>
                        <SelectValue placeholder="Select option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="base">
                          Base Service - {service.duration} min - AED {service.price}
                        </SelectItem>
                        {availableVariants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id.toString()}>
                            {variant.name} - {variant.duration} min - AED {variant.price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              )}

              {service.package && (
                <Card className="mt-2 p-3 bg-primary/10 border-primary/20">
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="flex-1">{service.package.description}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </Card>
              )}
            </div>
          );
        })}
      </div>

      {selectedServiceIds.length > 0 && (
        <Button
          onClick={onContinue}
          className="w-full"
          size="lg"
          data-testid="button-continue-to-professional"
        >
          Continue
        </Button>
      )}
    </div>
  );
}
