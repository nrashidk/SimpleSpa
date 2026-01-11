import cron, { ScheduledTask } from "node-cron";
import { db } from "./db";
import { bookings, customers } from "@shared/schema";
import { eq, and, gte, lt, isNotNull, isNull } from "drizzle-orm";
import { sendBookingReminder, sendBookingCompletion } from "./whatsappNotifications";
import { logger } from "./logger";

class AppointmentScheduler {
  private reminderJob: ScheduledTask | null = null;
  private completionJob: ScheduledTask | null = null;
  private isRunning = false;

  start(): void {
    if (this.isRunning) {
      logger.debug('[Scheduler] Already running');
      return;
    }

    logger.info('[Scheduler] Starting appointment scheduler...');

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
    logger.info('[Scheduler] Started - reminders every hour, review requests every hour');
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
    logger.info('[Scheduler] Stopped');
  }

  async sendUpcomingReminders(): Promise<void> {
    logger.debug('[Scheduler] Checking for upcoming appointments...');
    
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

      logger.info('[Scheduler] Found bookings needing reminders', { count: upcomingBookings.length });

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
      logger.error('[Scheduler] Error sending reminders', { error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  async triggerReviewRequests(): Promise<void> {
    logger.debug('[Scheduler] Checking for completed appointments...');
    
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

      logger.info('[Scheduler] Found bookings needing review requests', { count: completedBookings.length });

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
              logger.error('[Scheduler] DB update failed', { bookingId: booking.id, error: dbError instanceof Error ? dbError.message : 'Unknown' });
            }
          }
        } catch (err) {
          logger.error('[Scheduler] Error processing booking', { bookingId: booking.id, error: err instanceof Error ? err.message : 'Unknown' });
        }
      }
    } catch (error) {
      logger.error('[Scheduler] Error triggering review requests', { error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  async runNow(): Promise<{ reminders: number; reviews: number }> {
    logger.info('[Scheduler] Running manual check...');
    await this.sendUpcomingReminders();
    await this.triggerReviewRequests();
    return { reminders: 0, reviews: 0 };
  }
}

export const appointmentScheduler = new AppointmentScheduler();
export default appointmentScheduler;
