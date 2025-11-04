# Team Management System - Implementation Plan

## Executive Summary
This plan outlines the enhancement of the existing staff management system to include comprehensive team management features inspired by Fresha's Team Management module, including advanced timesheets, commission tracking, wage configuration, and automated pay runs.

---

## Current System Analysis

### ✅ Already Implemented
1. **Staff Table** (`staff`)
   - Basic profile: name, specialty, email, phone
   - Profile image, bio, skills
   - Calendar color, bookable status
   - 5-tier role system (basic → admin_access)
   - Active/featured flags

2. **Staff Schedules** (`staffSchedules`)
   - Day of week availability
   - Start/end times per day

3. **Staff Time Entries** (`staffTimeEntries`)
   - Basic clock in/out tracking
   - Date and time tracking

4. **Role-Based Permissions**
   - 5 levels: basic, view_own_calendar, view_all_calendars, manage_bookings, admin_access

---

## Required Enhancements

### 📋 Phase 1: Extended Staff Profiles & Admin Data

#### 1.1 Extended Staff Personal Information
**New Fields for `staff` table:**
```typescript
- birthday: date (optional, for birthday reminders/incentives)
- country: varchar (for payroll/tax purposes)
- jobTitle: varchar (official job title, separate from specialty)
- merchantAccount: varchar (optional, for payment processing)
- additionalPhone: varchar (backup contact)
- gender: varchar (male, female, other, prefer_not_to_say)
- address: jsonb ({ street, city, area, emirate, postalCode })
- employmentType: text (full_time, part_time, contractor, commission_only)
- hireDate: date
- terminationDate: date (nullable)
- archived: boolean (soft delete for staff retention)
```

#### 1.2 Emergency Contacts (New Table)
```typescript
staffEmergencyContacts {
  id: serial PK
  staffId: integer FK → staff.id
  name: varchar (required)
  relationship: varchar (spouse, parent, sibling, friend, etc.)
  phoneNumber: varchar (required)
  alternatePhone: varchar (optional)
  email: varchar (optional)
  isPrimary: boolean (default false)
  createdAt: timestamp
}
```

#### 1.3 Staff Documents & Certifications (New Table)
```typescript
staffDocuments {
  id: serial PK
  staffId: integer FK → staff.id
  documentType: varchar (license, certificate, id_card, visa, etc.)
  documentName: varchar
  fileUrl: varchar (S3/storage path)
  issueDate: date
  expiryDate: date (nullable)
  notes: text
  createdAt: timestamp
  updatedAt: timestamp
}
```

---

### ⏰ Phase 2: Enhanced Timesheet System

#### 2.1 Extend `staffTimeEntries` Table
**Add new fields:**
```typescript
- breakMinutes: integer (default 0) - Total break time
- overtimeMinutes: integer (default 0) - Auto-calculated overtime
- manualEntry: boolean (default false) - Flag for manual vs auto entries
- locationVerified: boolean (default false) - GPS/location check
- latitude: decimal (optional, for location tracking)
- longitude: decimal (optional)
- status: varchar (pending, approved, rejected, disputed)
- notes: text (for manual entries or disputes)
- approvedBy: varchar FK → users.id (nullable)
- approvedAt: timestamp (nullable)
```

#### 2.2 Timesheet Business Logic
- **Auto-calculate overtime:** Based on spa's overtime rules
- **Break tracking:** Subtract from total hours
- **Approval workflow:** Require manager approval for manual entries
- **Location verification:** Optional GPS check for clock in/out
- **Edit history:** Audit trail for timesheet changes

---

### 💰 Phase 3: Commission System

