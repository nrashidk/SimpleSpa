import BookingSummary from "../BookingSummary";

export default function BookingSummaryExample() {
  return (
    <div className="max-w-md">
      <BookingSummary
        date={new Date(2025, 9, 20)}
        time="2:00 PM"
        staffName="Sarah Johnson"
        customerName="John Doe"
        customerPhone="+1234567890"
        customerEmail="john@example.com"
      />
    </div>
  );
}
