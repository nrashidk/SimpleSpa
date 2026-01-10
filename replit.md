# Serene Spa - Booking System

## Overview
Serene Spa is an online booking system designed to streamline spa and salon operations. It offers a 4-step customer booking process, supports multiple venues, and provides a comprehensive admin panel for managing bookings, staff, services, and finances. The platform aims to boost customer satisfaction and operational efficiency, with a vision to integrate advanced growth and analytics tools to maximize revenue and engagement.

## User Preferences
- 4-step booking sequence (Services → Professional → Time → Details)
- Category-based service browsing
- Flexible professional assignment (any, per-service, specific)
- Time slots with pricing and discounts
- Customer details form with name + mobile OR email (or both)
- WhatsApp/SMS notifications when mobile is provided
- Email notifications when email is provided
- Spa/barber name displayed throughout interface

## System Architecture

### UI/UX
The frontend is built with React and TypeScript, leveraging Shadcn components and Tailwind CSS for a responsive design. It includes a Home Page, Customer and Admin Login, a Booking Search Landing Page, a 4-step Booking Flow, and a full Admin Panel with Dashboard, Calendar, POS, Finance & Accounting, and management sections for Clients, Services, Staff, and Settings. The UI adheres to a defined color palette and typography.

### Technical Implementation
The backend utilizes a PostgreSQL database and an Express-based REST API.
-   **Database:** PostgreSQL (Neon-backed) stores all core application data.
-   **API:** Provides endpoints for customer-facing features and a robust set of admin routes for resource and financial management.
-   **Authentication:** Multi-method authentication with role-based access control (customer, staff, admin, super_admin):
    - **Firebase/Google Sign-in:** OAuth-based authentication for customers and staff.
    - **Email/Password:** Secure registration and login with bcrypt hashing (8+ chars for customers, 12+ chars with complexity for admins).
    - **Phone OTP:** Mobile number authentication with 6-digit OTP via Twilio SMS. In-memory OTP storage with 10-minute expiry and attempt limits.
