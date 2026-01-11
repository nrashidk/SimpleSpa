import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock } from "lucide-react";

export interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price?: number;
}

interface ServiceSelectorProps {
  selectedServiceIds: string[];
  onServiceToggle: (serviceId: string) => void;
  services: Service[];
}

export default function ServiceSelector({ selectedServiceIds, onServiceToggle, services }: ServiceSelectorProps) {
  const totalDuration = services
    .filter(service => selectedServiceIds.includes(service.id))
    .reduce((sum, service) => sum + service.duration, 0);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-semibold">Select Services</h3>
        </div>
        {totalDuration > 0 && (
          <Badge variant="default" className="gap-1">
            <Clock className="h-3 w-3" />
            {totalDuration} min total
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {services.map((service) => {
          const isSelected = selectedServiceIds.includes(service.id);
          
          return (
            <Card
              key={service.id}
              className={`p-4 hover-elevate active-elevate-2 transition-all ${
                isSelected ? 'ring-2 ring-primary bg-primary/5' : ''
              }`}
              data-testid={`service-option-${service.id}`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onServiceToggle(service.id)}
                  className="mt-1"
                  data-testid={`service-checkbox-${service.id}`}
                />
                <div 
                  className="flex-1 cursor-pointer"
                  onClick={() => onServiceToggle(service.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold">{service.name}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {service.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        {service.duration} min
                      </Badge>
                      {service.price && (
                        <span className="text-sm font-medium">${service.price}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedServiceIds.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4 mt-2">
          Select at least one service to continue
        </p>
      )}
    </Card>
  );
}