#### 3.1 Commission Configuration (New Table)
```typescript
commissions {
  id: serial PK
  staffId: integer FK → staff.id
  spaId: integer FK → spas.id
  
  // Commission type
  itemType: varchar (service, product, gift_card, membership)
  itemId: integer (nullable) - FK to specific service/product or NULL for all
  
  // Rate configuration
  rateType: varchar (fixed, percentage, tiered)
  rate: decimal (percentage if rateType=percentage, fixed amount if fixed)
  
  // Tiered commission (for tiered rateType)
  tierMin: decimal (nullable) - Minimum sale amount for this tier
  tierMax: decimal (nullable) - Maximum sale amount
  
  // Advanced settings
  applyOnCancellation: boolean (default false)
  applyOnNoShow: boolean (default false)
  deductProcessingFees: boolean (default true)
  customDeductionPercent: decimal (nullable) - Additional deduction %
  
  // Date range
  effectiveFrom: date
  effectiveTo: date (nullable)
  
  active: boolean (default true)
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Example tiered commission:**
- Tier 1: $0-$1000 = 10%
- Tier 2: $1001-$5000 = 15%
- Tier 3: $5001+ = 20%

#### 3.2 Commission Tracking (New Table)
```typescript
commissionEarnings {
  id: serial PK
  staffId: integer FK → staff.id
  spaId: integer FK → spas.id
  commissionId: integer FK → commissions.id
  
  // Source transaction
  sourceType: varchar (booking, product_sale, membership_sale, gift_card)
  sourceId: integer - FK to booking/transaction
  
  // Calculation
  saleAmount: decimal
  commissionAmount: decimal - Calculated commission
  deductions: decimal (default 0) - Fees deducted
  netCommission: decimal - Final amount
  
  // Payment status
  payRunId: integer FK → payRuns.id (nullable)
  paidAt: timestamp (nullable)
  
  date: date - Transaction date
  createdAt: timestamp
}
```

---

### 💵 Phase 4: Wage & Payroll System

#### 4.1 Wage Configuration (New Table)
```typescript
wageConfigurations {
  id: serial PK
  staffId: integer FK → staff.id (unique)
  spaId: integer FK → spas.id
  
  // Wage type
  wageType: varchar (hourly, salary, commission_only)
  
  // Hourly wage settings
  hourlyRate: decimal (nullable)
  overtimeEnabled: boolean (default false)
  overtimeThreshold: integer (hours per week before overtime)
  overtimeMultiplier: decimal (default 1.5) - 1.5x for overtime
  
  // Salary settings
  monthlySalary: decimal (nullable)
  annualSalary: decimal (nullable)
  
  // Payment schedule
  payFrequency: varchar (weekly, biweekly, monthly)
  payDay: integer - Day of week/month for payment
  
  // Deductions
  taxDeduction: decimal (default 0)
  socialSecurityDeduction: decimal (default 0)
  otherDeductions: jsonb ({ name, amount }[])
  
  // Bank details
  bankName: varchar
  accountNumber: varchar (encrypted)
  iban: varchar (encrypted)
  swiftCode: varchar
  
  effectiveFrom: date
  effectiveTo: date (nullable)
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### 4.2 Pay Runs (New Table)
```typescript
payRuns {
  id: serial PK
  spaId: integer FK → spas.id
  
  // Period
  periodStart: date
  periodEnd: date
  payDate: date - Scheduled payment date
  
  // Status
  status: varchar (draft, pending_approval, approved, processed, paid, cancelled)
  
  // Totals
  totalWages: decimal - Sum of all wages
  totalCommissions: decimal - Sum of all commissions
  totalTips: decimal - Sum of all tips
  totalDeductions: decimal - Sum of all deductions
  totalAdjustments: decimal - Manual adjustments
  totalPayout: decimal - Final amount
  
  // Metadata
  generatedBy: varchar FK → users.id
  approvedBy: varchar FK → users.id (nullable)
  approvedAt: timestamp (nullable)
  processedAt: timestamp (nullable)
  
  notes: text
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### 4.3 Pay Run Items (New Table)
```typescript
payRunItems {
  id: serial PK
  payRunId: integer FK → payRuns.id
  staffId: integer FK → staff.id
  spaId: integer FK → spas.id
  
  // Earnings breakdown
  wageHours: decimal (default 0) - Regular hours worked
  wageAmount: decimal (default 0) - Regular wage
  overtimeHours: decimal (default 0)
  overtimeAmount: decimal (default 0)
  commissionAmount: decimal (default 0)
  tipAmount: decimal (default 0) - Tips earned
  bonusAmount: decimal (default 0) - One-time bonuses
  
  // Deductions
  taxDeduction: decimal (default 0)
  socialSecurityDeduction: decimal (default 0)
  otherDeductions: decimal (default 0)
  
  // Manual adjustments
  adjustmentAmount: decimal (default 0)
  adjustmentReason: text
  
  // Totals
  grossPay: decimal - Total before deductions
  netPay: decimal - Total after deductions
  
  // Payment method
  paymentMethod: varchar (wallet, bank_transfer, cash, check)
  paymentReference: varchar (transaction ID)
  paidAt: timestamp (nullable)
  
  notes: text
  createdAt: timestamp
}
```

---

### 🔐 Phase 5: Enhanced Permissions System

#### 5.1 Granular Workspace Permissions (New Table)
```typescript
workspacePermissions {
  id: serial PK
  name: varchar (Basic, Low, Medium, High, Owner)
  level: integer (1-5) - For quick comparison
  spaId: integer FK → spas.id (nullable) - NULL for default templates
  
  // Client management
  canViewClientInfo: boolean
  canEditClientInfo: boolean
  canDeleteClients: boolean
  canExportClientData: boolean
  
  // Booking management
  canBookAppointments: boolean
  canEditAppointments: boolean
  canCancelAppointments: boolean
  canViewAllBookings: boolean
  
  // Calendar access
  canViewOwnCalendar: boolean
  canViewAllCalendars: boolean
  canManageCalendar: boolean
  
  // Financial access
  canViewReports: boolean
  canViewFinancials: boolean
  canProcessPayments: boolean
  canIssueRefunds: boolean
  canManageInventory: boolean
  
  // Team management
  canViewTeam: boolean
  canManageTeam: boolean
  canViewTimesheets: boolean
  canApproveTimesheets: boolean
  canViewPayroll: boolean
  canManagePayroll: boolean
  
  // Business settings
  canAccessBusinessDetails: boolean
  canModifyBusinessSettings: boolean
  canManageServices: boolean
  canManageProducts: boolean
  
  // Marketing & notifications
  canSendNotifications: boolean
  canAccessMarketing: boolean
  
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### 5.2 Update `staff` table
```typescript
// Add new field:
- permissionId: integer FK → workspacePermissions.id (nullable)
// Keep existing staffRole as backup/migration path
```

---

## API Endpoints Plan

### Team Member Management
```
GET    /api/admin/staff                    # List all staff (with filters)
GET    /api/admin/staff/:id                # Get staff details
POST   /api/admin/staff                    # Create staff member
PATCH  /api/admin/staff/:id                # Update staff details
DELETE /api/admin/staff/:id                # Archive staff member
PATCH  /api/admin/staff/:id/unarchive      # Restore archived staff
DELETE /api/admin/staff/:id/permanent      # Permanently delete

GET    /api/admin/staff/:id/emergency-contacts      # List emergency contacts
POST   /api/admin/staff/:id/emergency-contacts      # Add emergency contact
PATCH  /api/admin/staff/:id/emergency-contacts/:contactId
DELETE /api/admin/staff/:id/emergency-contacts/:contactId

GET    /api/admin/staff/:id/documents      # List documents
POST   /api/admin/staff/:id/documents      # Upload document
DELETE /api/admin/staff/:id/documents/:docId
```

### Timesheet Management
```
GET    /api/admin/timesheets               # List timesheets (filter by staff, date, status)
GET    /api/admin/timesheets/:id           # Get timesheet details
POST   /api/admin/timesheets               # Manual timesheet entry
PATCH  /api/admin/timesheets/:id           # Update timesheet
POST   /api/admin/timesheets/:id/approve   # Approve timesheet
POST   /api/admin/timesheets/:id/reject    # Reject timesheet

POST   /api/staff/clock-in                 # Staff clocks in
POST   /api/staff/clock-out                # Staff clocks out
POST   /api/staff/break-start              # Start break
POST   /api/staff/break-end                # End break
GET    /api/staff/timesheets               # Staff views own timesheets
```

### Commission Management
```
GET    /api/admin/staff/:id/commissions    # Get commission config for staff
POST   /api/admin/staff/:id/commissions    # Add commission rule
PATCH  /api/admin/commissions/:id          # Update commission rule
DELETE /api/admin/commissions/:id          # Delete commission rule

GET    /api/admin/staff/:id/commission-earnings  # View commission earnings
GET    /api/admin/commission-earnings      # All earnings (filter by staff, date)
```

### Wage & Payroll
```
GET    /api/admin/staff/:id/wage           # Get wage configuration
PATCH  /api/admin/staff/:id/wage           # Update wage configuration

GET    /api/admin/pay-runs                 # List pay runs
POST   /api/admin/pay-runs                 # Generate new pay run
GET    /api/admin/pay-runs/:id             # Get pay run details
GET    /api/admin/pay-runs/:id/breakdown   # Detailed breakdown
PATCH  /api/admin/pay-runs/:id             # Update pay run
POST   /api/admin/pay-runs/:id/approve     # Approve pay run
POST   /api/admin/pay-runs/:id/process     # Process payment
DELETE /api/admin/pay-runs/:id             # Cancel pay run

GET    /api/staff/payslips                 # Staff views own payslips
GET    /api/staff/payslips/:id             # Get specific payslip
```

### Permissions
```
GET    /api/admin/permissions              # List all permission templates
POST   /api/admin/permissions              # Create custom permission
PATCH  /api/admin/permissions/:id          # Update permission
DELETE /api/admin/permissions/:id          # Delete custom permission

PATCH  /api/admin/staff/:id/permission     # Assign permission to staff
```

---

## Frontend Components Plan

### Pages/Routes
```
/admin/team                         # Team list page
/admin/team/add                     # Add new team member
/admin/team/:id                     # Team member profile
/admin/team/:id/edit                # Edit team member
/admin/team/:id/timesheets          # Staff timesheets
/admin/team/:id/commissions         # Commission config
/admin/team/:id/wage                # Wage config
/admin/team/:id/documents           # Documents & certifications

/admin/timesheets                   # All timesheets management
/admin/payroll                      # Payroll dashboard
/admin/payroll/pay-runs             # Pay run list
/admin/payroll/pay-runs/:id         # Pay run details
/admin/payroll/pay-runs/new         # Generate new pay run

/staff/dashboard                    # Staff self-service dashboard
/staff/timesheets                   # View own timesheets
/staff/payslips                     # View own payslips
/staff/profile                      # Edit own profile
```

### Key Components
```
components/team/
├── TeamList.tsx                    # Filterable staff list with cards
├── TeamMemberCard.tsx              # Staff card with avatar, role, status
├── TeamMemberProfile.tsx           # Full profile view
├── TeamEditForm.tsx                # Create/edit staff form
├── EmergencyContactsPanel.tsx      # Manage emergency contacts
├── DocumentsPanel.tsx              # Upload/manage documents
├── TimesheetPanel.tsx              # View/edit timesheets
├── CommissionPanel.tsx             # Configure commissions
├── WageConfigPanel.tsx             # Configure wage settings
├── PermissionsPanel.tsx            # Assign permissions

components/timesheets/
├── TimesheetList.tsx               # List view with filters
├── TimesheetCalendar.tsx           # Calendar view of timesheets
├── TimesheetEntry.tsx              # Single timesheet row
├── TimesheetEditModal.tsx          # Edit timesheet dialog
├── ClockInOutWidget.tsx            # Quick clock in/out for staff

components/payroll/
├── PayrollDashboard.tsx            # Overview with KPIs
├── PayRunList.tsx                  # List all pay runs
├── PayRunWizard.tsx                # Step-by-step pay run creation
├── PayRunBreakdown.tsx             # Detailed breakdown table
├── PayslipView.tsx                 # Individual payslip view
├── PayslipPDF.tsx                  # Printable payslip
```

---

## Implementation Phasing

### Phase 1: Foundation (Week 1-2)
- [ ] Extend staff table with new personal fields
- [ ] Create emergency contacts table
- [ ] Create documents table
- [ ] Update staff CRUD APIs
- [ ] Build enhanced staff profile UI

### Phase 2: Timesheets (Week 3-4)
- [ ] Extend staffTimeEntries table
- [ ] Build timesheet approval workflow
- [ ] Create timesheet management UI
- [ ] Build clock in/out widget
- [ ] Add location verification (optional)

### Phase 3: Commissions (Week 5-6)
- [ ] Create commissions table
- [ ] Create commission earnings table
- [ ] Build commission calculation engine
- [ ] Create commission config UI
- [ ] Build commission reports

### Phase 4: Wages & Payroll (Week 7-9)
- [ ] Create wage configurations table
- [ ] Create pay runs and pay run items tables
- [ ] Build pay run generation logic
- [ ] Create payroll dashboard UI
- [ ] Build pay run wizard
- [ ] Create payslip view/PDF

### Phase 5: Permissions (Week 10)
- [ ] Create workspace permissions table
- [ ] Migrate existing staff roles
- [ ] Build permission management UI
- [ ] Implement permission checks across app
- [ ] Testing and refinement

### Phase 6: Polish & Reports (Week 11-12)
- [ ] Add advanced filtering/search
- [ ] Build analytics dashboard
- [ ] Export features (CSV, PDF)
- [ ] Mobile responsiveness
- [ ] Performance optimization
- [ ] Documentation

---

## Database Migration Strategy

1. **Use `npm run db:push --force`** to sync schema changes
2. **Keep existing staff.id as serial** (do NOT change to varchar)
3. **Add new tables incrementally** to avoid conflicts
4. **Provide data migration scripts** for existing staff role → permission mapping
5. **Test on staging data** before production

---

## Security Considerations

1. **Sensitive Data Encryption**
   - Bank account numbers (AES-256)
   - IBAN/SWIFT codes
   - Tax IDs

2. **Role-Based Access**
   - Only admin_access can view payroll
   - Only owner can approve pay runs
   - Staff can only view own data

3. **Audit Logging**
   - Log all timesheet approvals
   - Log all pay run actions
   - Log permission changes
   - Log wage configuration changes

4. **Data Retention**
   - Keep archived staff for 7 years (UAE labor law)
   - Maintain payroll records for audit
   - Store timesheet history

---

## Key Business Rules

### Timesheet Rules
- Auto-calculate overtime after configured threshold (default: 40 hrs/week)
- Require manager approval for manual entries
- Allow disputes and re-approval
- Track location for fraud prevention

### Commission Rules
- Calculate on completed transactions only (unless configured otherwise)
- Handle refunds by creating negative commission entries
- Support retroactive commission changes for specific periods
- Apply tiered rates based on cumulative sales

### Payroll Rules
- Lock timesheets before pay run generation
- Require dual approval for pay runs over threshold
- Support split payments (partial wallet, partial bank)
- Generate PDF payslips automatically
- Send email notifications on pay day

---

## Technical Stack (No Changes)

- **Backend:** Node.js + TypeScript + Express
- **ORM:** Drizzle
- **Database:** PostgreSQL (Neon)
- **Frontend:** React + TypeScript + Vite
- **UI:** Shadcn + Tailwind CSS
- **State:** TanStack Query
- **Forms:** React Hook Form + Zod
- **Auth:** Replit Auth (existing)

---

## Estimated Scope

- **New Database Tables:** 9 tables
- **Extended Tables:** 2 tables
- **New API Endpoints:** ~45 endpoints
- **New Frontend Pages:** ~12 pages
- **New Components:** ~25 components
- **Lines of Code:** ~15,000-20,000 LOC

---

## Next Steps

1. **Review this plan** and provide feedback
2. **Approve/modify phases** based on priority
3. **Begin Phase 1** implementation upon approval
4. **Iterative development** with testing after each phase

---

## Questions for Decision

1. **Priority:** Which phase is most critical? (Suggest: Phase 2 Timesheets first)
2. **Scope:** Implement all phases or start with subset?
3. **Timeline:** Aggressive (2-3 months) or conservative (4-6 months)?
4. **Location Tracking:** Require GPS verification for clock in/out?
5. **Payment Integration:** Integrate with external payroll service or keep internal?
6. **Multi-Currency:** Support multiple currencies for international staff?
7. **Mobile App:** Need dedicated mobile app for staff clock in/out?

---

**Ready to proceed? Please review and let me know which phases to implement first!**
