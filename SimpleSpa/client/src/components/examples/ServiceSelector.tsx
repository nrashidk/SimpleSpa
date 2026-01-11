import { useState } from "react";
import ServiceSelector from "../ServiceSelector";

export default function ServiceSelectorExample() {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const services = [
    {
      id: "1",
      name: "Swedish Massage",
      description: "Relaxing full-body massage with gentle pressure",
      duration: 60,
      price: 80,
    },
    {
      id: "2",
      name: "Deep Tissue Massage",
      description: "Therapeutic massage targeting muscle tension",
      duration: 90,
      price: 110,
    },
    {
      id: "3",
      name: "Aromatherapy Facial",
      description: "Rejuvenating facial with essential oils",
      duration: 45,
      price: 65,
    },
    {
      id: "4",
      name: "Hot Stone Therapy",
      description: "Soothing heated stone massage treatment",
      duration: 75,
      price: 95,
    },
  ];

  const handleServiceToggle = (serviceId: string) => {
    setSelectedServiceIds(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  return (
    <div className="max-w-2xl">
      <ServiceSelector
        selectedServiceIds={selectedServiceIds}
        onServiceToggle={handleServiceToggle}
        services={services}
      />
    </div>
  );
}
