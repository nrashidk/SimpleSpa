import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight, Calendar, ChevronDown } from "lucide-react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TimeSlot {
  time: string;
  available: boolean;
  price: number;
  originalPrice?: number;
  discount?: number;
}

interface Professional {
  id: string;
  name: string;
  imageUrl?: string;
}

interface TimeSelectionViewProps {
  selectedDate: Date | null;
  selectedTime: string | null;
  selectedProfessional: Professional | null;
  onDateSelect: (date: Date) => void;
  onTimeSelect: (time: string) => void;
  onProfessionalChange?: (professionalId: string) => void;
  timeSlots: TimeSlot[];
  professionals?: Professional[];
  onContinue: () => void;
}

export default function TimeSelectionView({
  selectedDate,
  selectedTime,
  selectedProfessional,
  onDateSelect,
  onTimeSelect,
  onProfessionalChange,
  timeSlots,
  professionals = [],
  onContinue,
}: TimeSelectionViewProps) {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-6">
      {professionals.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            {selectedProfessional && (
              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedProfessional.imageUrl} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedProfessional.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
            )}
            <Select
              value={selectedProfessional?.id || "any"}
              onValueChange={onProfessionalChange}
            >
              <SelectTrigger className="w-full" data-testid="professional-dropdown">
                <SelectValue placeholder="Any professional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any professional</SelectItem>
                {professionals.map((prof) => (
                  <SelectItem key={prof.id} value={prof.id}>
                    {prof.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="icon" data-testid="button-calendar">
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{format(weekStart, 'MMMM yyyy')}</h3>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              data-testid="button-previous-week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              data-testid="button-next-week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={day.toString()}
                onClick={() => onDateSelect(day)}
                data-testid={`date-${format(day, 'yyyy-MM-dd')}`}
                className="flex flex-col items-center p-2 rounded-lg hover-elevate active-elevate-2 transition-all"
              >
                <div
                  className={`
                    w-12 h-12 rounded-full flex items-center justify-center font-semibold text-lg
                    ${isSelected ? 'bg-primary text-primary-foreground' : ''}
                    ${isToday && !isSelected ? 'ring-2 ring-ring' : ''}
                  `}
                >
                  {format(day, 'd')}
                </div>
                <span className="text-xs text-muted-foreground mt-1">
                  {format(day, 'EEE')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="space-y-2">
          {timeSlots.map((slot) => (
            <Card
              key={slot.time}
              className={`p-4 cursor-pointer hover-elevate active-elevate-2 transition-all ${
                selectedTime === slot.time ? 'ring-2 ring-primary' : ''
              } ${!slot.available ? 'opacity-50' : ''}`}
              onClick={() => slot.available && onTimeSelect(slot.time)}
              data-testid={`time-slot-${slot.time.replace(/[:\s]/g, '-')}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{slot.time}</span>
                <div className="flex items-center gap-3">
                  {slot.discount && (
                    <Badge variant="secondary" className="text-xs text-green-600 dark:text-green-400">
                      {slot.discount}% off
                    </Badge>
                  )}
                  {slot.originalPrice && (
                    <span className="text-sm text-muted-foreground line-through">
                      AED {slot.originalPrice}
                    </span>
                  )}
                  <span className="font-semibold">AED {slot.price}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedTime && (
        <Button
          onClick={onContinue}
          className="w-full"
          size="lg"
          data-testid="button-continue-to-confirm"
        >
          Continue
        </Button>
      )}
    </div>
  );
}
