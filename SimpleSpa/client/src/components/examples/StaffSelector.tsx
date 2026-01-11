import { useState } from "react";
import StaffSelector from "../StaffSelector";

export default function StaffSelectorExample() {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const staff = [
    {
      id: "1",
      name: "Sarah Johnson",
      specialty: "Massage Therapist",
      available: true,
    },
    {
      id: "2",
      name: "Michael Chen",
      specialty: "Skincare Specialist",
      available: true,
    },
    {
      id: "3",
      name: "Emma Williams",
      specialty: "Aromatherapist",
      available: false,
    },
  ];

  return (
    <div className="max-w-2xl">
      <StaffSelector
        selectedStaffId={selectedStaffId}
        onStaffSelect={setSelectedStaffId}
        staff={staff}
      />
    </div>
  );
}
