import CustomerDetailsForm from "../CustomerDetailsForm";

export default function CustomerDetailsFormExample() {
  const handleSubmit = (data: any) => {
    console.log("Form submitted:", data);
  };

  return (
    <div className="max-w-md">
      <CustomerDetailsForm onSubmit={handleSubmit} isLoading={false} />
    </div>
  );
}
