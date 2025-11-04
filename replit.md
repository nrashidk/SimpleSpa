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
    - **Advanced Timesheet System:** Enhanced time tracking with breaks, overtime calculation (>8 hours = overtime), GPS location verification for clock in/out, approval workflow (pending/approved/rejected/disputed states), manual entry support, and comprehensive audit trail. Includes staff-facing clock in/out endpoints and admin approval/rejection workflows.

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