import { decryptJSON } from "./encryptionService";

interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

// Google Calendar API types
export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  location?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
}

// Google Calendar API service
export class GoogleCalendarService {
  private static baseUrl = 'https://www.googleapis.com/calendar/v3';

  // List user's calendars
  static async listCalendars(accessToken: string): Promise<GoogleCalendar[]> {
    const response = await fetch(`${this.baseUrl}/users/me/calendarList`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list calendars: ${error}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  // Get primary calendar
  static async getPrimaryCalendar(accessToken: string): Promise<GoogleCalendar> {
    const calendars = await this.listCalendars(accessToken);
    const primary = calendars.find(cal => cal.primary);
    
    if (!primary) {
      throw new Error('No primary calendar found');
    }

    return primary;
  }

  // Create calendar event
  static async createEvent(
    accessToken: string,
    calendarId: string,
    event: GoogleCalendarEvent
  ): Promise<GoogleCalendarEvent> {
    const response = await fetch(`${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create event: ${error}`);
    }

    return await response.json();
  }

  // Update calendar event
  static async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: Partial<GoogleCalendarEvent>
  ): Promise<GoogleCalendarEvent> {
    const response = await fetch(
      `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update event: ${error}`);
    }

    return await response.json();
  }

  // Delete calendar event
  static async deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 404) {
      const error = await response.text();
      throw new Error(`Failed to delete event: ${error}`);
    }
  }

  // List events in a time range
  static async listEvents(
    accessToken: string,
    calendarId: string,
    timeMin: string,
    timeMax: string
  ): Promise<GoogleCalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const response = await fetch(
      `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list events: ${error}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  // Check for conflicts with existing events
  static async checkConflicts(
    accessToken: string,
    calendarId: string,
    startTime: string,
    endTime: string
  ): Promise<boolean> {
    const events = await this.listEvents(accessToken, calendarId, startTime, endTime);
    return events.length > 0;
  }

  // Create event from booking
  static createEventFromBooking(booking: {
    id: number;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    appointmentDate: string; // ISO date string
    appointmentTime: string; // HH:MM format
    duration: number;
    services: Array<{ name: string }>;
    spaName?: string;
    spaAddress?: string;
    timeZone?: string; // Optional timezone, defaults to Asia/Dubai
  }): GoogleCalendarEvent {
    // Construct datetime in the spa's timezone (avoid local timezone conversion)
    const timeZone = booking.timeZone || 'Asia/Dubai';
    const startDateTime = `${booking.appointmentDate}T${booking.appointmentTime}:00`;
    
    // Calculate end time manually without timezone conversion
    const [hours, minutes] = booking.appointmentTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + booking.duration;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    const endDateTime = `${booking.appointmentDate}T${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}:00`;

    const serviceNames = booking.services.map(s => s.name).join(', ');
    const attendees = booking.customerEmail ? [{ email: booking.customerEmail, displayName: booking.customerName }] : [];

    return {
      summary: `${booking.customerName} - ${serviceNames}`,
      description: `
Booking ID: ${booking.id}
Customer: ${booking.customerName}
Services: ${serviceNames}
${booking.customerPhone ? `Phone: ${booking.customerPhone}` : ''}

Created by ${booking.spaName || 'Spa Booking System'}
      `.trim(),
      start: {
        dateTime: startDateTime,
        timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone,
      },
      attendees,
      location: booking.spaAddress,
      status: 'confirmed',
    };
  }
}

// Export singleton instance for static method usage
export const googleCalendarService = GoogleCalendarService;
