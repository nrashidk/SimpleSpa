import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Calendar, Clock, User, Phone, Mail, Download, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { type Service } from "./ServiceSelector";

interface BookingConfirmationProps {
  services: Service[];
  date: Date;
  time: string;
  staffName: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  smsNotificationSent: boolean;
  emailNotificationSent: boolean;
  onNewBooking: () => void;
  spaName?: string;
}

export default function BookingConfirmation({
  services,
  date,
  time,
  staffName,
  customerName,
  customerPhone,
  customerEmail,
  smsNotificationSent,
  emailNotificationSent,
  onNewBooking,
  spaName = "Serene Spa",
}: BookingConfirmationProps) {
  const handleAddToCalendar = () => {
    console.log("Add to calendar clicked");
  };

  const totalDuration = services.reduce((sum, service) => sum + service.duration, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4">
            <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
          </div>
        </div>
        
        <h2 className="text-3xl font-semibold mb-2" data-testid="confirmation-title">
          Booking Confirmed!
        </h2>
        <p className="text-muted-foreground mb-6">
          Your appointment at {spaName} has been successfully scheduled
        </p>

        <div className="flex justify-center gap-2 mb-6">
          {smsNotificationSent && (
            <Badge variant="default" className="gap-1" data-testid="badge-sms-sent">
              <Phone className="h-3 w-3" />
              WhatsApp/SMS Sent
            </Badge>
          )}
          {emailNotificationSent && (
            <Badge variant="default" className="gap-1" data-testid="badge-email-sent">
              <Mail className="h-3 w-3" />
              Email Sent
            </Badge>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Appointment Details</h3>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Services</p>
              <div className="space-y-1 mt-1">
                {services.map((service) => (
                  <div key={service.id} className="flex items-center justify-between" data-testid={`confirmation-service-${service.id}`}>
                    <p className="font-medium">{service.name}</p>
                    <Badge variant="secondary" className="text-xs">
                      {service.duration} min
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Total duration: {totalDuration} minutes
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium" data-testid="confirmation-date">
                {format(date, 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Time</p>
              <p className="font-medium" data-testid="confirmation-time">{time}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">Specialist</p>
              <p className="font-medium" data-testid="confirmation-staff">
                {staffName || "Any Available"}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t space-y-3">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{customerName}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{customerPhone}</p>
              </div>
            </div>

            {customerEmail && (
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{customerEmail}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleAddToCalendar}
          data-testid="button-add-to-calendar"
        >
          <Download className="h-4 w-4 mr-2" />
          Add to Calendar
        </Button>
        <Link href="/my-account" className="flex-1">
          <Button
            variant="outline"
            className="w-full"
            data-testid="button-view-bookings"
          >
            <User className="h-4 w-4 mr-2" />
            View My Bookings
          </Button>
        </Link>
        <Button
          className="flex-1"
          onClick={onNewBooking}
          data-testid="button-new-booking"
        >
          Book Another Appointment
        </Button>
      </div>
    </div>
  );
}
