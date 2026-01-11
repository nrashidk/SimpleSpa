import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface TimeSlot {
  time: string;
  available: boolean;
  duration: number;
}

interface TimeSlotPickerProps {
  selectedTime: string | null;
  onTimeSelect: (time: string) => void;
  timeSlots: TimeSlot[];
  totalDuration?: number;
}

export default function TimeSlotPicker({ selectedTime, onTimeSelect, timeSlots, totalDuration }: TimeSlotPickerProps) {
  const displayDuration = totalDuration || 60;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-semibold">Select Time</h3>
        </div>
        {totalDuration && totalDuration > 0 && (
          <Badge variant="secondary">
            {totalDuration} min session
          </Badge>
        )}
      </div>
      
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {timeSlots.map((slot) => (
          <Button
            key={slot.time}
            variant={selectedTime === slot.time ? "default" : "outline"}
            disabled={!slot.available}
            onClick={() => slot.available && onTimeSelect(slot.time)}
            data-testid={`time-slot-${slot.time.replace(/[:\s]/g, '-')}`}
            className="flex flex-col h-auto py-3 relative"
          >
            <span className="font-semibold">{slot.time}</span>
            <span className="text-xs opacity-80">{displayDuration} min</span>
            {!slot.available && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-full h-0.5 bg-current opacity-50" />
              </span>
            )}
          </Button>
        ))}
      </div>
    </Card>
  );
}
