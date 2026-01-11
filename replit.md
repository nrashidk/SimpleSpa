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
The backend utilizes a PostgreSQL database and an Express-based REST API. It features multi-method authentication with role-based access control (customer, staff, admin, super_admin) supporting Firebase/Google Sign-in, Email/Password, and Phone OTP. A five-tier staff permission system controls access.

The system includes comprehensive revenue and discount tracking with UAE VAT compliance, supporting various discount types and intelligent invoice classification. A VAT threshold reminder system tracks annual revenue and sends automated notifications.

Calendar validation ensures accurate time slot generation based on business hours, service durations, and staff availability. A multi-provider notification system supports Twilio and MSG91 for Email, SMS, and WhatsApp, with AES-256-GCM encryption for credentials.

Robust security hardening measures are implemented, including CSRF protection, session fixation prevention, email enumeration prevention, OAuth CSRF protection, file upload hardening, rate limiting, Helmet security headers (CSP, HSTS), multi-tenant data isolation with database-level enforcement, and IDOR protection. Strong password policies, secure password change and reset flows, and session security are also in place. Webhook signature verification is used for Twilio, MSG91, and Stripe. Input validation uses Zod schemas, with XSS protection via React and Helmet CSP.

Security hardening (Updated 2026-01-11):
- **Dev Endpoint Protection:** Fail-closed check ensures dev endpoints only accessible when NODE_ENV is explicitly set to 'development'
- **Information Disclosure Prevention:** Login endpoint returns single "Invalid credentials" message for all failure types (wrong password, non-admin, unapproved, locked) to prevent email enumeration
- **Account Lockout:** Users table has failedLoginAttempts and lockedUntil columns; accounts lock for 15 minutes after 5 failed attempts; counter resets on successful login
- **Audit Log Integrity:** HMAC-SHA256 signatures with hash chain linking each entry to previous for tamper detection
- **Stripe Webhook Security:** STRIPE_WEBHOOK_SECRET is now required - webhook signature verification cannot be bypassed
- **OTP Database Storage:** Phone OTP codes stored in PostgreSQL otp_codes table (not in-memory) for horizontal scaling and persistence across restarts
- **Session Cookie Security:** SameSite='lax' enforced to prevent CSRF from third-party sites
- **Performance Indexes:** Added indexes for bookings(date,status), customers(spa_id,email), staff(spa_id,active), invoices(spa_id,status,issue_date)
- **OAuth Nonce LRU Cache:** Bounded LRU cache (max 10k, 10min TTL) prevents memory leaks under high traffic
- **Common Password List:** Comprehensive list (150+ entries) for password strength validation

Architecture improvements (Started 2026-01-11):
- **Modular Routes Pattern:** Created server/routes/ directory structure for incremental route modularization
- **Example Migration:** server/routes/admin/services.routes.ts demonstrates the pattern for extracting routes from monolithic routes.ts

The system provides an audit trail for significant changes with cryptographic integrity verification. Uses Winston-based structured logging with PII redaction. Performance optimizations are applied to admin list endpoints and booking enrichment.

An admin-spa linkage system with an onboarding wizard (Basic Info, Location, Business Hours, Services, Staff, Activation) ensures new admins configure their spa. Membership management supports CRUD operations for packages.

Finance & Accounting reporting includes a comprehensive dashboard with 5 report types: Finance Summary, Sales Summary, Sales List, Appointments Summary, and Payment Summary, with date range filters and sortable columns.

An advanced client management system offers extended customer profiles, client blocking, a wallet/store credit system, and client merging capabilities. Bulk CSV import/export for customers is also supported.

A team management system features an advanced timesheet system with breaks, overtime calculation, GPS verification, and an approval workflow.

A conversational WhatsApp booking system provides an 8-step state machine for customer bookings using interactive messages. It integrates with Stripe for online payments and sends automated lifecycle notifications (confirmation, reminders, reviews, cancellations, reschedules). A non-blocking, idle-gated review collection system is also implemented. A node-cron scheduler handles reminders and review requests. Session management ensures fresh context for each booking.

## External Dependencies
-   **Firebase Authentication:** User authentication via Google Sign-in.
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
-   **node-cron:** Scheduled task management.