import { useState } from "react";
import BookingCalendar from "../BookingCalendar";

export default function BookingCalendarExample() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const unavailableDates = [
    new Date(2025, 9, 18),
    new Date(2025, 9, 22),
    new Date(2025, 9, 25),
  ];

  return (
    <div className="max-w-2xl">
      <BookingCalendar
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        unavailableDates={unavailableDates}
      />
    </div>
  );
}