-   **Staff Permissions:** A five-tier system controls staff access levels.
-   **Revenue & Discount Tracking:** Comprehensive system for tracking all revenue streams, including service bookings, retail sales, and loyalty cards, with support for various discount types. All calculations are UAE VAT-compliant (5% VAT is part of the price).
-   **UAE VAT Compliance System:** Optional VAT activation with intelligent invoice classification (full, simplified, standard), TRN management, 5-year data retention, and support for various tax codes. Exports FTA Audit Files.
-   **VAT Threshold Reminder System:** Tracks annual revenue, displays progress towards VAT registration threshold, and sends automated notifications.
-   **Calendar Validation:** Ensures accurate time slot generation based on business hours, service durations, and staff availability.
-   **Multi-Provider Notification System:** Supports Twilio and MSG91 for Email, SMS, and WhatsApp notifications, with AES-256-GCM encryption for credentials and per-spa provider selection. Staff notifications are also configurable.
-   **Audit Trail:** Tracks all significant changes with user context, IP, and user agent.
-   **Security Hardening (Updated 2026-01-08):**
    - **CSRF Protection:** Session-bound synchronizer token pattern with X-CSRF-Token header validation. Tokens generated during login and included in all state-changing requests. Exempt routes: webhooks, Firebase auth, login/register endpoints.
    - **Session Fixation Prevention:** Session regeneration (req.session.regenerate) on both Firebase and email/password login flows.
    - **Email Enumeration Prevention:** Constant-time bcrypt comparison using dummy hash for non-existent users.
    - **OAuth CSRF Protection:** HMAC-SHA256 signed state parameter for OAuth flows using SESSION_SECRET with single-use nonce enforcement to prevent replay attacks.
    - **File Upload Hardening:** Symlink resolution (fs.realpathSync) before path validation, magic bytes validation for PDFs/images, authentication requirement for license uploads.
    - **Rate Limiting:** Login (5 per 15 min), booking (10 per min), API (100 per min), OTP request (3 per 15 min), OTP verify (10 per 15 min) to prevent brute force, DoS, and SMS flooding
    - **Helmet Security Headers (Updated 2026-01-10):** Production-only CSP with allowlists for Firebase Auth (googleapis.com, firebaseapp.com, gstatic.com), reCAPTCHA (google.com, recaptcha.net for global fallback), Stripe (js.stripe.com, api.stripe.com, hooks.stripe.com, m.stripe.network), and HSTS with 1-year max-age
    - **Multi-Tenant Data Isolation:** All tables (services, staff, products, customers, bookings) filter by spaId with database-level enforcement
    - **IDOR Protection:** All DELETE/UPDATE endpoints verify resource ownership before mutation
    - **Strong Password Policy:** 12+ characters with uppercase, lowercase, numbers, and special characters
    - **Password Change (Added 2026-01-08):** Secure password change endpoint at PUT /api/admin/change-password with current password verification, full password policy validation, and audit logging
    - **Password Reset (Added 2026-01-08):** Secure admin password reset flow with POST /api/admin/forgot-password and POST /api/admin/reset-password endpoints. Features SHA-256 token hashing, 1-hour token expiry, email enumeration prevention (constant response), and rate limiting. UI pages at /admin/forgot-password and /admin/reset-password.
    - **Session Security:** SameSite cookies (lax in dev, none in production for cross-origin), session regeneration on auth state changes
    - **Webhook Signature Verification (Added 2026-01-10):**
      - Twilio webhooks: Cryptographic signature verification using AccountSid lookup and twilio.validateRequest(). Supports reverse proxy URL reconstruction.
      - MSG91 webhooks: Custom header verification (X-MSG91-Webhook-Secret) since MSG91 doesn't support cryptographic signatures. Pair with IP whitelisting in MSG91 dashboard.
      - Stripe webhooks: Already verified with stripe-signature header
    - **Input Validation:** Zod schemas for all API endpoints including public booking validation
    - **XSS Protection:** React output encoding (automatic) + helmet CSP headers
    - **Environment Validation:** Required secrets (ENCRYPTION_KEY, DATABASE_URL) validated at startup
    - **Secure ID Validation:** All numeric ID params validated with parseNumericId helper
    - **Centralized Error Handling:** DomainError class and handleRouteError for consistent error responses with error tracking IDs (ERR-XXX format)
    - **TRN Validation:** UAE Tax Registration Number validated with 15-digit format regex
    - **Structured Logging (Added 2026-01-08):** Winston-based structured logging with PII redaction. Replaces console.log with proper log levels (info, warn, error, debug). Sensitive data (emails, passwords, tokens) automatically redacted.
    - **Enhanced Audit Logging (Added 2026-01-08):** Extended AuditLogger with security events:
      - AUTH_FAILED: Failed authentication attempts with IP tracking
      - UNAUTHORIZED: Failed authorization (403) with resource context
      - EXPORT: Data export operations with record counts
      - CONFIG_CHANGE: Configuration modifications with before/after diff
      - PRIVILEGE_USE: Admin privilege usage (approvals, rejections)
