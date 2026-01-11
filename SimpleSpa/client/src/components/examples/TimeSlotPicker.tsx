import { useState } from "react";
import TimeSlotPicker from "../TimeSlotPicker";

export default function TimeSlotPickerExample() {
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const timeSlots = [
    { time: "9:00 AM", available: true, duration: 60 },
    { time: "10:00 AM", available: true, duration: 60 },
    { time: "11:00 AM", available: false, duration: 60 },
    { time: "12:00 PM", available: true, duration: 60 },
    { time: "1:00 PM", available: false, duration: 60 },
    { time: "2:00 PM", available: true, duration: 60 },
    { time: "3:00 PM", available: true, duration: 60 },
    { time: "4:00 PM", available: true, duration: 60 },
    { time: "5:00 PM", available: false, duration: 60 },
    { time: "6:00 PM", available: true, duration: 60 },
  ];

  return (
    <div className="max-w-4xl">
      <TimeSlotPicker
        selectedTime={selectedTime}
        onTimeSelect={setSelectedTime}
        timeSlots={timeSlots}
      />
    </div>
  );
}
