import { getUncachableStripeClient, getStripeSecretKey } from "./stripeClient";
import { db } from "./db";
import { bookings, whatsappConversations } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import { sendPaymentConfirmation } from "./whatsappNotifications";

export async function handleStripeWebhook(payload: Buffer, signature: string): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = await getUncachableStripeClient();
    const secretKey = await getStripeSecretKey();
    
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } else {
      console.warn('[Stripe Webhook] No webhook secret configured, parsing payload directly');
      event = JSON.parse(payload.toString());
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Stripe Webhook] Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function handleCheckoutCompleted(session: any): Promise<void> {
  const bookingId = session.metadata?.booking_id;
  
  if (!bookingId) {
    console.log('[Stripe Webhook] No booking_id in session metadata');
    return;
  }

  const bookingIdNum = parseInt(bookingId, 10);
  
  console.log(`[Stripe Webhook] Checkout completed for booking #${bookingIdNum}`);

  await db
    .update(bookings)
    .set({ 
      notes: sql`notes || ' | Payment: Paid via Stripe'`,
    })
    .where(eq(bookings.id, bookingIdNum));

  const [booking] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingIdNum));

  if (booking?.customerId) {
    const [conversation] = await db
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.customerId, booking.customerId))
      .orderBy(desc(whatsappConversations.createdAt))
      .limit(1);

    if (conversation && conversation.state === 'payment') {
      await db
        .update(whatsappConversations)
        .set({ state: 'completed', updatedAt: new Date() })
        .where(eq(whatsappConversations.id, conversation.id));
    }
  }

  await sendPaymentConfirmation(bookingIdNum);
  
  console.log(`[Stripe Webhook] Booking #${bookingIdNum} marked as paid`);
}

async function handlePaymentSucceeded(paymentIntent: any): Promise<void> {
  console.log(`[Stripe Webhook] Payment succeeded: ${paymentIntent.id}`);
}

async function handlePaymentFailed(paymentIntent: any): Promise<void> {
  console.log(`[Stripe Webhook] Payment failed: ${paymentIntent.id}`);
  const bookingId = paymentIntent.metadata?.booking_id;
  if (bookingId) {
    console.log(`[Stripe Webhook] Payment failed for booking #${bookingId}`);
  }
}
