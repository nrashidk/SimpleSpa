# OAuth Integration Pattern Documentation

## Overview
This document outlines the proven pattern for adding FREE third-party OAuth integrations to the Serene Spa platform using the BYOA (Bring Your Own API keys) model.

## Successfully Implemented: Google Calendar

### Architecture Components

#### 1. Database Schema (shared/schema.ts)
```typescript
export const spaIntegrations = pgTable("spa_integrations", {
  id: serial("id").primaryKey(),
  spaId: integer("spa_id").references(() => spas.id),
  integrationName: varchar("integration_name", { length: 50 }).notNull(),
  encryptedTokens: text("encrypted_tokens").notNull(),
  metadata: jsonb("metadata"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
}, (table) => ({
  uniqueSpaIntegration: unique().on(table.spaId, table.integrationName),
}));
```

**Key Features:**
- AES-256-GCM encryption for OAuth tokens
- Unique constraint per spa + integration
- JSONB metadata for provider-specific config
- Sync tracking with lastSyncAt

#### 2. OAuth Service (server/oauthService.ts)
```typescript
class OAuthService {
  static async initiateOAuth(provider, spaId, state): Promise<string>
  static async handleCallback(provider, code, state): Promise<OAuthTokens>
  static async refreshAccessToken(provider, refreshToken): Promise<OAuthTokens>
  static async disconnectIntegration(spaId, provider): Promise<void>
}
```

**Supported Providers:**
- Google (Calendar, My Business, Analytics, Meet)
- HubSpot CRM (free tier)
- Mailchimp (free tier)

#### 3. Integration API Service (server/googleCalendarService.ts)
```typescript
export class GoogleCalendarService {
  static async listCalendars(accessToken: string): Promise<GoogleCalendar[]>
  static async createEvent(accessToken, calendarId, event): Promise<GoogleCalendarEvent>
  static async updateEvent(accessToken, calendarId, eventId, event): Promise<GoogleCalendarEvent>
  static async deleteEvent(accessToken, calendarId, eventId): Promise<void>
  static async listEvents(accessToken, calendarId, timeMin, timeMax): Promise<GoogleCalendarEvent[]>
  static async checkConflicts(accessToken, calendarId, startTime, endTime): Promise<boolean>
  static createEventFromBooking(booking): GoogleCalendarEvent
}
```

**Design Pattern:**
- All methods are static
- accessToken passed as first parameter
- No instance state - pure functions
- Clean separation of concerns

#### 4. API Routes (server/routes.ts)

**OAuth Flow Routes:**
```typescript
POST /api/auth/google/connect         // Initiate OAuth
GET  /api/auth/google/callback        // Handle OAuth callback
POST /api/auth/google/disconnect      // Remove integration
GET  /api/integrations/:spaId         // List active integrations
```

**Key Security Features:**
- State parameter validation (prevents CSRF)
- Encrypted token storage
- Automatic token refresh
- Graceful error handling

#### 5. Bidirectional Sync

**Booking → Calendar:**
```typescript
// In POST /api/bookings
async function syncBookingToCalendar(booking) {
  // Preserve timezone - use ISO strings directly, no conversion
  const bookingDateTime = new Date(booking.bookingDate);
  
  const event = GoogleCalendarService.createEventFromBooking({
    ...booking,
    appointmentDate: bookingDateTime.toISOString().split('T')[0],
    appointmentTime: bookingDateTime.toISOString().split('T')[1].substring(0, 5),
    timeZone: spa.timeZone || 'Asia/Dubai', // Use spa's timezone
  });
  
  // Get staff-specific calendar from integration metadata
  const integrationMetadata = integration.metadata as any;
  const calendarId = integrationMetadata?.staffCalendars?.[staffEmail] || 'primary';
  
  const calendarEvent = await GoogleCalendarService.createEvent(
    accessToken,
    calendarId, // Use staff's calendar, not hardcoded 'primary'
    event
  );
  // Store calendarEventId in booking metadata
}
```

