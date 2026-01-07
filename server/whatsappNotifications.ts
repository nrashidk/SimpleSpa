import { db } from "./db";
import { bookings, customers, staff, spas, services, bookingItems } from "@shared/schema";
import { eq } from "drizzle-orm";
import { whatsappBookingService } from "./whatsappBookingService";

interface BookingDetails {
  bookingId: number;
  customerName: string;
  customerPhone: string;
  spaName: string;
  spaPhone?: string;
  staffName?: string;
  bookingDate: Date;
  services: string[];
  totalAmount: string;
  location?: string;
}

async function getBookingDetails(bookingId: number): Promise<BookingDetails | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      spaId: bookings.spaId,
      customerId: bookings.customerId,
      staffId: bookings.staffId,
      bookingDate: bookings.bookingDate,
      totalAmount: bookings.totalAmount,
      notes: bookings.notes,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return null;

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, booking.customerId));

  const [spa] = await db
    .select()
    .from(spas)
    .where(eq(spas.id, booking.spaId));

  let staffMember = null;
  if (booking.staffId) {
    const [s] = await db
      .select()
      .from(staff)
      .where(eq(staff.id, booking.staffId));
    staffMember = s;
  }

  const bookingItemsData = await db
    .select({ name: services.name })
    .from(bookingItems)
    .innerJoin(services, eq(bookingItems.serviceId, services.id))
    .where(eq(bookingItems.bookingId, bookingId));

  let serviceNames = bookingItemsData.map(s => s.name);
  if (serviceNames.length === 0 && booking.notes) {
    const match = booking.notes.match(/Services: (.+?)($|\|)/);
    if (match) {
      serviceNames = match[1].split(',').map(s => s.trim());
    }
  }

  return {
    bookingId: booking.id,
    customerName: customer?.name || 'Customer',
    customerPhone: customer?.phone || '',
    spaName: spa?.name || 'Spa',
    spaPhone: spa?.contactPhone || undefined,
    staffName: staffMember?.name || 'Any Available',
    bookingDate: booking.bookingDate,
    services: serviceNames,
    totalAmount: booking.totalAmount || '0',
    location: booking.notes?.includes('Home Service') ? 'Home Service' : 'At Spa',
  };
}

function formatDateTime(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  return date.toLocaleDateString('en-US', options);
}

export async function sendBookingConfirmation(bookingId: number): Promise<boolean> {
  const details = await getBookingDetails(bookingId);
  if (!details || !details.customerPhone) {
    console.log(`Cannot send confirmation for booking ${bookingId}: no customer phone`);
    return false;
  }

  const message = `✅ *Booking Confirmed!*

📋 Booking #${details.bookingId}
🏪 ${details.spaName}
📅 ${formatDateTime(details.bookingDate)}
👤 ${details.staffName}
📍 ${details.location}

*Services:*
${details.services.map(s => `• ${s}`).join('\n')}

💰 *Total:* AED ${parseFloat(details.totalAmount).toFixed(0)}

Need to reschedule? Reply "reschedule" or contact us directly.`;

  try {
    await whatsappBookingService.sendDirectMessage(details.customerPhone, message);
    console.log(`📱 Confirmation sent for booking #${bookingId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send confirmation for booking #${bookingId}:`, error);
    return false;
  }
}

export async function sendBookingReminder(bookingId: number, hoursBeforeAppointment: number = 24): Promise<boolean> {
  const details = await getBookingDetails(bookingId);
  if (!details || !details.customerPhone) {
    console.log(`Cannot send reminder for booking ${bookingId}: no customer phone`);
    return false;
  }

  const message = `⏰ *Appointment Reminder*

Hi ${details.customerName.split(' ')[0]}! This is a friendly reminder about your upcoming appointment.

📋 Booking #${details.bookingId}
🏪 ${details.spaName}
📅 ${formatDateTime(details.bookingDate)}
👤 ${details.staffName}

*Services:*
${details.services.map(s => `• ${s}`).join('\n')}

💰 *Total:* AED ${parseFloat(details.totalAmount).toFixed(0)}

We look forward to seeing you! Reply "confirm" to confirm or "reschedule" if you need to change your appointment.`;

  try {
    await whatsappBookingService.sendDirectMessage(details.customerPhone, message);
    console.log(`📱 Reminder sent for booking #${bookingId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send reminder for booking #${bookingId}:`, error);
    return false;
  }
}

