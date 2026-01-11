import BookingSteps from "../BookingSteps";

export default function BookingStepsExample() {
  return (
    <div className="w-full">
      <BookingSteps
        currentStep={2}
        steps={["Date", "Time", "Staff", "Details", "Confirm"]}
      />
    </div>
  );
}