-   **Admin-Spa Linkage & Onboarding:** Robust middleware (`injectAdminSpa`) links admin users to their specific spa. A pending approval workflow and a 6-step setup wizard ensure new admins configure their spa before accessing full features. The wizard covers Basic Info, Location, Business Hours, Services, Staff, and Activation.
-   **Membership Management:** CRUD operations for memberships/packages, supporting one-time/recurring payments, limited/unlimited sessions, validity periods, and online sales toggles. Integrates with invoicing for revenue tracking.
-   **Finance & Accounting Reporting:** Comprehensive dashboard with 5 report types: Finance Summary, Sales Summary, Sales List, Appointments Summary, and Payment Summary. Includes date range filters, sortable columns, and planned export functionality (CSV, Excel, PDF).
-   **Advanced Client Management System:** 
    - **Extended Customer Profiles:** Gender, birthday, and full address (street, city, area, emirate) fields for personalized service and targeted marketing.
    - **Client Blocking System:** Ability to block/unblock clients with reason tracking, timestamps, and admin attribution for managing problematic customers.
    - **Wallet/Store Credit:** Full wallet transaction system with credit/debit operations, transaction history, balance tracking, and audit trail. Supports manual adjustments, refunds, and booking payments.
    - **Client Merge:** Safely merge duplicate customer profiles while preserving all booking history, loyalty data, wallet balances, and transaction records. Respects unique email/phone constraints.
    - **CSV Import/Export:** Bulk operations using standards-compliant CSV parsing (csv-parse/csv-stringify) that handles quoted fields, escaped delimiters, UTF-8, and embedded newlines. Import includes duplicate detection and error reporting.
-   **Team Management System:**
    - **Advanced Timesheet System:** Enhanced time tracking with breaks, overtime calculation (>8 hours = overtime), GPS location verification for clock in/out, approval workflow (pending/approved/rejected/disputed states), manual entry support, and comprehensive audit trail. Includes staff-facing clock in/out endpoints and admin approval/rejection workflows.
-   **WhatsApp Booking System:**
    - **Conversational Booking Flow:** 8-step state machine (welcome → location → category → service → professional → date → time → confirm → payment) enabling customers to book services entirely via WhatsApp.
    - **Interactive Messages:** Uses Twilio's WhatsApp API with interactive buttons and list selections for seamless navigation through booking options.
    - **Stripe Payment Integration:** Generates Stripe checkout links for online payment with graceful fallback to venue payment when Stripe is unavailable.
    - **Webhook Handlers:** Stripe webhook (registered before express.json for raw body access) updates booking status and triggers payment confirmations.
    - **Lifecycle Notifications:** Automated WhatsApp notifications for booking confirmation, reminders (24h before), completion/review requests, cancellations, reschedules, and payment confirmations.
    - **Review Collection System:** Non-blocking, idle-gated review system:
      - Scheduler checks all completed bookings without reviewRequestedAt (unlimited retry window)
      - sendIdleGatedReviewPrompt only triggers when conversation is idle (welcome/completed/review_completed states)
      - If conversation busy, sends thank-you message (once only, tracked by completionMessageSentAt) with opt-in instruction
      - Skip controls: "skip"/"book"/"later" keywords exit review to booking flow
      - Manual opt-in: "rate"/"review"/"feedback" keywords (only in idle states) start review for most recent unreviewed booking
      - Reviews stored in customer_reviews table with 1-5 star ratings and optional comments
    - **Appointment Scheduler:** node-cron based scheduler runs hourly:
      - Reminders: 24h before confirmed bookings
      - Reviews: All completed bookings without reviewRequestedAt (idle-gated, with retry on busy)
    - **Session Management:** Conversations expire after 24 hours, with fresh context creation for each booking session.
    - **Booking Priority Routing:** getOrCreateConversation prioritizes active booking states to ensure reviews never hijack in-progress bookings.

## External Dependencies
-   **Firebase Authentication:** User authentication via Google Sign-in (replaced Replit Auth on 2026-01-07).
-   **PostgreSQL (Neon-backed):** Primary database.
-   **Recharts:** Data visualization.
-   **react-big-calendar:** Interactive calendar.
-   **Wouter:** Frontend routing.
-   **TanStack Query:** Data fetching.
-   **Shadcn components & Tailwind CSS:** UI framework.
-   **date-fns:** Date utilities.
-   **React Hook Form & Zod:** Form validation.
-   **Twilio:** Optional notification provider (SMS, WhatsApp).
-   **MSG91:** Optional notification provider.
-   **Stripe:** Payment processing for online bookings.
-   **node-cron:** Scheduled task management for reminders and review requests.