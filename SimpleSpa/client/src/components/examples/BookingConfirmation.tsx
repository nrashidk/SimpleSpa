import BookingConfirmation from "../BookingConfirmation";

export default function BookingConfirmationExample() {
  const services = [
    {
      id: "1",
      name: "Swedish Massage",
      description: "Relaxing full-body massage",
      duration: 60,
      price: 80,
    },
    {
      id: "2",
      name: "Aromatherapy Facial",
      description: "Rejuvenating facial with essential oils",
      duration: 45,
      price: 65,
    },
  ];

  return (
    <div className="p-6">
      <BookingConfirmation
        services={services}
        date={new Date(2025, 9, 20)}
        time="2:00 PM"
        staffName="Sarah Johnson"
        customerName="John Doe"
        customerPhone="+1234567890"
        customerEmail="john@example.com"
        smsNotificationSent={true}
        emailNotificationSent={true}
        onNewBooking={() => console.log("New booking clicked")}
      />
    </div>
  );
}