export async function sendBookingCompletion(bookingId: number, thankYouAlreadySent: boolean = false): Promise<{ reviewSent: boolean; thankYouSent: boolean }> {
  const details = await getBookingDetails(bookingId);
  if (!details || !details.customerPhone) {
    console.log(`Cannot send completion message for booking ${bookingId}: no customer phone`);
    return { reviewSent: false, thankYouSent: false };
  }

  try {
    const sent = await whatsappBookingService.sendIdleGatedReviewPrompt(bookingId);
    if (sent) {
      console.log(`📱 Review prompt sent for booking #${bookingId}`);
      return { reviewSent: true, thankYouSent: true };
    } else {
      if (!thankYouAlreadySent) {
        const thankYouMessage = `✨ *Thank you for visiting ${details.spaName}!*

We hope you enjoyed your experience. When you have a moment, reply "rate" to share your feedback.

Reply "hi" anytime to book your next appointment! 💆‍♀️`;
        
        await whatsappBookingService.sendDirectMessage(details.customerPhone, thankYouMessage);
        console.log(`📱 Thank-you sent for booking #${bookingId} (review deferred)`);
        return { reviewSent: false, thankYouSent: true };
      } else {
        console.log(`⏸️ Review deferred for booking #${bookingId} (thank-you already sent)`);
        return { reviewSent: false, thankYouSent: false };
      }
    }
  } catch (error) {
    console.error(`Failed to send completion message for booking #${bookingId}:`, error);
    return { reviewSent: false, thankYouSent: false };
  }
}

export async function sendCancellationNotification(bookingId: number, reason?: string): Promise<boolean> {
  const details = await getBookingDetails(bookingId);
  if (!details || !details.customerPhone) {
    console.log(`Cannot send cancellation for booking ${bookingId}: no customer phone`);
    return false;
  }

  const message = `❌ *Booking Cancelled*

Hi ${details.customerName.split(' ')[0]}, your booking has been cancelled.

📋 Booking #${details.bookingId}
📅 ${formatDateTime(details.bookingDate)}
🏪 ${details.spaName}
${reason ? `\n📝 Reason: ${reason}` : ''}

If you didn't request this cancellation, please contact us immediately.

Ready to book again? Just reply "book" to start a new booking!`;

  try {
    await whatsappBookingService.sendDirectMessage(details.customerPhone, message);
    console.log(`📱 Cancellation notification sent for booking #${bookingId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send cancellation notification for booking #${bookingId}:`, error);
    return false;
  }
}

export async function sendRescheduleNotification(bookingId: number, newDate: Date): Promise<boolean> {
  const details = await getBookingDetails(bookingId);
  if (!details || !details.customerPhone) {
    console.log(`Cannot send reschedule notification for booking ${bookingId}: no customer phone`);
    return false;
  }

  const message = `📅 *Booking Rescheduled*

Hi ${details.customerName.split(' ')[0]}, your booking has been rescheduled.

📋 Booking #${details.bookingId}
🏪 ${details.spaName}
📅 *New Date:* ${formatDateTime(newDate)}
👤 ${details.staffName}

*Services:*
${details.services.map(s => `• ${s}`).join('\n')}

💰 *Total:* AED ${parseFloat(details.totalAmount).toFixed(0)}

We look forward to seeing you at the new time! Reply "confirm" to confirm.`;

  try {
    await whatsappBookingService.sendDirectMessage(details.customerPhone, message);
    console.log(`📱 Reschedule notification sent for booking #${bookingId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send reschedule notification for booking #${bookingId}:`, error);
    return false;
  }
}

export async function sendPaymentConfirmation(bookingId: number): Promise<boolean> {
  const details = await getBookingDetails(bookingId);
  if (!details || !details.customerPhone) {
    console.log(`Cannot send payment confirmation for booking ${bookingId}: no customer phone`);
    return false;
  }

  const message = `💳 *Payment Confirmed!*

Thank you for your payment!

📋 Booking #${details.bookingId}
🏪 ${details.spaName}
📅 ${formatDateTime(details.bookingDate)}

*Services:*
${details.services.map(s => `• ${s}`).join('\n')}

💰 *Amount Paid:* AED ${parseFloat(details.totalAmount).toFixed(0)}

Your booking is now fully confirmed. We look forward to seeing you!`;

  try {
    await whatsappBookingService.sendDirectMessage(details.customerPhone, message);
    console.log(`📱 Payment confirmation sent for booking #${bookingId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send payment confirmation for booking #${bookingId}:`, error);
    return false;
  }
}
