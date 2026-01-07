import { db } from "./db";
import { 
  whatsappConversations, 
  whatsappMessages,
  customers,
  services,
  serviceCategories,
  staff,
  spas,
  bookings,
  type WhatsappConversation,
  type WhatsappConversationState,
} from "@shared/schema";
import { eq, and, desc, gte, isNull, or, sql } from "drizzle-orm";
import twilio from "twilio";
import { createPaymentLink } from "./stripeClient";

interface ConversationContext {
  spaId?: number;
  spaName?: string;
  locationType?: 'spa' | 'home';
  selectedCategoryId?: number;
  selectedServices?: { id: number; name: string; price: number; duration: number }[];
  selectedStaffId?: number;
  selectedStaffName?: string;
  selectedDate?: string;
  selectedTime?: string;
  customerName?: string;
  customerEmail?: string;
  totalAmount?: number;
  totalDuration?: number;
  bookingId?: number;
}

interface TwilioInboundMessage {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  ButtonPayload?: string;
  ListId?: string;
  ListTitle?: string;
}

class WhatsAppBookingService {
  private twilioClient: any = null;
  private twilioFromNumber: string = '';

  async initialize(accountSid: string, authToken: string, fromNumber: string) {
    this.twilioClient = twilio(accountSid, authToken);
    this.twilioFromNumber = fromNumber;
  }

  async handleInboundMessage(message: TwilioInboundMessage): Promise<string> {
    const phoneNumber = message.From.replace('whatsapp:', '');
    const messageBody = message.Body?.trim().toLowerCase() || '';
    const buttonPayload = message.ButtonPayload;
    
    let conversation = await this.getOrCreateConversation(phoneNumber);
    
    if (messageBody === 'cancel' || messageBody === 'start over' || messageBody === 'restart') {
      conversation = await this.resetConversation(conversation.id);
      return await this.sendWelcomeMessage(phoneNumber, conversation);
    }

    const input = buttonPayload || messageBody;
    
    switch (conversation.state) {
      case 'welcome':
        return await this.handleWelcome(phoneNumber, conversation, input);
      case 'select_spa':
        return await this.handleSelectSpa(phoneNumber, conversation, input);
      case 'select_location':
        return await this.handleSelectLocation(phoneNumber, conversation, input);
      case 'select_category':
        return await this.handleSelectCategory(phoneNumber, conversation, input);
      case 'select_service':
        return await this.handleSelectService(phoneNumber, conversation, input);
      case 'select_professional':
        return await this.handleSelectProfessional(phoneNumber, conversation, input);
      case 'select_date':
        return await this.handleSelectDate(phoneNumber, conversation, input);
      case 'select_time':
        return await this.handleSelectTime(phoneNumber, conversation, input);
      case 'confirm_details':
        return await this.handleConfirmDetails(phoneNumber, conversation, input);
      case 'payment':
        return await this.handlePayment(phoneNumber, conversation, input);
      case 'completed':
        return await this.sendCompletedMessage(phoneNumber, conversation);
      default:
        return await this.sendWelcomeMessage(phoneNumber, conversation);
    }
  }

