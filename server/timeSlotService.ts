import { storage } from "./storage";
import { googleCalendarService } from "./googleCalendarService";
import { getValidAccessToken } from "./oauthService";

interface TimeSlot {
  time: string; // HH:MM format
  available: boolean;
  staffId?: number;
}

interface BusinessHours {
  [key: string]: { open: string; close: string } | null;
}

// Helper: Get DST-aware timezone offset for RFC3339 format
function getTimezoneOffset(date: Date, timeZone: string): string {
  try {
    // Format the date in both UTC and the target timezone
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
    
    // Calculate offset in minutes
    const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
    
    // Convert to RFC3339 format (+HH:MM or -HH:MM)
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;
    
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  } catch (error) {
    console.error('Error calculating timezone offset:', error);
    return '+04:00'; // Fallback to Dubai
  }
}

// Helper: Fetch Google Calendar events for conflict checking
async function getCalendarConflicts(
  spaId: number,
  staffEmail: string | undefined,
  date: string
): Promise<Array<{ start: string; end: string }>> {
  try {
    // Check if Google Calendar is connected
    const integrations = await storage.getSpaIntegrations(spaId);
    const calendarIntegration = integrations.find(
      i => i.integrationType === 'google_calendar' && i.status === 'active'
    );

    if (!calendarIntegration || !staffEmail) {
      return [];
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(
      calendarIntegration.provider as 'google',
      calendarIntegration.integrationType,
      calendarIntegration.encryptedTokens
    );

    // Get spa details for timezone
    const spa = await storage.getSpaById(spaId);
    const spaTimeZone = (spa?.timeZone as string) || 'Asia/Dubai';
    
    // Calculate DST-aware offsets for start and end of day separately
    // (handles DST transition days where offset changes during the day)
    const startDate = new Date(`${date}T00:00:00`);
    const endDate = new Date(`${date}T23:59:59`);
    const startOffset = getTimezoneOffset(startDate, spaTimeZone);
    const endOffset = getTimezoneOffset(endDate, spaTimeZone);

    // Get staff-specific calendar from integration metadata, fallback to 'primary'
    const integrationMetadata = calendarIntegration.metadata as any;
    const calendarId = integrationMetadata?.staffCalendars?.[staffEmail] || 'primary';

    // Fetch events for the day using RFC3339 format with DST-aware timezone offsets
    const startOfDay = `${date}T00:00:00${startOffset}`;
    const endOfDay = `${date}T23:59:59${endOffset}`;

    const events = await googleCalendarService.listEvents(
      accessToken,
      calendarId,
      startOfDay,
      endOfDay
    );

    // Return conflicts as time ranges
    return events.map(event => ({
      start: event.start?.dateTime || '',
      end: event.end?.dateTime || '',
    })).filter(e => e.start && e.end);
  } catch (error) {
    console.error('Failed to fetch calendar conflicts:', error);
    return [];
  }
}

/**
 * Generate available time slots for a spa on a given date
 */
export async function generateAvailableTimeSlots(
  spaId: number,
  date: string, // YYYY-MM-DD format
  serviceDuration: number, // in minutes
  staffId?: number
): Promise<TimeSlot[]> {
  // Get spa details with business hours
  const spa = await storage.getSpaById(spaId);
  if (!spa || !spa.businessHours) {
    return [];
  }

  // Parse the date and get day of week (0=Sunday, 6=Saturday)
  // Add time to ensure it's parsed as local date, not UTC
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeek = dateObj.getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];

  // Get business hours for this day
  const businessHours = spa.businessHours as any;
  const dayHoursRaw = businessHours[dayName];
  
  if (!dayHoursRaw) {
    // Spa is closed on this day
    return [];
  }

  // Parse business hours - handle both string format "9:00-21:00" and object format { open, close }
  let workStartTime: string;
  let workEndTime: string;
  
  if (typeof dayHoursRaw === 'string') {
    // Format: "9:00-21:00"
    const [start, end] = dayHoursRaw.split('-');
    workStartTime = start;
    workEndTime = end;
  } else if (dayHoursRaw.open && dayHoursRaw.close) {
    // Format: { open: "9:00", close: "21:00" }
    workStartTime = dayHoursRaw.open;
    workEndTime = dayHoursRaw.close;
  } else {
    // Invalid format
    return [];
  }

  // Get all bookings for this date
  const allBookings = await storage.getAllBookings();
  const dateStr = date; // YYYY-MM-DD
  
  // If staffId specified, filter for that staff only
  // If no staffId, we'll check per-staff availability later
  const relevantBookings = allBookings.filter((booking: any) => {
    // Check if booking is on the same date
    const bookingDateStr = new Date(booking.bookingDate).toISOString().split('T')[0];
    if (bookingDateStr !== dateStr) return false;
    
    // If checking specific staff, filter by staffId
    if (staffId && booking.staffId !== staffId) return false;
    
    // If no staffId specified, only include bookings for this spa
    if (!staffId && booking.spaId !== spaId) return false;
    
    // Only consider confirmed bookings
    return booking.status === 'confirmed';
  });

  // Get booking durations by fetching booking items
  const bookingDurations = await Promise.all(
    relevantBookings.map(async (booking: any) => {
      const items = await storage.getBookingItemsByBookingId(booking.id);
      const totalDuration = items.reduce((sum: number, item: any) => sum + (item.duration || 0), 0);
      return {
        booking,
        duration: totalDuration || 60, // Default to 60 if no items found
      };
    })
  );

  // If no specific staff requested, get all staff for this spa to check availability
  let spaStaff: any[] = [];
  if (!staffId) {
    spaStaff = await storage.getStaffBySpaId(spaId);
  }

  // Fetch Google Calendar conflicts for staff
  let calendarConflicts: Array<{ start: string; end: string }> = [];
  if (staffId) {
    const staff = await storage.getStaffById(staffId);
    if (staff?.email) {
      calendarConflicts = await getCalendarConflicts(spaId, staff.email, date);
    }
  }

  // Generate all possible time slots
  const slots: TimeSlot[] = [];
  const [startHour, startMin] = workStartTime.split(':').map(Number);
  const [endHour, endMin] = workEndTime.split(':').map(Number);
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  // Generate slots in 30-minute intervals (common spa booking interval)
  const slotInterval = 30; // minutes
  
  for (let minutes = startMinutes; minutes < endMinutes; minutes += slotInterval) {
    const slotHour = Math.floor(minutes / 60);
    const slotMin = minutes % 60;
    const slotTime = `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
    
    // Check if this slot has enough time for the service before closing
    const slotEndMinutes = minutes + serviceDuration;
    if (slotEndMinutes > endMinutes) {
      break; // Not enough time before closing
    }
    
    // Check availability based on whether specific staff was requested
    let available = true;
    let assignedStaffId = staffId;
    
    if (staffId) {
      // Specific staff requested - check if this staff has a conflict
      const hasBookingConflict = bookingDurations.some(({ booking, duration: bookingDuration }) => {
        const bookingTime = new Date(booking.bookingDate);
        const bookingMinutes = bookingTime.getHours() * 60 + bookingTime.getMinutes();
        const bookingEndMinutes = bookingMinutes + bookingDuration;
        
        const slotStart = minutes;
        const slotEnd = minutes + serviceDuration;
        const bookingStart = bookingMinutes;
        const bookingEnd = bookingEndMinutes;
        
        return slotStart < bookingEnd && bookingStart < slotEnd;
      });

      // Check Google Calendar conflicts
      const hasCalendarConflict = calendarConflicts.some(event => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        const eventStartMinutes = eventStart.getHours() * 60 + eventStart.getMinutes();
        const eventEndMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes();
        
        const slotStart = minutes;
        const slotEnd = minutes + serviceDuration;
        
        return slotStart < eventEndMinutes && eventStartMinutes < slotEnd;
      });

      available = !hasBookingConflict && !hasCalendarConflict;
    } else {
      // "Any staff" mode - find if at least one staff member is available
      const availableStaff = spaStaff.find((staff: any) => {
        const staffBookings = bookingDurations.filter(({ booking }) => booking.staffId === staff.id);
        
        const hasConflict = staffBookings.some(({ booking, duration: bookingDuration }) => {
          const bookingTime = new Date(booking.bookingDate);
          const bookingMinutes = bookingTime.getHours() * 60 + bookingTime.getMinutes();
          const bookingEndMinutes = bookingMinutes + bookingDuration;
          
          const slotStart = minutes;
          const slotEnd = minutes + serviceDuration;
          const bookingStart = bookingMinutes;
          const bookingEnd = bookingEndMinutes;
          
          return slotStart < bookingEnd && bookingStart < slotEnd;
        });
        
        return !hasConflict; // Staff is available if no conflict
      });
      
      if (availableStaff) {
        available = true;
        assignedStaffId = availableStaff.id;
      } else {
        available = false;
      }
    }
    
    slots.push({
      time: slotTime,
      available,
      ...(assignedStaffId && { staffId: assignedStaffId })
    });
  }
  
  return slots;
}

/**
 * Check if a specific time slot is available
 */
export async function isTimeSlotAvailable(
  spaId: number,
  date: string,
  time: string, // HH:MM format
  serviceDuration: number,
  staffId?: number
): Promise<boolean> {
  const slots = await generateAvailableTimeSlots(spaId, date, serviceDuration, staffId);
  const slot = slots.find(s => s.time === time);
  return slot ? slot.available : false;
}

/**
 * Validate booking against business hours and staff availability
 */
export async function validateBooking(
  spaId: number,
  bookingDate: Date,
  serviceDuration: number,
  staffId?: number
): Promise<{ valid: boolean; message?: string }> {
  const date = bookingDate.toISOString().split('T')[0];
  const time = `${bookingDate.getHours().toString().padStart(2, '0')}:${bookingDate.getMinutes().toString().padStart(2, '0')}`;
  
  // Check if spa exists
  const spa = await storage.getSpaById(spaId);
  if (!spa) {
    return { valid: false, message: "Spa not found" };
  }
  
  // Check business hours
  const dayOfWeek = bookingDate.getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];
  
  const businessHours = spa.businessHours as any;
  const dayHoursRaw = businessHours?.[dayName];
  
  if (!dayHoursRaw) {
    return { valid: false, message: `Spa is closed on ${dayName}s` };
  }
  
  // Parse business hours - handle both string format "9:00-21:00" and object format { open, close }
  let workStartTime: string;
  let workEndTime: string;
  
  if (typeof dayHoursRaw === 'string') {
    const [start, end] = dayHoursRaw.split('-');
    workStartTime = start;
    workEndTime = end;
  } else if (dayHoursRaw.open && dayHoursRaw.close) {
    workStartTime = dayHoursRaw.open;
    workEndTime = dayHoursRaw.close;
  } else {
    return { valid: false, message: `Invalid business hours format` };
  }
  
  // Convert times to minutes for proper comparison
  const timeToMinutes = (timeStr: string): number => {
    const [hours, mins] = timeStr.split(':').map(Number);
    return hours * 60 + mins;
  };
  
  const timeMinutes = timeToMinutes(time);
  const startMinutes = timeToMinutes(workStartTime);
  const endMinutes = timeToMinutes(workEndTime);
  
  // Check if time falls within business hours
  if (timeMinutes < startMinutes || timeMinutes >= endMinutes) {
    return { 
      valid: false, 
      message: `Booking time must be between ${workStartTime} and ${workEndTime}` 
    };
  }
  
  // TODO: Check staff schedule when schedule column is added to staff table
  // For now, assume staff works during business hours
  
  // Check for double booking
  const available = await isTimeSlotAvailable(spaId, date, time, serviceDuration, staffId);
  if (!available) {
    return { 
      valid: false, 
      message: "This time slot is already booked. Please choose another time." 
    };
  }
  
  return { valid: true };
}
