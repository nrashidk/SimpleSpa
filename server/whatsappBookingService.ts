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
  customerReviews,
  spaNotificationCredentials,
  type WhatsappConversation,
  type WhatsappConversationState,
} from "@shared/schema";
import { eq, and, desc, gte, isNull, or, sql } from "drizzle-orm";
import twilio from "twilio";
import { createPaymentLink } from "./stripeClient";
import { decryptJSON } from "./encryptionService";

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
  reviewRating?: number;
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

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  spaId: number;
  spaName?: string;
}

interface RequestContext {
  twilioClient: any;
  fromNumber: string;
  spaId: number;
  spaName: string | null;
}

class WhatsAppBookingService {
  private async getContextForSpa(spaId: number): Promise<RequestContext | null> {
    const [credential] = await db
      .select()
      .from(spaNotificationCredentials)
      .where(
        and(
          eq(spaNotificationCredentials.spaId, spaId),
          eq(spaNotificationCredentials.channel, 'whatsapp'),
          eq(spaNotificationCredentials.status, 'active')
        )
      );

    if (!credential?.encryptedCredentials) {
      return null;
    }

    try {
      const decrypted = decryptJSON<{ accountSid: string; authToken: string }>(credential.encryptedCredentials);
      const [spa] = await db.select().from(spas).where(eq(spas.id, spaId));
      
      return {
        twilioClient: twilio(decrypted.accountSid, decrypted.authToken),
        fromNumber: credential.fromPhone || '',
        spaId,
        spaName: spa?.name || null,
      };
    } catch {
      return null;
    }
  }

  async handleInboundMessage(message: TwilioInboundMessage, credentials: TwilioCredentials): Promise<string> {
    const phoneNumber = message.From.replace('whatsapp:', '');
    const messageBody = message.Body?.trim().toLowerCase() || '';
    const buttonPayload = message.ButtonPayload;
    
    const ctx: RequestContext = {
      twilioClient: twilio(credentials.accountSid, credentials.authToken),
      fromNumber: credentials.fromNumber,
      spaId: credentials.spaId,
      spaName: credentials.spaName || null,
    };
    
    let conversation = await this.getOrCreateConversation(phoneNumber, ctx.spaId);
    
    if (messageBody === 'cancel' || messageBody === 'start over' || messageBody === 'restart') {
      conversation = await this.resetConversation(conversation.id);
      return await this.sendWelcomeMessage(phoneNumber, conversation, ctx);
    }

    const idleStates = ['welcome', 'completed', 'review_completed'];
    if ((messageBody === 'rate' || messageBody === 'review' || messageBody === 'feedback') && 
        idleStates.includes(conversation.state)) {
      return await this.startOptInReview(phoneNumber, conversation, ctx);
    }

    const input = buttonPayload || messageBody;
    
    switch (conversation.state) {
      case 'welcome':
        return await this.handleWelcome(phoneNumber, conversation, input, ctx);
      case 'select_spa':
        return await this.handleSelectSpa(phoneNumber, conversation, input, ctx);
      case 'select_location':
        return await this.handleSelectLocation(phoneNumber, conversation, input, ctx);
      case 'select_category':
        return await this.handleSelectCategory(phoneNumber, conversation, input, ctx);
      case 'select_service':
        return await this.handleSelectService(phoneNumber, conversation, input, ctx);
      case 'select_professional':
        return await this.handleSelectProfessional(phoneNumber, conversation, input, ctx);
      case 'select_date':
        return await this.handleSelectDate(phoneNumber, conversation, input, ctx);
      case 'select_time':
        return await this.handleSelectTime(phoneNumber, conversation, input, ctx);
      case 'confirm_details':
        return await this.handleConfirmDetails(phoneNumber, conversation, input, ctx);
      case 'payment':
        return await this.handlePayment(phoneNumber, conversation, input, ctx);
      case 'completed':
        if (messageBody === 'hi' || messageBody === 'hello' || messageBody === 'book' || messageBody === 'hey') {
          conversation = await this.resetConversation(conversation.id);
          return await this.sendWelcomeMessage(phoneNumber, conversation, ctx);
        }
        return await this.sendCompletedMessage(phoneNumber, conversation, ctx);
      case 'review_rating':
        if (messageBody === 'skip' || messageBody === 'book' || messageBody === 'later') {
          conversation = await this.resetConversation(conversation.id);
          return await this.sendWelcomeMessage(phoneNumber, conversation, ctx);
        }
        return await this.handleReviewRating(phoneNumber, conversation, input, ctx);
      case 'review_comment':
        if (messageBody === 'skip' || messageBody === 'book' || messageBody === 'later') {
          conversation = await this.resetConversation(conversation.id);
          return await this.sendWelcomeMessage(phoneNumber, conversation, ctx);
        }
        return await this.handleReviewComment(phoneNumber, conversation, input, ctx);
      case 'review_completed':
        if (messageBody === 'book' || messageBody === 'hi' || messageBody === 'hello') {
          conversation = await this.resetConversation(conversation.id);
          return await this.sendWelcomeMessage(phoneNumber, conversation, ctx);
        }
        return await this.sendReviewCompletedMessage(phoneNumber, conversation, ctx);
      default:
        return await this.sendWelcomeMessage(phoneNumber, conversation, ctx);
    }
  }

