import cron, { ScheduledTask } from "node-cron";
import { db } from "./db";
import { bookings, customers } from "@shared/schema";
import { eq, and, gte, lt, isNotNull, isNull } from "drizzle-orm";
import { sendBookingReminder, sendBookingCompletion } from "./whatsappNotifications";

class AppointmentScheduler {
  private reminderJob: ScheduledTask | null = null;
  private completionJob: ScheduledTask | null = null;
  private isRunning = false;

  start(): void {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting appointment scheduler...');

    this.reminderJob = cron.schedule('0 * * * *', async () => {
      await this.sendUpcomingReminders();
    }, {
      timezone: 'Asia/Dubai',
    });

    this.completionJob = cron.schedule('0 * * * *', async () => {
      await this.triggerReviewRequests();
    }, {
      timezone: 'Asia/Dubai',
    });

    this.isRunning = true;
    console.log('[Scheduler] Started - reminders every hour, review requests every hour');
  }

  stop(): void {
    if (this.reminderJob) {
      this.reminderJob.stop();
      this.reminderJob = null;
    }
    if (this.completionJob) {
      this.completionJob.stop();
      this.completionJob = null;
    }
    this.isRunning = false;
    console.log('[Scheduler] Stopped');
  }

  async sendUpcomingReminders(): Promise<void> {
    console.log('[Scheduler] Checking for upcoming appointments...');
    
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    
    try {
      const upcomingBookings = await db
        .select({
          id: bookings.id,
          customerId: bookings.customerId,
          bookingDate: bookings.bookingDate,
          status: bookings.status,
        })
        .from(bookings)
        .innerJoin(customers, eq(bookings.customerId, customers.id))
        .where(
          and(
            gte(bookings.bookingDate, in23Hours),
            lt(bookings.bookingDate, in24Hours),
            eq(bookings.status, 'confirmed'),
            isNotNull(customers.phone),
            isNull(bookings.reminderSentAt)
          )
        );

      console.log(`[Scheduler] Found ${upcomingBookings.length} bookings needing reminders`);

      for (const booking of upcomingBookings) {
        const success = await sendBookingReminder(booking.id);
        if (success) {
          await db
            .update(bookings)
            .set({ reminderSentAt: now })
            .where(eq(bookings.id, booking.id));
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error sending reminders:', error);
    }
  }

  async triggerReviewRequests(): Promise<void> {
    console.log('[Scheduler] Checking for completed appointments...');
    
    const now = new Date();
    
    try {
      const completedBookings = await db
        .select({
          id: bookings.id,
          customerId: bookings.customerId,
          bookingDate: bookings.bookingDate,
          completionMessageSentAt: bookings.completionMessageSentAt,
        })
        .from(bookings)
        .innerJoin(customers, eq(bookings.customerId, customers.id))
        .where(
          and(
            eq(bookings.status, 'completed'),
            isNotNull(customers.phone),
            isNull(bookings.reviewRequestedAt)
          )
        )
        .orderBy(bookings.bookingDate)
        .limit(10);

      console.log(`[Scheduler] Found ${completedBookings.length} bookings needing review requests`);

      for (const booking of completedBookings) {
        try {
          const thankYouAlreadySent = !!booking.completionMessageSentAt;
          const result = await sendBookingCompletion(booking.id, thankYouAlreadySent);
          
          const updateData: Record<string, Date> = {};
          if (result.reviewSent) {
            updateData.reviewRequestedAt = now;
          }
          if (result.thankYouSent && !thankYouAlreadySent) {
            updateData.completionMessageSentAt = now;
          }
          
          if (Object.keys(updateData).length > 0) {
            try {
              await db
                .update(bookings)
                .set(updateData)
                .where(eq(bookings.id, booking.id));
            } catch (dbError) {
              console.error(`[Scheduler] DB update failed for booking #${booking.id}:`, dbError);
            }
          }
        } catch (err) {
          console.error(`[Scheduler] Error processing booking #${booking.id}:`, err);
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error triggering review requests:', error);
    }
  }

  async runNow(): Promise<{ reminders: number; reviews: number }> {
    console.log('[Scheduler] Running manual check...');
    await this.sendUpcomingReminders();
    await this.triggerReviewRequests();
    return { reminders: 0, reviews: 0 };
  }
}

export const appointmentScheduler = new AppointmentScheduler();
export default appointmentScheduler;
