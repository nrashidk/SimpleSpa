import { Calendar as BigCalendar, dateFnsLocalizer, View, SlotInfo } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { format as formatDate, parse as parseDate, startOfWeek as getStartOfWeek, getDay as getDayOfWeek } from 'date-fns';
import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight, Plus, Settings, CalendarDays, Users, Clock, Tag, CreditCard, RotateCcw, ZoomIn, ZoomOut, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Booking, BookingItem, Staff, Service, Customer } from '@shared/schema';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

const localizer = dateFnsLocalizer({
  format: formatDate,
  parse: parseDate,
  startOfWeek: getStartOfWeek,
  getDay: getDayOfWeek,
  locales: {},
});

const DragAndDropCalendar = withDragAndDrop(BigCalendar);

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resourceId?: number;
  booking: Booking;
  customer?: Customer;
  service?: Service;
  staff?: Staff;
}

export default function AdminCalendar() {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>('week');
  
  // Booking dialog state
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date; resourceId?: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  
  // Booking form state
  const [formCustomerId, setFormCustomerId] = useState<string>('');
  const [formServiceId, setFormServiceId] = useState<string>('');
  const [formStaffId, setFormStaffId] = useState<string>('');
  const [formDate, setFormDate] = useState<string>('');
  const [formTime, setFormTime] = useState<string>('');
  const [formStatus, setFormStatus] = useState<string>('confirmed');
  
  // Sales sidebar state
  const [isSalesSidebarOpen, setIsSalesSidebarOpen] = useState(false);
  
  // Calendar zoom state
  const [calendarZoom, setCalendarZoom] = useState(100);

  // Search states for booking sidebar
  const [clientSearch, setClientSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');

  // Fetch all required data
  const { data: bookings = [], isLoading: bookingsLoading, isError: bookingsError } = useQuery<Booking[]>({
    queryKey: ['/api/admin/bookings'],
  });

  const { data: bookingItems = [], isLoading: itemsLoading } = useQuery<BookingItem[]>({
    queryKey: ['/api/admin/booking-items'],
  });

  const { data: staff = [], isLoading: staffLoading } = useQuery<Staff[]>({
    queryKey: ['/api/admin/staff'],
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ['/api/admin/services'],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ['/api/admin/customers'],
  });

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/admin/bookings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/booking-items'] });
      setIsBookingDialogOpen(false);
      resetForm();
      toast({
        title: "Booking created",
        description: "The booking has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update booking mutation
  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest('PUT', `/api/admin/bookings/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/booking-items'] });
      setIsBookingDialogOpen(false);
      setSelectedEvent(null);
      resetForm();
      toast({
        title: "Booking updated",
        description: "The booking has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete booking mutation
  const deleteBookingMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/admin/bookings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bookings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/booking-items'] });
      setIsBookingDialogOpen(false);
      setSelectedEvent(null);
      resetForm();
      toast({
        title: "Booking deleted",
        description: "The booking has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Transform bookings to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    return bookings.map(booking => {
      const customer = customers.find(c => c.id === booking.customerId);
      const items = bookingItems.filter(item => item.bookingId === booking.id);
      const firstItem = items[0];
      const service = firstItem ? services.find(s => s.id === firstItem.serviceId) : null;
      const staffMember = staff.find(s => s.id === booking.staffId);
      
      const duration = firstItem?.duration || 30;
      const startTime = new Date(booking.bookingDate);
      const endTime = new Date(startTime.getTime() + duration * 60000);

      return {
        id: booking.id,
        title: `${customer?.name || 'Customer'} - ${service?.name || 'Service'}`,
        start: startTime,
        end: endTime,
        resourceId: booking.staffId || undefined,
        booking,
        customer,
        service: service || undefined,
        staff: staffMember,
      };
    });
  }, [bookings, bookingItems, customers, services, staff]);

  // Resources (staff members)
  const resources = useMemo(() => {
    return staff.map(member => ({
      id: member.id,
      title: member.name,
      avatar: member.avatarUrl,
    }));
  }, [staff]);

  // Filtered customers based on search
  const filteredCustomers = useMemo(() => {
    if (!clientSearch.trim()) return customers;
    const search = clientSearch.toLowerCase();
    return customers.filter(customer => 
      customer.name.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search)
    );
  }, [customers, clientSearch]);

  // Filtered services based on search
  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    const search = serviceSearch.toLowerCase();
    return services.filter(service => 
      service.name.toLowerCase().includes(search)
    );
  }, [services, serviceSearch]);

  // Reset form
  const resetForm = () => {
    setFormCustomerId('');
    setFormServiceId('');
    setFormStaffId('');
    setFormDate('');
    setFormTime('');
    setFormStatus('confirmed');
    setSelectedSlot(null);
    setSelectedEvent(null);
    setClientSearch('');
    setServiceSearch('');
  };

  // Handle slot selection (click on empty calendar slot)
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setSelectedSlot({
      start: slotInfo.start as Date,
      end: slotInfo.end as Date,
      resourceId: slotInfo.resourceId as number | undefined,
    });
    
    // Pre-fill form with selected slot data
    const date = slotInfo.start as Date;
    setFormDate(formatDate(date, 'yyyy-MM-dd'));
    setFormTime(formatDate(date, 'HH:mm'));
    if (slotInfo.resourceId) {
      setFormStaffId(String(slotInfo.resourceId));
    }
    
    setIsBookingDialogOpen(true);
  }, []);

  // Handle event selection (click on existing booking)
  const handleSelectEvent = useCallback((event: any) => {
    const calendarEvent = event as CalendarEvent;
    setSelectedEvent(calendarEvent);
    
    // Pre-fill form with event data
    setFormCustomerId(String(calendarEvent.booking.customerId));
    setFormServiceId(calendarEvent.service ? String(calendarEvent.service.id) : '');
    setFormStaffId(calendarEvent.booking.staffId ? String(calendarEvent.booking.staffId) : '');
    setFormDate(formatDate(calendarEvent.start, 'yyyy-MM-dd'));
    setFormTime(formatDate(calendarEvent.start, 'HH:mm'));
    setFormStatus(calendarEvent.booking.status);
    
    setIsBookingDialogOpen(true);
  }, []);

  // Handle new booking button
  const handleNewBooking = () => {
    resetForm();
    setFormDate(formatDate(new Date(), 'yyyy-MM-dd'));
    setFormTime(formatDate(new Date(), 'HH:mm'));
    setIsBookingDialogOpen(true);
  };

  // Handle form submission
  const handleSubmitBooking = () => {
    if (!formCustomerId || !formServiceId || !formDate || !formTime) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const bookingDateTime = new Date(`${formDate}T${formTime}`);
    const selectedService = services.find(s => s.id === Number(formServiceId));
    
    if (selectedEvent) {
      // Update existing booking - include services to update booking items
      updateBookingMutation.mutate({
        id: selectedEvent.booking.id,
        data: {
          customerId: Number(formCustomerId),
          staffId: formStaffId ? Number(formStaffId) : null,
          bookingDate: bookingDateTime,
          totalAmount: String(selectedService?.price || 0),
          status: formStatus,
          services: [{ serviceId: Number(formServiceId), duration: selectedService?.duration || 30 }],
        },
      });
    } else {
      // Create new booking
      createBookingMutation.mutate({
        customerId: Number(formCustomerId),
        staffId: formStaffId ? Number(formStaffId) : null,
        bookingDate: bookingDateTime,
        totalAmount: String(selectedService?.price || 0),
        status: formStatus,
        services: [{ serviceId: Number(formServiceId), duration: selectedService?.duration || 30 }],
      });
    }
  };

  // Handle booking deletion
  const handleDeleteBooking = () => {
    if (!selectedEvent) return;
    
    if (confirm('Are you sure you want to delete this booking?')) {
      deleteBookingMutation.mutate(selectedEvent.booking.id);
    }
  };

  // Handle event drag and drop
  const onEventDrop = useCallback(
    ({ event, start, end, resourceId }: any) => {
      const calendarEvent = event as CalendarEvent;
      
      updateBookingMutation.mutate({
        id: calendarEvent.booking.id,
        data: {
          bookingDate: start,
          staffId: resourceId || calendarEvent.booking.staffId,
        },
      });
    },
    [updateBookingMutation]
  );

  // Handle event resize
  const onEventResize = useCallback(
    ({ event, start, end }: any) => {
      const calendarEvent = event as CalendarEvent;
      
      updateBookingMutation.mutate({
        id: calendarEvent.booking.id,
        data: {
          bookingDate: start,
        },
      });
    },
    [updateBookingMutation]
  );

  // Check loading and error states AFTER all hooks
  const isLoading = bookingsLoading || itemsLoading || staffLoading || servicesLoading || customersLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading calendar...</p>
        </div>
      </div>
    );
  }

  if (bookingsError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-destructive mb-4">Failed to load calendar data</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  // Event style getter
  const eventStyleGetter = (event: CalendarEvent) => {
    const statusColors = {
      confirmed: { backgroundColor: '#3b82f6', borderColor: '#2563eb' },
      pending: { backgroundColor: '#f59e0b', borderColor: '#d97706' },
      completed: { backgroundColor: '#10b981', borderColor: '#059669' },
      cancelled: { backgroundColor: '#ef4444', borderColor: '#dc2626' },
      'no-show': { backgroundColor: '#6b7280', borderColor: '#4b5563' },
    };

    const colors = statusColors[event.booking.status as keyof typeof statusColors] || statusColors.pending;

    return {
      style: {
        ...colors,
        color: 'white',
        borderRadius: '4px',
        border: `1px solid ${colors.borderColor}`,
        fontSize: '0.875rem',
      },
    };
  };

  // Custom resource header
  const ResourceHeader = ({ label, resource }: any) => {
    const staffMember = staff.find(s => s.id === resource.id);
    if (!staffMember) return <div>{label}</div>;

    const initials = staffMember.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();

    return (
      <div className="flex flex-col items-center gap-2 py-2">
        <Avatar className="h-10 w-10">
          {staffMember.avatarUrl && <AvatarImage src={staffMember.avatarUrl} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{staffMember.name}</span>
      </div>
    );
  };

  const navigateToNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateToPrevious = () => {
    const newDate = new Date(currentDate);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  const navigateToToday = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className="space-y-4">
      {/* Header - Responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold" data-testid="admin-calendar-title">Calendar</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage appointments and staff schedules</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Settings Button */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-settings">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Calendar Settings</h4>
                <div className="space-y-2">
                  <Label className="text-sm">Zoom Level: {calendarZoom}%</Label>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setCalendarZoom(Math.max(50, calendarZoom - 10))}
                      disabled={calendarZoom <= 50}
                      data-testid="button-zoom-out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCalendarZoom(100)}
                      data-testid="button-zoom-reset"
                    >
                      <RotateCcw className="h-3 w-3 mr-2" />
                      Reset
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setCalendarZoom(Math.min(200, calendarZoom + 10))}
                      disabled={calendarZoom >= 200}
                      data-testid="button-zoom-in"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Refresh Button */}
          <Button variant="outline" size="icon" onClick={navigateToToday} data-testid="button-refresh">
            <RotateCcw className="h-4 w-4" />
          </Button>

          {/* Add to Calendar Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" data-testid="button-add-to-calendar">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleNewBooking} data-testid="menu-item-appointment">
                <CalendarDays className="h-4 w-4 mr-2" />
                Appointment
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewBooking} data-testid="menu-item-group-appointment">
                <Users className="h-4 w-4 mr-2" />
                Group appointment
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewBooking} data-testid="menu-item-blocked-time">
                <Clock className="h-4 w-4 mr-2" />
                Blocked time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsSalesSidebarOpen(true)} data-testid="menu-item-sale">
                <Tag className="h-4 w-4 mr-2" />
                Sale
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewBooking} data-testid="menu-item-quick-payment">
                <CreditCard className="h-4 w-4 mr-2" />
                Quick payment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="flex items-center gap-1">
            <Button variant="outline" onClick={navigateToPrevious} size="icon" data-testid="calendar-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={navigateToToday} size="sm" data-testid="calendar-today">
              Today
            </Button>
            <Button variant="outline" onClick={navigateToNext} size="icon" data-testid="calendar-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button
              variant={view === 'day' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('day')}
              data-testid="calendar-view-day"
            >
              <span className="hidden sm:inline">Day</span>
              <span className="sm:hidden">D</span>
            </Button>
            <Button
              variant={view === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('week')}
              data-testid="calendar-view-week"
            >
              <span className="hidden sm:inline">Week</span>
              <span className="sm:hidden">W</span>
            </Button>
            <Button
              variant={view === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('month')}
              data-testid="calendar-view-month"
            >
              <span className="hidden sm:inline">Month</span>
              <span className="sm:hidden">M</span>
            </Button>
          </div>
        </div>
      </div>

      <Card className="p-2 sm:p-4">
        <div 
          className="h-[500px] sm:h-[600px] lg:h-[calc(100vh-250px)] overflow-auto"
          style={{ 
            zoom: `${calendarZoom}%`
          }}
        >
          <DragAndDropCalendar
            localizer={localizer}
            events={events}
            resources={resources}
            resourceIdAccessor={(resource: any) => resource.id}
            resourceTitleAccessor={(resource: any) => resource.title}
            startAccessor={(event: any) => event.start}
            endAccessor={(event: any) => event.end}
            view={view}
            onView={setView}
            date={currentDate}
            onNavigate={setCurrentDate}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            eventPropGetter={(event: any) => eventStyleGetter(event as CalendarEvent)}
            selectable
            resizable
            draggableAccessor={() => true}
            step={15}
            timeslots={4}
            min={new Date(2024, 0, 1, 8, 0, 0)}
            max={new Date(2024, 0, 1, 22, 0, 0)}
            components={{
              resourceHeader: ResourceHeader,
            }}
            toolbar={false}
            formats={{
              timeGutterFormat: 'h:mm a',
              eventTimeRangeFormat: ({ start, end }: any, culture: any, localizer: any) =>
                `${localizer?.format(start, 'h:mm a', culture)} - ${localizer?.format(end, 'h:mm a', culture)}`,
            }}
          />
        </div>
      </Card>

      {/* Booking Sidebar */}
      <Sheet open={isBookingDialogOpen} onOpenChange={(open) => {
        setIsBookingDialogOpen(open);
        if (!open) {
          resetForm();
        }
      }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col" data-testid="sheet-booking">
          <SheetHeader className="p-6 border-b">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle data-testid="sheet-booking-title">
                  {selectedEvent ? 'Edit Booking' : 'Add a booking'}
                </SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground mt-1">
                  {formDate && formTime ? `${formatDate(new Date(formDate), 'EEE dd MMM')} · ${formTime} · ${formStaffId ? staff.find(s => s.id === Number(formStaffId))?.name : "Any staff"}` : 'Select date and time'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Client Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Select a client</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search client or leave empty"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-client"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md">
                {filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No clients found
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => setFormCustomerId(String(customer.id))}
                      className={`w-full flex items-center gap-3 p-3 hover-elevate border-b last:border-b-0 ${
                        formCustomerId === String(customer.id) ? 'bg-primary/10' : ''
                      }`}
                      data-testid={`client-${customer.id}`}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">{customer.phone || customer.email}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Service Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Add a service</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by service name"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-service"
                />
              </div>
              <div className="max-h-64 overflow-y-auto border rounded-md">
                {filteredServices.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No services found
                  </div>
                ) : (
                  filteredServices.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => setFormServiceId(String(service.id))}
                      className={`w-full flex items-center justify-between p-4 hover-elevate border-b last:border-b-0 ${
                        formServiceId === String(service.id) ? 'bg-primary/10' : ''
                      }`}
                      data-testid={`service-${service.id}`}
                    >
                      <div className="flex-1 text-left">
                        <div className="font-medium text-sm">{service.name}</div>
                        <div className="text-xs text-muted-foreground">{service.duration}min</div>
                      </div>
                      <div className="font-semibold">AED {service.price}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Staff Selection */}
            <div className="space-y-2">
              <Label htmlFor="staff">Staff (Optional)</Label>
              <Select value={formStaffId || undefined} onValueChange={setFormStaffId}>
                <SelectTrigger id="staff" data-testid="select-staff">
                  <SelectValue placeholder="Any available staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((member) => (
                    <SelectItem key={member.id} value={String(member.id)}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  data-testid="input-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time *</Label>
                <Input
                  id="time"
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  data-testid="input-time"
                />
              </div>
            </div>

            {/* Status */}
            {selectedEvent && (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger id="status" data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="no-show">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Footer with Total and Actions */}
          <div className="border-t p-6 space-y-4">
            {formServiceId && (
              <div className="flex items-center justify-between text-lg font-semibold">
                <span>Total</span>
                <span>AED {services.find(s => s.id === Number(formServiceId))?.price || 0}</span>
              </div>
            )}
            <div className="flex gap-2">
              {selectedEvent && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteBooking}
                  disabled={deleteBookingMutation.isPending}
                  data-testid="button-delete-booking"
                  className="flex-1"
                >
                  Delete
                </Button>
              )}
              <Button
                onClick={handleSubmitBooking}
                disabled={createBookingMutation.isPending || updateBookingMutation.isPending}
                data-testid="button-save-booking"
                className="flex-1"
              >
                {selectedEvent ? 'Update' : 'Save'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sales Sidebar */}
      <Sheet open={isSalesSidebarOpen} onOpenChange={setIsSalesSidebarOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
          <SheetHeader className="p-6 border-b">
            <SheetTitle>Add to cart</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Cart › Tip › Payment
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-hidden flex">
            {/* Products Section */}
            <div className="flex-1 p-6 overflow-y-auto border-r">
              {/* Search */}
              <div className="mb-4">
                <Input placeholder="Search" className="w-full" data-testid="input-sales-search" />
              </div>

              {/* Category Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                <Button variant="default" size="sm" data-testid="tab-quick-sale">Quick Sale</Button>
                <Button variant="outline" size="sm" data-testid="tab-appointments">Appointments</Button>
                <Button variant="outline" size="sm" data-testid="tab-services">Services</Button>
                <Button variant="outline" size="sm" data-testid="tab-products">Products</Button>
                <Button variant="outline" size="sm" data-testid="tab-memberships">Memberships</Button>
                <Button variant="outline" size="sm" data-testid="tab-gift-cards">Gift cards</Button>
              </div>

              {/* Products Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {services.slice(0, 8).map((service) => (
                  <Card key={service.id} className="p-4 hover-elevate cursor-pointer" data-testid={`product-card-${service.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
                        <Tag className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{service.name}</h3>
                        <p className="text-sm text-muted-foreground">AED {service.price}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <Button variant="ghost" className="mt-4 text-primary" data-testid="button-edit-items">
                Edit items
              </Button>
            </div>

            {/* Cart Section */}
            <div className="w-full sm:w-80 flex flex-col">
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Add client</h3>
                  <Button variant="ghost" size="icon" data-testid="button-add-client">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-6">Leave empty for walk-ins</p>

                {/* Cart Items */}
                <div className="space-y-3 mb-6">
                  <div className="p-3 bg-muted rounded-md" data-testid="cart-item-1">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm">KremBlack</span>
                      <span className="font-medium text-sm">AED 60</span>
                    </div>
                    <p className="text-xs text-muted-foreground">4 · Nasser Al Ali</p>
                  </div>
                  <div className="p-3 bg-muted rounded-md" data-testid="cart-item-2">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm">Sun's view</span>
                      <span className="font-medium text-sm">AED 200</span>
                    </div>
                    <p className="text-xs text-muted-foreground">6 · Nasser Al Ali</p>
                  </div>
                  <div className="p-3 bg-muted rounded-md" data-testid="cart-item-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-sm">Haircut scissors & beard scissors</span>
                      <span className="font-medium text-sm">AED 270</span>
                    </div>
                    <p className="text-xs text-muted-foreground">4 sessions · 2 services · AED 270 value</p>
                  </div>
                </div>
              </div>

              {/* Cart Footer */}
              <div className="border-t p-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>AED 530</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>AED 0</span>
                </div>
                <div className="flex justify-between font-medium text-base border-t pt-3">
                  <span>Total</span>
                  <span>AED 530</span>
                </div>
                <div className="flex justify-between items-center border-t pt-3">
                  <span className="font-medium">To pay</span>
                  <span className="text-lg font-bold">AED 530</span>
                </div>
                <Button className="w-full" size="lg" data-testid="button-continue-payment">
                  Continue to payment
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