  private async getOrCreateConversation(phoneNumber: string): Promise<WhatsappConversation> {
    const now = new Date();
    
    const [existing] = await db
      .select()
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.phoneNumber, phoneNumber),
          or(
            isNull(whatsappConversations.expiresAt),
            gte(whatsappConversations.expiresAt, now)
          )
        )
      )
      .orderBy(desc(whatsappConversations.createdAt))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(whatsappConversations)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(eq(whatsappConversations.id, existing.id))
        .returning();
      return updated;
    }

    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const [newConversation] = await db
      .insert(whatsappConversations)
      .values({
        phoneNumber,
        state: 'welcome',
        context: {},
        expiresAt,
      })
      .returning();

    return newConversation;
  }

  private async updateConversation(
    conversationId: number,
    state: WhatsappConversationState,
    context: ConversationContext
  ): Promise<WhatsappConversation> {
    const [updated] = await db
      .update(whatsappConversations)
      .set({
        state,
        context,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId))
      .returning();
    return updated;
  }

  private async resetConversation(conversationId: number): Promise<WhatsappConversation> {
    return await this.updateConversation(conversationId, 'welcome', {});
  }

  private async logMessage(
    conversationId: number,
    direction: 'inbound' | 'outbound',
    messageType: string,
    content: string,
    twilioSid?: string
  ) {
    await db.insert(whatsappMessages).values({
      conversationId,
      direction,
      messageType,
      content,
      twilioSid,
    });
  }

  private async sendMessage(to: string, message: string): Promise<string> {
    console.log(`📱 [WhatsApp OUT] To: ${to}`);
    console.log(`   Message: ${message.substring(0, 200)}...`);
    
    if (!this.twilioClient) {
      console.log('   [DEV MODE - No Twilio client configured]');
      return 'dev-mode-' + Date.now();
    }

    try {
      const result = await this.twilioClient.messages.create({
        from: `whatsapp:${this.twilioFromNumber}`,
        to: `whatsapp:${to}`,
        body: message,
      });
      return result.sid;
    } catch (error: any) {
      console.error('WhatsApp send error:', error.message);
      throw error;
    }
  }

  private async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: { id: string; title: string }[]
  ): Promise<string> {
    console.log(`📱 [WhatsApp OUT - Buttons] To: ${to}`);
    console.log(`   Body: ${body}`);
    console.log(`   Buttons: ${JSON.stringify(buttons)}`);
    
    if (!this.twilioClient) {
      console.log('   [DEV MODE - Sending as text]');
      const buttonText = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
      return await this.sendMessage(to, `${body}\n\n${buttonText}\n\nReply with a number to select.`);
    }

    try {
      const result = await this.twilioClient.messages.create({
        from: `whatsapp:${this.twilioFromNumber}`,
        to: `whatsapp:${to}`,
        contentSid: 'template_buttons',
        contentVariables: JSON.stringify({
          body,
          buttons,
        }),
      });
      return result.sid;
    } catch (error: any) {
      const buttonText = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
      return await this.sendMessage(to, `${body}\n\n${buttonText}\n\nReply with a number to select.`);
    }
  }

  private async sendWelcomeMessage(phoneNumber: string, conversation: WhatsappConversation): Promise<string> {
    const allSpas = await db.select().from(spas).where(eq(spas.active, true));
    
    if (allSpas.length === 0) {
      return await this.sendMessage(phoneNumber, 
        "Welcome! Unfortunately, there are no spas available for booking at this time. Please try again later.");
    }

    if (allSpas.length === 1) {
      const spa = allSpas[0];
      await this.updateConversation(conversation.id, 'select_location', {
        spaId: spa.id,
        spaName: spa.name,
      });
      
      return await this.sendInteractiveButtons(phoneNumber,
        `Welcome to ${spa.name}! 🌿\n\nWould you like to book an appointment at our location or request a home service?`,
        [
          { id: 'spa', title: '📍 At Spa' },
          { id: 'home', title: '🏠 Home Service' },
        ]
      );
    }

    const context: ConversationContext = {};
    await this.updateConversation(conversation.id, 'select_spa', context);
    
    const spaList = allSpas.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    return await this.sendMessage(phoneNumber,
      `Welcome! 🌿\n\nPlease select a spa:\n\n${spaList}\n\nReply with the number of your choice.`
    );
  }

  private async handleWelcome(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    return await this.sendWelcomeMessage(phoneNumber, conversation);
  }

  private async handleSelectSpa(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const allSpas = await db.select().from(spas).where(eq(spas.active, true));
    const spaIndex = parseInt(input) - 1;
    
    if (isNaN(spaIndex) || spaIndex < 0 || spaIndex >= allSpas.length) {
      const spaList = allSpas.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      return await this.sendMessage(phoneNumber,
        `Please select a valid spa number:\n\n${spaList}`
      );
    }

    const selectedSpa = allSpas[spaIndex];
    await this.updateConversation(conversation.id, 'select_location', {
      spaId: selectedSpa.id,
      spaName: selectedSpa.name,
    });

    return await this.sendInteractiveButtons(phoneNumber,
      `Great! You selected ${selectedSpa.name}.\n\nWould you like to book at our location or request a home service?`,
      [
        { id: 'spa', title: '📍 At Spa' },
        { id: 'home', title: '🏠 Home Service' },
      ]
    );
  }

  private async handleSelectLocation(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const context = conversation.context as ConversationContext;
    let locationType: 'spa' | 'home';
    
    if (input === 'spa' || input === '1' || input.includes('spa') || input.includes('location')) {
      locationType = 'spa';
    } else if (input === 'home' || input === '2' || input.includes('home')) {
      locationType = 'home';
    } else {
      return await this.sendInteractiveButtons(phoneNumber,
        "Please select a valid option:",
        [
          { id: 'spa', title: '📍 At Spa' },
          { id: 'home', title: '🏠 Home Service' },
        ]
      );
    }

    const categories = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.spaId, context.spaId!));

    if (categories.length === 0) {
      return await this.sendMessage(phoneNumber,
        "Sorry, there are no service categories available at this time. Please contact the spa directly."
      );
    }

    await this.updateConversation(conversation.id, 'select_category', {
      ...context,
      locationType,
    });

    const categoryList = categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    return await this.sendMessage(phoneNumber,
      `Perfect! You chose ${locationType === 'home' ? 'Home Service' : 'At Spa'}.\n\nPlease select a service category:\n\n${categoryList}\n\nReply with the number.`
    );
  }

  private async handleSelectCategory(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const context = conversation.context as ConversationContext;
    
    const categories = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.spaId, context.spaId!));

    const categoryIndex = parseInt(input) - 1;
    
    if (isNaN(categoryIndex) || categoryIndex < 0 || categoryIndex >= categories.length) {
      const categoryList = categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      return await this.sendMessage(phoneNumber,
        `Please select a valid category:\n\n${categoryList}`
      );
    }

    const selectedCategory = categories[categoryIndex];
    
    const categoryServices = await db
      .select()
      .from(services)
      .where(
        and(
          eq(services.spaId, context.spaId!),
          eq(services.categoryId, selectedCategory.id),
          eq(services.active, true)
        )
      );

    if (categoryServices.length === 0) {
      const categoryList = categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      return await this.sendMessage(phoneNumber,
        `No services available in ${selectedCategory.name}. Please select another category:\n\n${categoryList}`
      );
    }

    await this.updateConversation(conversation.id, 'select_service', {
      ...context,
      selectedCategoryId: selectedCategory.id,
      selectedServices: [],
    });

    const serviceList = categoryServices.map((s, i) => 
      `${i + 1}. ${s.name} - AED ${Number(s.price).toFixed(0)} (${s.duration} min)`
    ).join('\n');
    
    return await this.sendMessage(phoneNumber,
      `Services in ${selectedCategory.name}:\n\n${serviceList}\n\nReply with a number to select a service, or "done" when finished.`
    );
  }

  private async handleSelectService(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const context = conversation.context as ConversationContext;
    
    const categoryServices = await db
      .select()
      .from(services)
      .where(
        and(
          eq(services.spaId, context.spaId!),
          eq(services.categoryId, context.selectedCategoryId!),
          eq(services.active, true)
        )
      );

    if (input === 'done' || input === 'next' || input === 'continue') {
      if (!context.selectedServices || context.selectedServices.length === 0) {
        return await this.sendMessage(phoneNumber,
          "Please select at least one service before continuing."
        );
      }

      const staffMembers = await db
        .select()
        .from(staff)
        .where(
          and(
            eq(staff.spaId, context.spaId!),
            eq(staff.active, true)
          )
        );

      if (staffMembers.length === 0) {
        await this.updateConversation(conversation.id, 'select_date', {
          ...context,
          selectedStaffId: undefined,
          selectedStaffName: 'Any Available',
        });

        return await this.sendMessage(phoneNumber,
          `Great selection!\n\nPlease enter your preferred date (e.g., "tomorrow", "Jan 15", "2026-01-15"):`
        );
      }

      await this.updateConversation(conversation.id, 'select_professional', context);

      const staffList = staffMembers.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      return await this.sendMessage(phoneNumber,
        `Selected services:\n${context.selectedServices.map(s => `- ${s.name}`).join('\n')}\n\nTotal: AED ${context.totalAmount?.toFixed(0) || 0}\n\nSelect a professional:\n\n0. Any Available\n${staffList}\n\nReply with a number.`
      );
    }

    const serviceIndex = parseInt(input) - 1;
    
    if (isNaN(serviceIndex) || serviceIndex < 0 || serviceIndex >= categoryServices.length) {
      const serviceList = categoryServices.map((s, i) => 
        `${i + 1}. ${s.name} - AED ${Number(s.price).toFixed(0)}`
      ).join('\n');
      return await this.sendMessage(phoneNumber,
        `Please select a valid service:\n\n${serviceList}\n\nOr reply "done" when finished.`
      );
    }

    const selectedService = categoryServices[serviceIndex];
    const currentServices = context.selectedServices || [];
    
    const alreadySelected = currentServices.some(s => s.id === selectedService.id);
    if (alreadySelected) {
      return await this.sendMessage(phoneNumber,
        `${selectedService.name} is already selected. Reply "done" to continue or select another service.`
      );
    }

    const updatedServices = [
      ...currentServices,
      {
        id: selectedService.id,
        name: selectedService.name,
        price: Number(selectedService.price),
        duration: selectedService.duration,
      }
    ];

    const totalAmount = updatedServices.reduce((sum, s) => sum + s.price, 0);
    const totalDuration = updatedServices.reduce((sum, s) => sum + s.duration, 0);

    await this.updateConversation(conversation.id, 'select_service', {
      ...context,
      selectedServices: updatedServices,
      totalAmount,
      totalDuration,
    });

    const serviceList = categoryServices.map((s, i) => 
      `${i + 1}. ${s.name} - AED ${Number(s.price).toFixed(0)}`
    ).join('\n');

    return await this.sendMessage(phoneNumber,
      `Added: ${selectedService.name}\n\nCurrent selection:\n${updatedServices.map(s => `- ${s.name}`).join('\n')}\n\nTotal: AED ${totalAmount.toFixed(0)} (${totalDuration} min)\n\n${serviceList}\n\nSelect another or reply "done" to continue.`
    );
  }

  private async handleSelectProfessional(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const context = conversation.context as ConversationContext;
    
    const staffMembers = await db
      .select()
      .from(staff)
      .where(
        and(
          eq(staff.spaId, context.spaId!),
          eq(staff.active, true)
        )
      );

    const staffIndex = parseInt(input);
    
    if (isNaN(staffIndex) || staffIndex < 0 || staffIndex > staffMembers.length) {
      const staffList = staffMembers.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      return await this.sendMessage(phoneNumber,
        `Please select a valid option:\n\n0. Any Available\n${staffList}`
      );
    }

    let selectedStaffId: number | undefined;
    let selectedStaffName: string;

    if (staffIndex === 0) {
      selectedStaffName = 'Any Available';
    } else {
      const selectedStaff = staffMembers[staffIndex - 1];
      selectedStaffId = selectedStaff.id;
      selectedStaffName = selectedStaff.name;
    }

    await this.updateConversation(conversation.id, 'select_date', {
      ...context,
      selectedStaffId,
      selectedStaffName,
    });

    return await this.sendMessage(phoneNumber,
      `Selected: ${selectedStaffName}\n\nPlease enter your preferred date (e.g., "tomorrow", "Jan 15", "2026-01-15"):`
    );
  }

  private async handleSelectDate(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const context = conversation.context as ConversationContext;
    
    const parsedDate = this.parseDate(input);
    
    if (!parsedDate) {
      return await this.sendMessage(phoneNumber,
        "I couldn't understand that date. Please try again (e.g., \"tomorrow\", \"Jan 15\", \"2026-01-15\"):"
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (parsedDate < today) {
      return await this.sendMessage(phoneNumber,
        "Please select a date in the future:"
      );
    }

    const dateStr = parsedDate.toISOString().split('T')[0];

    await this.updateConversation(conversation.id, 'select_time', {
      ...context,
      selectedDate: dateStr,
    });

    const timeSlots = this.generateTimeSlots();
    const slotList = timeSlots.map((t, i) => `${i + 1}. ${t}`).join('\n');

    return await this.sendMessage(phoneNumber,
      `Date: ${dateStr}\n\nAvailable times:\n\n${slotList}\n\nReply with a number or enter a time (e.g., "10:30 AM"):`
    );
  }

  private async handleSelectTime(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const context = conversation.context as ConversationContext;
    
    const timeSlots = this.generateTimeSlots();
    let selectedTime: string;

    const timeIndex = parseInt(input) - 1;
    if (!isNaN(timeIndex) && timeIndex >= 0 && timeIndex < timeSlots.length) {
      selectedTime = timeSlots[timeIndex];
    } else {
      selectedTime = input.toUpperCase();
      if (!/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(input)) {
        const slotList = timeSlots.map((t, i) => `${i + 1}. ${t}`).join('\n');
        return await this.sendMessage(phoneNumber,
          `Please select a valid time:\n\n${slotList}`
        );
      }
    }

    await this.updateConversation(conversation.id, 'confirm_details', {
      ...context,
      selectedTime,
    });

    const summary = this.buildBookingSummary(context, selectedTime);
    
    return await this.sendInteractiveButtons(phoneNumber,
      summary,
      [
        { id: 'confirm', title: '✅ Confirm Booking' },
        { id: 'cancel', title: '❌ Cancel' },
      ]
    );
  }

  private async handleConfirmDetails(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const context = conversation.context as ConversationContext;

    if (input === 'cancel' || input === '2' || input.includes('cancel')) {
      await this.resetConversation(conversation.id);
      return await this.sendMessage(phoneNumber,
        "Booking cancelled. Reply anytime to start a new booking!"
      );
    }

    if (input !== 'confirm' && input !== '1' && !input.includes('confirm')) {
      const summary = this.buildBookingSummary(context, context.selectedTime!);
      return await this.sendInteractiveButtons(phoneNumber,
        summary,
        [
          { id: 'confirm', title: '✅ Confirm Booking' },
          { id: 'cancel', title: '❌ Cancel' },
        ]
      );
    }

    let customer = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, phoneNumber))
      .limit(1)
      .then(rows => rows[0]);

    if (!customer) {
      const [newCustomer] = await db
        .insert(customers)
        .values({
          name: `WhatsApp User`,
          phone: phoneNumber,
        })
        .returning();
      customer = newCustomer;
    }

    const bookingDate = new Date(`${context.selectedDate}T${this.parseTimeToIso(context.selectedTime!)}:00`);

    const [booking] = await db
      .insert(bookings)
      .values({
        spaId: context.spaId!,
        customerId: customer.id,
        staffId: context.selectedStaffId || undefined,
        bookingDate: bookingDate,
        totalAmount: String(context.totalAmount || 0),
        status: 'confirmed',
        notes: `WhatsApp Booking | Location: ${context.locationType === 'home' ? 'Home Service' : 'At Spa'} | Services: ${context.selectedServices?.map(s => s.name).join(', ')}`,
      })
      .returning();

    await db
      .update(whatsappConversations)
      .set({ 
        customerId: customer.id,
        spaId: context.spaId!,
      })
      .where(eq(whatsappConversations.id, conversation.id));

    await this.updateConversation(conversation.id, 'payment', {
      ...context,
      bookingId: booking.id,
    });

    let paymentUrl: string | null = null;
    try {
      paymentUrl = await createPaymentLink(
        booking.id,
        context.totalAmount || 0,
        context.spaName || 'Spa',
        context.selectedServices?.map(s => s.name) || []
      );
    } catch (error) {
      console.error('Failed to create payment link:', error);
    }

    if (paymentUrl) {
      return await this.sendMessage(phoneNumber,
        `🎉 Booking Created!\n\nBooking #${booking.id}\n📅 ${context.selectedDate} at ${context.selectedTime}\n👤 ${context.selectedStaffName}\n📍 ${context.locationType === 'home' ? 'Home Service' : `At ${context.spaName}`}\n\nServices:\n${context.selectedServices?.map(s => `- ${s.name}`).join('\n')}\n\n💰 Total: AED ${context.totalAmount?.toFixed(0)}\n\n💳 Complete your payment here:\n${paymentUrl}\n\nOnce paid, you'll receive a confirmation message. Reply "pay later" to pay at the venue instead.`
      );
    } else {
      await this.updateConversation(conversation.id, 'completed', context);
      return await this.sendMessage(phoneNumber,
        `🎉 Booking Confirmed!\n\nBooking #${booking.id}\n📅 ${context.selectedDate} at ${context.selectedTime}\n👤 ${context.selectedStaffName}\n📍 ${context.locationType === 'home' ? 'Home Service' : `At ${context.spaName}`}\n\nServices:\n${context.selectedServices?.map(s => `- ${s.name}`).join('\n')}\n\nTotal: AED ${context.totalAmount?.toFixed(0)}\n\nPayment will be collected at the venue. We look forward to seeing you! Reply anytime to make another booking.`
      );
    }
  }

  private async handlePayment(phoneNumber: string, conversation: WhatsappConversation, input: string): Promise<string> {
    const context = conversation.context as ConversationContext & { bookingId?: number };
    
    if (input.includes('pay later') || input.includes('paylater') || input === 'later') {
      await db
        .update(bookings)
        .set({ notes: sql`notes || ' | Payment: Pay at venue'` })
        .where(eq(bookings.id, context.bookingId!));
      
      await this.updateConversation(conversation.id, 'completed', context);
      
      return await this.sendMessage(phoneNumber,
        `✅ No problem! Your booking #${context.bookingId} is confirmed.\n\n📍 Payment will be collected at the venue.\n📅 ${context.selectedDate} at ${context.selectedTime}\n\nWe look forward to seeing you! Reply anytime to make another booking.`
      );
    }

    if (input === 'paid' || input.includes('completed') || input.includes('done')) {
      return await this.sendMessage(phoneNumber,
        `Thank you! We'll verify your payment shortly and send you a confirmation. If you have any issues, please contact the spa directly.`
      );
    }

    return await this.sendMessage(phoneNumber,
      `Your booking #${context.bookingId} is awaiting payment.\n\n💳 Please complete your payment using the link above, or reply "pay later" to pay at the venue instead.`
    );
  }

  private async sendCompletedMessage(phoneNumber: string, conversation: WhatsappConversation): Promise<string> {
    await this.resetConversation(conversation.id);
    return await this.sendWelcomeMessage(phoneNumber, conversation);
  }

  private buildBookingSummary(context: ConversationContext, selectedTime: string): string {
    return `📋 Booking Summary\n\n📍 ${context.spaName}\n🏠 ${context.locationType === 'home' ? 'Home Service' : 'At Spa'}\n📅 ${context.selectedDate}\n⏰ ${selectedTime}\n👤 ${context.selectedStaffName}\n\nServices:\n${context.selectedServices?.map(s => `- ${s.name} (AED ${s.price})`).join('\n')}\n\n💰 Total: AED ${context.totalAmount?.toFixed(0)}\n⏱ Duration: ${context.totalDuration} minutes\n\nReply to confirm or cancel:`;
  }

  private parseDate(input: string): Date | null {
    const today = new Date();
    const lowered = input.toLowerCase();

    if (lowered === 'today') return today;
    
    if (lowered === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return new Date(input);
    }

    const monthMatch = input.match(/^([a-z]+)\s+(\d{1,2})$/i);
    if (monthMatch) {
      const months: Record<string, number> = {
        jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
        apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
        aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
        nov: 10, november: 10, dec: 11, december: 11,
      };
      const month = months[monthMatch[1].toLowerCase()];
      if (month !== undefined) {
        const date = new Date(today.getFullYear(), month, parseInt(monthMatch[2]));
        if (date < today) {
          date.setFullYear(date.getFullYear() + 1);
        }
        return date;
      }
    }

    return null;
  }

  private parseTimeToIso(time: string): string {
    const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return '09:00';

    let hours = parseInt(match[1]);
    const minutes = match[2];
    const period = match[3]?.toUpperCase();

    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  private generateTimeSlots(): string[] {
    const slots: string[] = [];
    for (let hour = 9; hour <= 20; hour++) {
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      slots.push(`${displayHour}:00 ${period}`);
      if (hour < 20) {
        slots.push(`${displayHour}:30 ${period}`);
      }
    }
    return slots;
  }

  async sendDirectMessage(phoneNumber: string, message: string): Promise<void> {
    await this.sendMessage(phoneNumber, message);
  }
}

export const whatsappBookingService = new WhatsAppBookingService();
export default whatsappBookingService;
