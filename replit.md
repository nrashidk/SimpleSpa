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
-   **Authentication:** Replit Auth provides user authentication with role-based access control (customer, staff, admin, super_admin) and secure route protection.
-   **Staff Permissions:** A five-tier system controls staff access levels.
-   **Revenue & Discount Tracking:** Comprehensive system for tracking all revenue streams, including service bookings, retail sales, and loyalty cards, with support for various discount types. All calculations are UAE VAT-compliant (5% VAT is part of the price).
-   **UAE VAT Compliance System:** Optional VAT activation with intelligent invoice classification (full, simplified, standard), TRN management, 5-year data retention, and support for various tax codes. Exports FTA Audit Files.
-   **VAT Threshold Reminder System:** Tracks annual revenue, displays progress towards VAT registration threshold, and sends automated notifications.
-   **Calendar Validation:** Ensures accurate time slot generation based on business hours, service durations, and staff availability.
-   **Multi-Provider Notification System:** Supports Twilio and MSG91 for Email, SMS, and WhatsApp notifications, with AES-256-GCM encryption for credentials and per-spa provider selection. Staff notifications are also configurable.
-   **Audit Trail:** Tracks all significant changes with user context, IP, and user agent.
-   **Security Hardening:** Includes secure ID validation, consistent error handling (Zod), environment variable validation, and multi-tenant security measures to prevent cross-spa data access.
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
    - **Enhanced Staff Profiles:** Birthday field for staff members to enable birthday notifications and celebrations.
    - **Emergency Contacts:** Complete CRUD system for staff emergency contacts with relationship tracking (emergency, spouse, parent, sibling, friend, other), multiple phone numbers, email, and primary contact designation.
    - **Advanced Timesheet System:** Enhanced time tracking with breaks, overtime calculation (>8 hours = overtime), GPS location verification for clock in/out, approval workflow (pending/approved/rejected/disputed states), manual entry support, and comprehensive audit trail. Includes staff-facing clock in/out endpoints and admin approval/rejection workflows.
-   **Marketplace Enhancement Phase 1 (Core Booking): ✅ COMPLETE**
    - **Service Variants:** Size/duration options for services (e.g., 30min/60min/90min facials, Small/Medium/Large massages) with per-variant pricing and per-staff pricing overrides. **COMPLETE** - Variant selection UI, state management, variant-aware pricing calculations (including in bundles), booking payload integration, and backend persistence all functional.
    - **Service Add-ons:** Optional extras that can be added to any service booking (e.g., aromatherapy, hot stones, scalp massage). Supports single-select and multi-select option groups with individual pricing. **COMPLETE** - ServiceAddonSelector component with radio/checkbox modes, price and extra time calculations, service-specific addon correlation, booking payload integration, and backend persistence all functional.
    - **Service Bundles:** Pre-packaged combinations of multiple services at discounted bundle pricing (e.g., "Relaxation Package" = massage + facial + manicure). Tracks individual service selections and bundle-level discount. **COMPLETE** - ServiceBundleSelector component, variant-aware bundle pricing, auto-population of services, booking payload integration, and backend persistence all functional.
    - **Extra Time Configuration:** Define additional time before/after services for processing, blocked time, and servicing (e.g., 15min room prep, 10min cleanup). Improves calendar accuracy and prevents overbooking. **COMPLETE** - Admin UI in Settings page with table view and dialog forms for CRUD operations.
    - **Database Schema:** Extended `bookings` table with `bundleId` (FK to service_bundles), extended `booking_items` table with `variantId` (FK to service_variants) and `addonIds` (JSONB array). All schema changes pushed and verified.
    - **Booking Persistence:** POST /api/bookings endpoint enhanced to handle marketplace data - correctly persists bundleId in bookings, variantId and service-specific addonIds in booking_items. Architect-verified for data integrity and production readiness.
    - **Backend Complete:** 7 database tables, 38 storage methods, 35+ API endpoints with authentication/authorization/audit logging. **Customer-facing endpoints:** GET /api/spas/:id/service-variants, /service-addons, /service-bundles for public booking flow data.

## External Dependencies
-   **Replit Auth:** User authentication and authorization.
-   **PostgreSQL (Neon-backed):** Primary database.
-   **Recharts:** Data visualization.
-   **react-big-calendar:** Interactive calendar.
-   **Wouter:** Frontend routing.
-   **TanStack Query:** Data fetching.
-   **Shadcn components & Tailwind CSS:** UI framework.
-   **date-fns:** Date utilities.
-   **React Hook Form & Zod:** Form validation.
-   **Twilio:** Optional notification provider.
-   **MSG91:** Optional notification provider.
-   **Google Calendar:** Two-way appointment synchronization with timezone preservation and per-staff calendar support.