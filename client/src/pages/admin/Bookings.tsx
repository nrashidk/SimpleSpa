import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, Phone } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import type { Booking, Customer, Staff, Service as DbService, BookingItem } from "@shared/schema";

type EnrichedBooking = Booking & {
  customer?: Customer;
  staff?: Staff | null;
  services?: DbService[];
  bookingItems?: BookingItem[];
};

export default function AdminBookings() {
  const { data: bookings = [], isLoading } = useQuery<EnrichedBooking[]>({
    queryKey: ["/api/admin/bookings"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="bookings-title">Bookings</h1>
            <p className="text-muted-foreground">View and manage customer bookings</p>
          </div>
        </div>
        <div className="text-center py-12 text-muted-foreground">Loading bookings...</div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
      case "pending":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400";
      case "completed":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
      case "cancelled":
        return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
      default:
        return "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="bookings-title">Bookings</h1>
          <p className="text-muted-foreground">View and manage customer bookings</p>
        </div>
        <Button data-testid="button-new-booking">
          <Calendar className="h-4 w-4 mr-2" />
          New Booking
        </Button>
      </div>

      <div className="space-y-4">
        {bookings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No bookings found. Create your first booking to get started.
          </div>
        ) : (
          bookings.map((booking) => {
            const customerName = booking.customer?.name || "Unknown Customer";
            const customerPhone = booking.customer?.phone || "N/A";
            const staffName = booking.staff?.name || "Any Available";
            const serviceNames = booking.services?.map(s => s.name).join(", ") || "No services";
            const totalDuration = booking.services?.reduce((sum, s) => sum + s.duration, 0) || 0;
            const amount = booking.totalAmount || "0";
            const bookingDate = new Date(booking.bookingDate);

            return (
              <Card key={booking.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-lg" data-testid={`booking-customer-${booking.id}`}>
                            {customerName}
                          </h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {customerPhone}
                          </p>
                        </div>
                        <Badge className={getStatusColor(booking.status)} data-testid={`booking-status-${booking.id}`}>
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{format(bookingDate, "MMM d, yyyy")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{format(bookingDate, "h:mm a")} ({totalDuration} min)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{staffName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">AED {amount}</span>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium">{serviceNames}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button variant="outline" size="sm" data-testid={`button-view-booking-${booking.id}`}>
                        View
                      </Button>
                      <Button variant="outline" size="sm" data-testid={`button-edit-booking-${booking.id}`}>
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