**Calendar → Booking (Conflict Prevention):**
```typescript
// In timeSlotService.ts
async function generateTimeSlots(date, staffId, spaId) {
  // Check internal bookings
  const bookings = await storage.getBookingsByDateAndStaff(date, staffId);
  
  // Check Google Calendar events for THIS STAFF MEMBER
  const integration = await storage.getIntegration(spaId, 'google_calendar');
  if (integration && staffEmail) {
    // Get staff-specific calendar
    const integrationMetadata = integration.metadata as any;
    const calendarId = integrationMetadata?.staffCalendars?.[staffEmail] || 'primary';
    
    // Use RFC3339 format without timezone conversion
    const events = await GoogleCalendarService.listEvents(
      accessToken,
      calendarId, // Staff-specific calendar
      `${date}T00:00:00`,
      `${date}T23:59:59`
    );
    // Merge conflicts from both sources
  }
}
```

#### 6. Admin UI (client/src/pages/admin/Settings.tsx)

**Integration Status Component:**
```tsx
function IntegrationCard({ integration, onConnect, onDisconnect }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{integration.name}</CardTitle>
        <Badge variant={isConnected ? "success" : "secondary"}>
          {isConnected ? "Connected" : "Not Connected"}
        </Badge>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <Button onClick={onDisconnect}>Disconnect</Button>
        ) : (
          <Button onClick={onConnect}>Connect</Button>
        )}
      </CardContent>
    </Card>
  );
}
```

**OAuth Callback Handler:**
```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  
  if (code && state) {
    handleOAuthCallback(code, state);
  }
}, []);
```

## Pattern for Remaining 7 Integrations

### 1. Google My Business (Reviews & SEO)
**Free Tier:** Unlimited reviews, business info API  
**API Service:** `server/googleMyBusinessService.ts`  
**Key Methods:**
- `listLocations(accessToken)` - Get spa locations
- `listReviews(accessToken, locationId)` - Fetch reviews
- `replyToReview(accessToken, reviewId, reply)` - Respond to reviews

**Sync Logic:**
- Poll for new reviews every 6 hours
- Auto-notify spa owner of new reviews
- Display reviews in admin dashboard

### 2. Google Analytics (Conversion Tracking)
**Free Tier:** 10M events/month  
**API Service:** `server/googleAnalyticsService.ts`  
**Key Methods:**
- `trackBooking(accessToken, propertyId, booking)` - Track conversion
- `getBookingStats(accessToken, propertyId, dateRange)` - Analytics data

**Integration Points:**
- Track booking completions
- Monitor conversion funnel
- Display analytics in admin dashboard

### 3. Google Meet (Video Consultations)
**Free Tier:** 100 participants, 60 min sessions  
**API Service:** `server/googleMeetService.ts`  
**Key Methods:**
- `createMeeting(accessToken, booking)` - Create video link
- `updateMeeting(accessToken, meetingId, updates)` - Update meeting
- `deleteMeeting(accessToken, meetingId)` - Cancel meeting

**Sync Logic:**
- Auto-create Meet link for virtual appointments
- Include link in confirmation emails/SMS
- Sync with booking status

### 4. HubSpot CRM (Contact Management)
**Free Tier:** 1M contacts, basic automation  
**API Service:** `server/hubspotService.ts`  
**Key Methods:**
- `createContact(accessToken, customer)` - Add customer to CRM
- `updateContact(accessToken, contactId, updates)` - Update contact
- `trackInteraction(accessToken, contactId, booking)` - Log booking

**Sync Logic:**
- Auto-create HubSpot contact on first booking
- Track booking history as interactions
- Sync customer preferences

### 5. Mailchimp (Email Campaigns)
**Free Tier:** 500 contacts, 1,000 sends/month  
**API Service:** `server/mailchimpService.ts`  
**Key Methods:**
- `addSubscriber(accessToken, listId, customer)` - Add to list
- `updateSubscriber(accessToken, listId, email, tags)` - Tag customers
- `createCampaign(accessToken, template, audience)` - Send campaign

**Sync Logic:**
- Auto-subscribe customers (with consent)
- Tag by service preferences
- Track campaign engagement

### 6. Wave Accounting (Bookkeeping)
**Free Tier:** Unlimited invoices & receipts  
**API Service:** `server/waveAccountingService.ts`  
**Key Methods:**
- `createInvoice(accessToken, booking)` - Generate invoice
- `recordPayment(accessToken, invoiceId, payment)` - Track payment
- `syncExpenses(accessToken, expenses)` - Sync expenses