  private async getOrCreateConversation(phoneNumber: string, spaId: number): Promise<WhatsappConversation> {
    const now = new Date();
    
    const validConversations = await db
      .select()
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.phoneNumber, phoneNumber),
          eq(whatsappConversations.spaId, spaId),
          or(
            isNull(whatsappConversations.expiresAt),
            gte(whatsappConversations.expiresAt, now)
          )
        )
      )
      .orderBy(desc(whatsappConversations.createdAt))
      .limit(5);

    if (validConversations.length > 0) {
      const bookingStates = ['select_spa', 'select_location', 'select_category', 
        'select_service', 'select_professional', 'select_date', 'select_time', 'confirm_details', 'payment'];
      
      const activeBooking = validConversations.find(c => bookingStates.includes(c.state));
      const chosen = activeBooking || validConversations[0];
      
      const [updated] = await db
        .update(whatsappConversations)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(eq(whatsappConversations.id, chosen.id))
        .returning();
      return updated;
    }

    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const [newConversation] = await db
      .insert(whatsappConversations)
      .values({
        phoneNumber,
        spaId,
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

  private async sendMessage(to: string, message: string, ctx: RequestContext): Promise<string> {
    console.log(`📱 [WhatsApp OUT] To: ${to}`);
    console.log(`   Message: ${message.substring(0, 200)}...`);
    
    if (!ctx.twilioClient) {
      console.log('   [DEV MODE - No Twilio client configured]');
      return 'dev-mode-' + Date.now();
    }

    try {
      const result = await ctx.twilioClient.messages.create({
        from: `whatsapp:${ctx.fromNumber}`,
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
    buttons: { id: string; title: string }[],
    ctx: RequestContext
  ): Promise<string> {
    console.log(`📱 [WhatsApp OUT - Buttons] To: ${to}`);
    console.log(`   Body: ${body}`);
    console.log(`   Buttons: ${JSON.stringify(buttons)}`);
    
    if (!ctx.twilioClient) {
      console.log('   [DEV MODE - Sending as text]');
      const buttonText = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
      return await this.sendMessage(to, `${body}\n\n${buttonText}\n\nReply with a number to select.`, ctx);
    }

    try {
      const result = await ctx.twilioClient.messages.create({
        from: `whatsapp:${ctx.fromNumber}`,
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
      return await this.sendMessage(to, `${body}\n\n${buttonText}\n\nReply with a number to select.`, ctx);
    }
  }

  private async sendWelcomeMessage(phoneNumber: string, conversation: WhatsappConversation, ctx: RequestContext): Promise<string> {
    if (ctx.spaId) {
      const [spa] = await db.select().from(spas).where(eq(spas.id, ctx.spaId));
      
      if (spa) {
        await this.updateConversation(conversation.id, 'select_location', {
          spaId: spa.id,
          spaName: spa.name,
        });
        
        return await this.sendInteractiveButtons(phoneNumber,
          `Welcome to ${spa.name}! 🌿\n\nWould you like to book an appointment at our location or request a home service?`,
          [
            { id: 'spa', title: '📍 At Spa' },
            { id: 'home', title: '🏠 Home Service' },
          ],
          ctx
        );
      }
    }

    const allSpas = await db.select().from(spas).where(eq(spas.active, true));
    
    if (allSpas.length === 0) {
      return await this.sendMessage(phoneNumber, 
        "Welcome! Unfortunately, there are no spas available for booking at this time. Please try again later.", ctx);
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
        ],
        ctx
      );
    }

    const context: ConversationContext = {};
    await this.updateConversation(conversation.id, 'select_spa', context);
    
    const spaList = allSpas.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    return await this.sendMessage(phoneNumber,
      `Welcome! 🌿\n\nPlease select a spa:\n\n${spaList}\n\nReply with the number of your choice.`, ctx
    );
  }

  private async handleWelcome(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
    return await this.sendWelcomeMessage(phoneNumber, conversation, ctx);
  }

  private async handleSelectSpa(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
    const allSpas = await db.select().from(spas).where(eq(spas.active, true));
    const spaIndex = parseInt(input) - 1;
    
    if (isNaN(spaIndex) || spaIndex < 0 || spaIndex >= allSpas.length) {
      const spaList = allSpas.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      return await this.sendMessage(phoneNumber,
        `Please select a valid spa number:\n\n${spaList}`, ctx
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
      ],
      ctx
    );
  }

  private async handleSelectLocation(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
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
        ],
        ctx
      );
    }

    const categories = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.spaId, context.spaId!));

    if (categories.length === 0) {
      return await this.sendMessage(phoneNumber,
        "Sorry, there are no service categories available at this time. Please contact the spa directly.", ctx
      );
    }

    await this.updateConversation(conversation.id, 'select_category', {
      ...context,
      locationType,
    });

    const categoryList = categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    return await this.sendMessage(phoneNumber,
      `Perfect! You chose ${locationType === 'home' ? 'Home Service' : 'At Spa'}.\n\nPlease select a service category:\n\n${categoryList}\n\nReply with the number.`, ctx
    );
  }

  private async handleSelectCategory(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
    const context = conversation.context as ConversationContext;
    
    const categories = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.spaId, context.spaId!));

    const categoryIndex = parseInt(input) - 1;
    
    if (isNaN(categoryIndex) || categoryIndex < 0 || categoryIndex >= categories.length) {
      const categoryList = categories.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      return await this.sendMessage(phoneNumber,
        `Please select a valid category:\n\n${categoryList}`, ctx
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
        `No services available in ${selectedCategory.name}. Please select another category:\n\n${categoryList}`, ctx
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
      `Services in ${selectedCategory.name}:\n\n${serviceList}\n\nReply with a number to select a service, or "done" when finished.`, ctx
    );
  }

  private async handleSelectService(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
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
          "Please select at least one service before continuing.", ctx
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
          `Great selection!\n\nPlease enter your preferred date (e.g., "tomorrow", "Jan 15", "2026-01-15"):`, ctx
        );
      }

      await this.updateConversation(conversation.id, 'select_professional', context);

      const staffList = staffMembers.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      return await this.sendMessage(phoneNumber,
        `Selected services:\n${context.selectedServices.map(s => `- ${s.name}`).join('\n')}\n\nTotal: AED ${context.totalAmount?.toFixed(0) || 0}\n\nSelect a professional:\n\n0. Any Available\n${staffList}\n\nReply with a number.`, ctx
      );
    }

    const serviceIndex = parseInt(input) - 1;
    
    if (isNaN(serviceIndex) || serviceIndex < 0 || serviceIndex >= categoryServices.length) {
      const serviceList = categoryServices.map((s, i) => 
        `${i + 1}. ${s.name} - AED ${Number(s.price).toFixed(0)}`
      ).join('\n');
      return await this.sendMessage(phoneNumber,
        `Please select a valid service:\n\n${serviceList}\n\nOr reply "done" when finished.`, ctx
      );
    }

    const selectedService = categoryServices[serviceIndex];
    const currentServices = context.selectedServices || [];
    
    const alreadySelected = currentServices.some(s => s.id === selectedService.id);
    if (alreadySelected) {
      return await this.sendMessage(phoneNumber,
        `${selectedService.name} is already selected. Reply "done" to continue or select another service.`, ctx
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
      `Added: ${selectedService.name}\n\nCurrent selection:\n${updatedServices.map(s => `- ${s.name}`).join('\n')}\n\nTotal: AED ${totalAmount.toFixed(0)} (${totalDuration} min)\n\n${serviceList}\n\nSelect another or reply "done" to continue.`, ctx
    );
  }

  private async handleSelectProfessional(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
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
        `Please select a valid option:\n\n0. Any Available\n${staffList}`, ctx
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
      `Selected: ${selectedStaffName}\n\nPlease enter your preferred date (e.g., "tomorrow", "Jan 15", "2026-01-15"):`, ctx
    );
  }

  private async handleSelectDate(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
    const context = conversation.context as ConversationContext;
    
    const parsedDate = this.parseDate(input);
    
    if (!parsedDate) {
      return await this.sendMessage(phoneNumber,
        "I couldn't understand that date. Please try again (e.g., \"tomorrow\", \"Jan 15\", \"2026-01-15\"):", ctx
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (parsedDate < today) {
      return await this.sendMessage(phoneNumber,
        "Please select a date in the future:", ctx
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
      `Date: ${dateStr}\n\nAvailable times:\n\n${slotList}\n\nReply with a number or enter a time (e.g., "10:30 AM"):`, ctx
    );
  }

  private async handleSelectTime(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
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
          `Please select a valid time:\n\n${slotList}`, ctx
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
      ],
      ctx
    );
  }

  private async handleConfirmDetails(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
    const context = conversation.context as ConversationContext;

    if (input === 'cancel' || input === '2' || input.includes('cancel')) {
      await this.resetConversation(conversation.id);
      return await this.sendMessage(phoneNumber,
        "Booking cancelled. Reply anytime to start a new booking!", ctx
      );
    }

    if (input !== 'confirm' && input !== '1' && !input.includes('confirm')) {
      const summary = this.buildBookingSummary(context, context.selectedTime!);
      return await this.sendInteractiveButtons(phoneNumber,
        summary,
        [
          { id: 'confirm', title: '✅ Confirm Booking' },
          { id: 'cancel', title: '❌ Cancel' },
        ],
        ctx
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
        conversationId: conversation.id,
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
        `🎉 Booking Created!\n\nBooking #${booking.id}\n📅 ${context.selectedDate} at ${context.selectedTime}\n👤 ${context.selectedStaffName}\n📍 ${context.locationType === 'home' ? 'Home Service' : `At ${context.spaName}`}\n\nServices:\n${context.selectedServices?.map(s => `- ${s.name}`).join('\n')}\n\n💰 Total: AED ${context.totalAmount?.toFixed(0)}\n\n💳 Complete your payment here:\n${paymentUrl}\n\nOnce paid, you'll receive a confirmation message. Reply "pay later" to pay at the venue instead.`, ctx
      );
    } else {
      await this.updateConversation(conversation.id, 'completed', context);
      return await this.sendMessage(phoneNumber,
        `🎉 Booking Confirmed!\n\nBooking #${booking.id}\n📅 ${context.selectedDate} at ${context.selectedTime}\n👤 ${context.selectedStaffName}\n📍 ${context.locationType === 'home' ? 'Home Service' : `At ${context.spaName}`}\n\nServices:\n${context.selectedServices?.map(s => `- ${s.name}`).join('\n')}\n\nTotal: AED ${context.totalAmount?.toFixed(0)}\n\nPayment will be collected at the venue. We look forward to seeing you! Reply anytime to make another booking.`, ctx
      );
    }
  }

  private async handlePayment(phoneNumber: string, conversation: WhatsappConversation, input: string, ctx: RequestContext): Promise<string> {
    const context = conversation.context as ConversationContext & { bookingId?: number };
    
    if (input.includes('pay later') || input.includes('paylater') || input === 'later') {
      await db
        .update(bookings)
        .set({ notes: sql`notes || ' | Payment: Pay at venue'` })
        .where(eq(bookings.id, context.bookingId!));
      
      await this.updateConversation(conversation.id, 'completed', context);
      
      return await this.sendMessage(phoneNumber,
        `✅ No problem! Your booking #${context.bookingId} is confirmed.\n\n📍 Payment will be collected at the venue.\n📅 ${context.selectedDate} at ${context.selectedTime}\n\nWe look forward to seeing you! Reply anytime to make another booking.`, ctx
      );
    }

    if (input === 'paid' || input.includes('completed') || input.includes('done')) {
      return await this.sendMessage(phoneNumber,
        `Thank you! We'll verify your payment shortly and send you a confirmation. If you have any issues, please contact the spa directly.`, ctx
      );
    }

    return await this.sendMessage(phoneNumber,
      `Your booking #${context.bookingId} is awaiting payment.\n\n💳 Please complete your payment using the link above, or reply "pay later" to pay at the venue instead.`, ctx
    );
  }

  private async sendCompletedMessage(phoneNumber: string, conversation: WhatsappConversation, ctx: RequestContext): Promise<string> {
    await this.resetConversation(conversation.id);
    return await this.sendWelcomeMessage(phoneNumber, conversation, ctx);
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

  async sendDirectMessage(phoneNumber: string, message: string, spaId: number): Promise<void> {
    const ctx = await this.getContextForSpa(spaId);
    if (!ctx) {
      console.log(`[WhatsApp] Cannot send message: no credentials for spa ${spaId}`);
      return;
    }
    await this.sendMessage(phoneNumber, message, ctx);
  }

  async startReviewFlow(bookingId: number): Promise<boolean> {
    const [booking] = await db
      .select({
        id: bookings.id,
        customerId: bookings.customerId,
        spaId: bookings.spaId,
        staffId: bookings.staffId,
        status: bookings.status,
        conversationId: bookings.conversationId,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId));

    if (!booking?.customerId) return false;
    
    if (booking.status !== 'completed') {
      console.log(`[Review] Booking #${bookingId} not completed (status: ${booking.status}), skipping review`);
      return false;
    }

    const [customer] = await db
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, booking.customerId));

    if (!customer?.phone) return false;

    const [spa] = await db
      .select({ name: spas.name })
      .from(spas)
      .where(eq(spas.id, booking.spaId!));

    const ctx = await this.getContextForSpa(booking.spaId!);
    if (!ctx) {
      console.log(`[Review] No WhatsApp credentials for spa ${booking.spaId}, skipping review`);
      return false;
    }
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (booking.conversationId) {
      const [originalConversation] = await db
        .select()
        .from(whatsappConversations)
        .where(eq(whatsappConversations.id, booking.conversationId));

      if (originalConversation) {
        const convContext = originalConversation.context as ConversationContext || {};
        const convState = originalConversation.state;
        
        const midBookingStates = ['select_spa', 'select_location', 'select_category', 
          'select_service', 'select_professional', 'select_date', 'select_time', 'confirm_details', 'payment'];
        
        const isInUseForDifferentBooking = midBookingStates.includes(convState) || 
          (convContext.bookingId && convContext.bookingId !== booking.id);
        
        if (isInUseForDifferentBooking) {
          console.log(`[Review] Conversation #${booking.conversationId} busy with different booking, deferring review for booking #${booking.id}`);
          return false;
        }

        await db
          .update(whatsappConversations)
          .set({
            state: 'review_rating',
            context: { 
              bookingId: booking.id, 
              spaId: booking.spaId,
              spaName: spa?.name || 'our spa',
              selectedStaffId: booking.staffId,
            },
            expiresAt,
            updatedAt: now,
          })
          .where(eq(whatsappConversations.id, booking.conversationId));

        const message = `Hi! Thank you for visiting ${spa?.name || 'us'} today. We'd love to hear about your experience!

Please rate your visit from 1-5 stars:
1 = Poor
2 = Fair
3 = Good
4 = Very Good
5 = Excellent

Reply with a number (1-5), or type "skip" to book a new appointment instead.`;

        await this.sendMessage(customer.phone, message, ctx);
        await this.logMessage(booking.conversationId, 'outbound', 'text', message);
        return true;
      }
    }

    const existingConversations = await db
      .select()
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.phoneNumber, customer.phone),
          eq(whatsappConversations.spaId, booking.spaId!)
        )
      )
      .orderBy(desc(whatsappConversations.createdAt))
      .limit(1);

    if (existingConversations.length > 0) {
      const existing = existingConversations[0];
      const existingContext = existing.context as ConversationContext || {};
      const midBookingStates = ['select_spa', 'select_location', 'select_category', 
        'select_service', 'select_professional', 'select_date', 'select_time', 'confirm_details', 'payment'];
      
      if (midBookingStates.includes(existing.state) || 
          (existingContext.bookingId && existingContext.bookingId !== booking.id)) {
        console.log(`[Review] Existing conversation busy, deferring review for booking #${booking.id}`);
        return false;
      }
      
      await db
        .update(whatsappConversations)
        .set({
          state: 'review_rating',
          context: { 
            bookingId: booking.id, 
            spaId: booking.spaId,
            spaName: spa?.name || 'our spa',
            selectedStaffId: booking.staffId,
          },
          expiresAt,
          updatedAt: now,
        })
        .where(eq(whatsappConversations.id, existing.id));

      const message = `Hi! Thank you for visiting ${spa?.name || 'us'} today. We'd love to hear about your experience!

Please rate your visit from 1-5 stars:
1 = Poor
2 = Fair
3 = Good
4 = Very Good
5 = Excellent

Reply with a number (1-5), or type "skip" to book a new appointment instead.`;

      await this.sendMessage(customer.phone, message, ctx);
      await this.logMessage(existing.id, 'outbound', 'text', message);
      return true;
    }

    const [conversation] = await db
      .insert(whatsappConversations)
      .values({
        phoneNumber: customer.phone,
        spaId: booking.spaId,
        customerId: booking.customerId,
        state: 'review_rating',
        context: { 
          bookingId: booking.id, 
          spaId: booking.spaId,
          spaName: spa?.name || 'our spa',
          selectedStaffId: booking.staffId,
        },
        expiresAt,
      })
      .returning();

    const message = `Hi! Thank you for visiting ${spa?.name || 'us'} today. We'd love to hear about your experience!

Please rate your visit from 1-5 stars:
1 = Poor
2 = Fair
3 = Good
4 = Very Good
5 = Excellent

Reply with a number (1-5), or type "skip" to book a new appointment instead.`;

    await this.sendMessage(customer.phone, message, ctx);
    await this.logMessage(conversation.id, 'outbound', 'text', message);
    return true;
  }

  private async handleReviewRating(
    phoneNumber: string,
    conversation: WhatsappConversation,
    input: string,
    ctx: RequestContext
  ): Promise<string> {
    const rating = parseInt(input, 10);
    
    if (isNaN(rating) || rating < 1 || rating > 5) {
      const message = "Please reply with a number from 1 to 5 to rate your experience.";
      await this.sendMessage(phoneNumber, message, ctx);
      return message;
    }

    const context = (conversation.context as ConversationContext) || {};
    context.reviewRating = rating;

    await db
      .update(whatsappConversations)
      .set({
        state: 'review_comment',
        context,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversation.id));

    const stars = '⭐'.repeat(rating);
    const message = `Thank you for your ${rating}-star rating! ${stars}

Would you like to leave a comment about your experience? (This helps us improve!)

Reply with your comment, or type "skip" to finish.`;

    await this.sendMessage(phoneNumber, message, ctx);
    await this.logMessage(conversation.id, 'outbound', 'text', message);
    return message;
  }

  private async handleReviewComment(
    phoneNumber: string,
    conversation: WhatsappConversation,
    input: string,
    ctx: RequestContext
  ): Promise<string> {
    const context = (conversation.context as ConversationContext) || {};
    const comment = input.toLowerCase() === 'skip' ? null : input;

    const existingReview = await db
      .select({ id: customerReviews.id })
      .from(customerReviews)
      .where(eq(customerReviews.bookingId, context.bookingId!))
      .limit(1);

    if (existingReview.length === 0) {
      await db.insert(customerReviews).values({
        spaId: context.spaId!,
        customerId: conversation.customerId!,
        bookingId: context.bookingId!,
        rating: context.reviewRating!,
        comment: comment,
        staffId: context.selectedStaffId,
        source: 'whatsapp',
        isPublic: true,
      });
    }
    
    const message = `Thank you so much for your feedback! We truly appreciate you taking the time to share your experience with ${context.spaName || 'us'}.

We look forward to seeing you again soon! 💆‍♀️

Reply "hi" to book your next appointment.`;

    await db
      .update(whatsappConversations)
      .set({
        state: 'welcome',
        context: {},
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversation.id));

    await this.sendMessage(phoneNumber, message, ctx);
    await this.logMessage(conversation.id, 'outbound', 'text', message);
    return message;
  }

  private async sendReviewCompletedMessage(
    phoneNumber: string,
    conversation: WhatsappConversation,
    ctx: RequestContext
  ): Promise<string> {
    const context = (conversation.context as ConversationContext) || {};
    
    const message = `Thank you for your review! Reply "hi" to book your next appointment.`;

    await this.sendMessage(phoneNumber, message, ctx);
    await this.logMessage(conversation.id, 'outbound', 'text', message);
    return message;
  }

  async sendIdleGatedReviewPrompt(bookingId: number): Promise<boolean> {
    const [booking] = await db
      .select({
        id: bookings.id,
        customerId: bookings.customerId,
        spaId: bookings.spaId,
        staffId: bookings.staffId,
        status: bookings.status,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId));

    if (!booking?.customerId) return false;
    
    if (booking.status !== 'completed') {
      console.log(`[Review] Booking #${bookingId} not completed, skipping`);
      return false;
    }

    const [customer] = await db
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, booking.customerId));

    if (!customer?.phone) return false;

    const [spa] = await db
      .select({ name: spas.name })
      .from(spas)
      .where(eq(spas.id, booking.spaId!));

    const ctx = await this.getContextForSpa(booking.spaId!);
    if (!ctx) {
      console.log(`[Review] No WhatsApp credentials for spa ${booking.spaId}, skipping`);
      return false;
    }

    const conversations = await db
      .select()
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.phoneNumber, customer.phone),
          eq(whatsappConversations.spaId, booking.spaId!)
        )
      )
      .orderBy(desc(whatsappConversations.createdAt))
      .limit(1);

    const conversation = conversations[0];
    if (!conversation) {
      console.log(`[Review] No conversation found for ${customer.phone} at spa ${booking.spaId}, skipping`);
      return false;
    }

    const idleStates = ['welcome', 'completed', 'review_completed'];
    if (!idleStates.includes(conversation.state)) {
      console.log(`[Review] Conversation busy (state: ${conversation.state}), deferring review for booking #${bookingId}`);
      return false;
    }

    const convContext = conversation.context as ConversationContext || {};
    const midBookingStates = ['select_spa', 'select_location', 'select_category', 
      'select_service', 'select_professional', 'select_date', 'select_time', 'confirm_details', 'payment'];
    if (convContext.bookingId && convContext.bookingId !== bookingId && midBookingStates.includes(conversation.state)) {
      console.log(`[Review] Conversation has active booking, deferring`);
      return false;
    }

    await db
      .update(whatsappConversations)
      .set({
        state: 'review_rating',
        context: {
          bookingId: booking.id,
          spaId: booking.spaId,
          spaName: spa?.name || 'our spa',
          selectedStaffId: booking.staffId,
        },
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversation.id));

    const message = `Hi! Thank you for visiting ${spa?.name || 'us'}! We'd love to hear about your experience.

Please rate your visit from 1-5 stars:
1 = Poor
2 = Fair  
3 = Good
4 = Very Good
5 = Excellent

Reply with a number (1-5), or type "skip" to book a new appointment instead.`;

    await this.sendMessage(customer.phone, message, ctx);
    await this.logMessage(conversation.id, 'outbound', 'text', message);
    return true;
  }

  private async startOptInReview(
    phoneNumber: string,
    conversation: WhatsappConversation,
    ctx: RequestContext
  ): Promise<string> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.phone, phoneNumber),
          eq(customers.spaId, ctx.spaId)
        )
      )
      .limit(1);

    if (!customer) {
      const message = "You don't have any recent appointments to review. Reply 'hi' to book an appointment!";
      await this.sendMessage(phoneNumber, message, ctx);
      return message;
    }

    const whereConditions = [
      eq(bookings.customerId, customer.id),
      eq(bookings.status, 'completed'),
      eq(bookings.spaId, ctx.spaId),
      isNull(customerReviews.id)
    ];

    const [recentBooking] = await db
      .select({
        id: bookings.id,
        spaId: bookings.spaId,
        staffId: bookings.staffId,
        bookingDate: bookings.bookingDate,
      })
      .from(bookings)
      .leftJoin(customerReviews, eq(customerReviews.bookingId, bookings.id))
      .where(and(...whereConditions))
      .orderBy(desc(bookings.bookingDate))
      .limit(1);

    if (!recentBooking) {
      const message = "You don't have any recent appointments to review, or you've already rated them. Reply 'hi' to book a new appointment!";
      await this.sendMessage(phoneNumber, message, ctx);
      return message;
    }

    const [spa] = await db
      .select({ name: spas.name })
      .from(spas)
      .where(eq(spas.id, recentBooking.spaId!));

    await db
      .update(whatsappConversations)
      .set({
        state: 'review_rating',
        context: {
          bookingId: recentBooking.id,
          spaId: recentBooking.spaId,
          spaName: spa?.name || 'our spa',
          selectedStaffId: recentBooking.staffId,
        },
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversation.id));

    const message = `Thank you for choosing to share your feedback about ${spa?.name || 'our spa'}!

Please rate your visit from 1-5 stars:
1 = Poor
2 = Fair
3 = Good
4 = Very Good
5 = Excellent

Reply with a number (1-5), or type "skip" to go back to booking.`;

    await this.sendMessage(phoneNumber, message, ctx);
    await this.logMessage(conversation.id, 'outbound', 'text', message);
    return message;
  }
}

export const whatsappBookingService = new WhatsAppBookingService();
export default whatsappBookingService;
