import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, isBefore, startOfToday } from "date-fns";

interface BookingCalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  unavailableDates?: Date[];
}

export default function BookingCalendar({ selectedDate, onDateSelect, unavailableDates = [] }: BookingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const today = startOfToday();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const firstDayOfWeek = monthStart.getDay();
  const emptyDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const isDateUnavailable = (date: Date) => {
    return unavailableDates.some(unavailableDate => isSameDay(unavailableDate, date));
  };

  const isDatePast = (date: Date) => {
    return isBefore(date, today) && !isSameDay(date, today);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold">{format(currentMonth, 'MMMM yyyy')}</h3>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            data-testid="button-previous-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            data-testid="button-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
            {day}
          </div>
        ))}

        {emptyDays.map(i => (
          <div key={`empty-${i}`} />
        ))}

        {days.map(day => {
          const isPast = isDatePast(day);
          const unavailable = isDateUnavailable(day);
          const isDisabled = isPast || unavailable;
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);

          return (
            <button
              key={day.toString()}
              onClick={() => !isDisabled && onDateSelect(day)}
              disabled={isDisabled}
              data-testid={`calendar-date-${format(day, 'yyyy-MM-dd')}`}
              className={`
                min-h-14 rounded-md p-2 font-accent text-lg font-medium transition-colors
                ${isSelected ? 'bg-primary text-primary-foreground' : ''}
                ${!isSelected && !isDisabled ? 'hover-elevate active-elevate-2 bg-secondary/30' : ''}
                ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                ${isTodayDate && !isSelected ? 'ring-2 ring-ring' : ''}
              `}
            >
              <div className="flex flex-col items-center gap-1">
                <span>{format(day, 'd')}</span>
                {unavailable && (
                  <span className="text-xs opacity-60">Booked</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
