import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const customerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
}).refine(
  (data) => data.mobile || data.email,
  {
    message: "Please provide either a mobile number or email address",
    path: ["mobile"],
  }
);

export type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerDetailsFormProps {
  onSubmit: (data: CustomerFormData) => void;
  isLoading?: boolean;
}

export default function CustomerDetailsForm({ onSubmit, isLoading = false }: CustomerDetailsFormProps) {
  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      mobile: "",
      email: "",
    },
  });

  return (
    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Your Details</h3>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="John Doe"
                    data-testid="input-customer-name"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mobile"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormLabel>Mobile Number</FormLabel>
                  <Badge variant="secondary" className="text-xs">Optional</Badge>
                </div>
                <FormControl>
                  <Input
                    type="tel"
                    placeholder="+971 50 123 4567"
                    data-testid="input-customer-mobile"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormLabel>Email Address</FormLabel>
                  <Badge variant="secondary" className="text-xs">Optional</Badge>
                </div>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    data-testid="input-customer-email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <p className="text-sm text-muted-foreground">
            * Provide at least one contact method to receive your booking confirmation
          </p>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
            data-testid="button-confirm-booking"
          >
            {isLoading ? "Confirming..." : "Confirm Booking"}
          </Button>
        </form>
      </Form>
    </Card>
  );
}