**Sync Logic:**
- Auto-create invoice on booking
- Record payment on completion
- Daily expense sync

### 7. Buffer Social (Social Media)
**Free Tier:** 3 social accounts, 10 posts/account  
**API Service:** `server/bufferSocialService.ts`  
**Key Methods:**
- `schedulePost(accessToken, profileId, content, time)` - Schedule post
- `getScheduledPosts(accessToken, profileId)` - View queue
- `deletePost(accessToken, postId)` - Remove scheduled post

**Sync Logic:**
- Schedule promotional posts
- Share customer testimonials (with permission)
- Auto-post special offers

## Implementation Checklist

For each new integration:

### Backend
- [ ] Add OAuth config to `oauthService.ts`
- [ ] Create API service file (e.g., `googleMyBusinessService.ts`)
- [ ] Implement static methods with accessToken as first parameter
- [ ] Add API routes (connect, callback, disconnect)
- [ ] Implement sync logic in relevant business logic files
- [ ] Add error handling and logging

### Frontend
- [ ] Add integration card to Settings page
- [ ] Implement OAuth flow UI
- [ ] Handle OAuth callback
- [ ] Show connection status
- [ ] Display integration-specific data in relevant pages

### Testing
- [ ] Test OAuth flow (connect/disconnect)
- [ ] Test token refresh
- [ ] Test bidirectional sync
- [ ] Test error scenarios
- [ ] Test with real API credentials

### Documentation
- [ ] Update replit.md with integration details
- [ ] Document API methods
- [ ] Document sync behavior
- [ ] Add troubleshooting guide

## Security Best Practices

1. **Token Storage:**
   - Always use AES-256-GCM encryption
   - Never log decrypted tokens
   - Rotate encryption keys regularly

2. **OAuth Flow:**
   - Always validate state parameter
   - Use HTTPS for callbacks
   - Implement PKCE for mobile apps

3. **API Requests:**
   - Implement rate limiting
   - Handle token expiry gracefully
   - Retry with exponential backoff

4. **Error Handling:**
   - Never expose token errors to users
   - Log all integration failures
   - Graceful degradation (don't break main features)

## Cost Optimization

All integrations use FREE tiers with these limits:

| Integration | Free Limit | Our Usage Pattern |
|-------------|-----------|-------------------|
| Google Calendar | Unlimited | 1 event per booking |
| Google My Business | Unlimited reviews | Poll every 6 hours |
| Google Analytics | 10M events/month | 1 event per booking |
| Google Meet | 60 min sessions | 1 link per virtual booking |
| HubSpot CRM | 1M contacts | 1 contact per customer |
| Mailchimp | 500 contacts | Opt-in customers only |
| Wave Accounting | Unlimited | 1 invoice per booking |
| Buffer Social | 10 posts/account | Manual scheduling |

**Key Strategy:**
- Use BYOA model (users provide their own keys)
- Monitor usage via sync logs
- Warn users before hitting limits
- Implement intelligent caching to reduce API calls

## Monitoring & Debugging

**Sync Logs Table:**
```sql
SELECT * FROM integration_sync_logs 
WHERE spa_id = ? 
  AND integration_name = ?
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

**Common Issues:**
1. Token expired → Auto-refresh or prompt user to reconnect
2. Rate limit hit → Implement backoff, show user warning
3. API error → Log error, notify admin, graceful fallback
4. Network timeout → Retry with exponential backoff

**Success Metrics:**
- Sync success rate > 99%
- Average sync latency < 2 seconds
- Error recovery time < 5 minutes
- User satisfaction with integrations

## Next Steps

1. Implement Google My Business integration (reviews)
2. Add Google Analytics tracking
3. Build Google Meet video link generation
4. Set up HubSpot CRM sync
5. Configure Mailchimp email campaigns
6. Integrate Wave Accounting invoices
7. Enable Buffer Social post scheduling

Each integration follows the exact same pattern established with Google Calendar, ensuring consistency, maintainability, and rapid development.
