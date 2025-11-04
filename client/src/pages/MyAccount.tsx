import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Clock, MapPin, User, Phone, Mail, X, Edit } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ThemeToggle from "@/components/ThemeToggle";

interface Service {
  id: number;
  name: string;
  duration: number;
  price: string;
}

interface Spa {
  id: number;
  name: string;
  address: string;
  city: string;
  contactPhone: string;
  cancellationPolicy?: {
    hoursBeforeBooking?: number;
    description?: string;
  };
}

interface Staff {
  id: number;
  name: string;
  specialty: string;
}

interface Booking {
  id: number;
  spaId: number;
  bookingDate: string;
  status: string;
  totalAmount: string;
  notes?: string;
  spa: Spa;
  staff: Staff | null;
  services: Service[];
  cancelledAt?: string;
  cancellationReason?: string;
}

export default function MyAccount() {
  const { toast } = useToast();
  const [cancelBookingId, setCancelBookingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [editBookingId, setEditBookingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ['/api/my-bookings'],
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: number; reason: string }) => {
      return await apiRequest('PUT', `/api/bookings/${bookingId}/cancel`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/my-bookings'] });
      toast({
        title: "Booking cancelled",
        description: "Your booking has been successfully cancelled.",
      });
      setCancelBookingId(null);
      setCancelReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation failed",
        description: error.message || "Failed to cancel booking",
        variant: "destructive",
      });
    },
  });

  const modifyMutation = useMutation({
    mutationFn: async ({ bookingId, date, time, notes }: { bookingId: number; date: string; time: string; notes: string }) => {
      return await apiRequest('PUT', `/api/bookings/${bookingId}`, { date, time, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/my-bookings'] });
      toast({
        title: "Booking modified",
        description: "Your booking has been successfully updated.",
      });
      setEditBookingId(null);
      setEditDate("");
      setEditTime("");
      setEditNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Modification failed",
        description: error.message || "Failed to modify booking",
        variant: "destructive",
      });
    },
  });

  const handleCancelBooking = (bookingId: number) => {
    setCancelBookingId(bookingId);
  };

  const confirmCancel = () => {
    if (cancelBookingId) {
      cancelMutation.mutate({ bookingId: cancelBookingId, reason: cancelReason });
    }
  };

  const handleEditBooking = (booking: Booking) => {
    setEditBookingId(booking.id);
    const date = new Date(booking.bookingDate);
    setEditDate(format(date, 'yyyy-MM-dd'));
    setEditTime(format(date, 'HH:mm'));
    setEditNotes(booking.notes || "");
  };

  const confirmEdit = () => {
    if (editBookingId) {
      modifyMutation.mutate({ 
        bookingId: editBookingId, 
        date: editDate, 
        time: editTime,
        notes: editNotes 
      });
    }
  };

  const canModifyBooking = (booking: Booking): boolean => {
    if (booking.status === 'cancelled' || booking.status === 'completed') {
      return false;
    }

    const policy = booking.spa.cancellationPolicy;
    if (policy?.hoursBeforeBooking) {
      const hoursUntilBooking = (new Date(booking.bookingDate).getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntilBooking >= policy.hoursBeforeBooking;
    }

    return true;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      confirmed: "default",
      modified: "secondary",
      completed: "secondary",
      cancelled: "destructive",
    };

    return (
      <Badge variant={variants[status] || "default"} data-testid={`badge-status-${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const upcomingBookings = bookings.filter(b => 
    new Date(b.bookingDate) >= new Date() && b.status !== 'cancelled'
  );
  
  const pastBookings = bookings.filter(b => 
    new Date(b.bookingDate) < new Date() || b.status === 'cancelled'
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg">Loading your bookings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">My Account</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="mb-8">
            <TabsTrigger value="upcoming" data-testid="tab-upcoming">
              Upcoming ({upcomingBookings.length})
            </TabsTrigger>
            <TabsTrigger value="past" data-testid="tab-past">
              Past ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-6">
            {upcomingBookings.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">No upcoming bookings</p>
                </CardContent>
              </Card>
            ) : (
              upcomingBookings.map((booking) => (
                <Card key={booking.id} data-testid={`card-booking-${booking.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-2xl" data-testid={`text-spa-name-${booking.id}`}>
                          {booking.spa.name}
                        </CardTitle>
                        <CardDescription className="mt-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span data-testid={`text-spa-address-${booking.id}`}>
                              {booking.spa.address}, {booking.spa.city}
                            </span>
                          </div>
                        </CardDescription>
                      </div>
                      {getStatusBadge(booking.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4" />
                          <span data-testid={`text-booking-date-${booking.id}`}>
                            {format(new Date(booking.bookingDate), 'EEEE, MMMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4" />
                          <span data-testid={`text-booking-time-${booking.id}`}>
                            {format(new Date(booking.bookingDate), 'h:mm a')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4" />
                          <span data-testid={`text-staff-name-${booking.id}`}>
                            {booking.staff ? booking.staff.name : 'Any available specialist'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="font-semibold text-sm">Services:</p>
                        {booking.services.map((service) => (
                          <div key={service.id} className="text-sm" data-testid={`text-service-${service.id}`}>
                            {service.name} - AED {parseFloat(service.price).toFixed(2)}
                          </div>
                        ))}
                        <p className="font-bold text-sm mt-2" data-testid={`text-total-amount-${booking.id}`}>
                          Total: AED {parseFloat(booking.totalAmount).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {booking.spa.cancellationPolicy && (
                      <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                        <p className="font-semibold">Cancellation Policy:</p>
                        <p>{booking.spa.cancellationPolicy.description}</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-4">
                      {canModifyBooking(booking) && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => handleEditBooking(booking)}
                            data-testid={`button-modify-${booking.id}`}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Modify
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleCancelBooking(booking.id)}
                            data-testid={`button-cancel-${booking.id}`}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel Booking
                          </Button>
                        </>
                      )}
                      {!canModifyBooking(booking) && booking.status !== 'cancelled' && (
                        <p className="text-sm text-muted-foreground">
                          Cannot modify - less than {booking.spa.cancellationPolicy?.hoursBeforeBooking} hours until appointment
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-6">
            {pastBookings.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">No past bookings</p>
                </CardContent>
              </Card>
            ) : (
              pastBookings.map((booking) => (
                <Card key={booking.id} data-testid={`card-booking-${booking.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-2xl">{booking.spa.name}</CardTitle>
                        <CardDescription className="mt-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span>{booking.spa.address}, {booking.spa.city}</span>
                          </div>
                        </CardDescription>
                      </div>
                      {getStatusBadge(booking.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4" />
                          <span>{format(new Date(booking.bookingDate), 'EEEE, MMMM d, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4" />
                          <span>{format(new Date(booking.bookingDate), 'h:mm a')}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="font-semibold text-sm">Services:</p>
                        {booking.services.map((service) => (
                          <div key={service.id} className="text-sm">
                            {service.name} - AED {parseFloat(service.price).toFixed(2)}
                          </div>
                        ))}
                      </div>
                    </div>

                    {booking.status === 'cancelled' && booking.cancellationReason && (
                      <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                        <p className="font-semibold">Cancellation Reason:</p>
                        <p>{booking.cancellationReason}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Cancel Booking Dialog */}
      <AlertDialog open={cancelBookingId !== null} onOpenChange={() => setCancelBookingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this booking? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="cancel-reason">Reason for cancellation (optional)</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Please let us know why you're cancelling..."
              className="mt-2"
              data-testid="input-cancel-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dialog-close">Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              className="bg-destructive text-destructive-foreground hover-elevate"
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Booking'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Booking Dialog */}
      <AlertDialog open={editBookingId !== null} onOpenChange={() => setEditBookingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modify Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Update your booking date, time, or add notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="mt-2"
                data-testid="input-edit-date"
              />
            </div>
            <div>
              <Label htmlFor="edit-time">Time</Label>
              <Input
                id="edit-time"
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="mt-2"
                data-testid="input-edit-time"
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add any special requests..."
                className="mt-2"
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-edit-dialog-close">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEdit}
              data-testid="button-confirm-edit"
            >
              {modifyMutation.isPending ? 'Saving...' : 'Save Changes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
