# SpaBooker Data Flow & Relationships

## 🔄 Complete Data Flow Architecture

### 1. **Customer Journey Flow**
```
CUSTOMER (customers table)
    ↓
    ├─→ BOOKING (bookings table) ──→ Creates appointment
    │     ↓
    │     ├─→ BOOKING ITEMS (booking_items) ──→ Services selected
    │     ├─→ INVOICE (invoices) ──→ Bill generated
    │     │     ↓
    │     │     ├─→ INVOICE ITEMS (invoice_items) ──→ Line items
    │     │     └─→ TRANSACTION (transactions) ──→ Payment recorded
    │     │
    │     └─→ NOTIFICATION (notification_events) ──→ Confirmation sent
    │
    ├─→ LOYALTY POINTS (customers.loyaltyPoints) ──→ Points earned/redeemed
    ├─→ TOTAL SPENT (customers.totalSpent) ──→ Running total
    └─→ USER ACCOUNT (users table) ──→ Login credentials
```

### 2. **Sales & Revenue Flow**
```
REVENUE SOURCES:
    │
    ├─→ SERVICE SALES (from bookings)
    │     ├─→ Booking → Invoice → Transaction
    │     ├─→ Updates: customer.totalSpent
    │     └─→ Appears in: Sales Reports, Dashboard
    │
    ├─→ PRODUCT SALES (retail items) ⚠️ MISSING CONNECTION
    │     ├─→ Products table exists
    │     └─→ NO sales tracking mechanism!
    │
    └─→ LOYALTY CARD SALES ⚠️ MISSING TABLE
          └─→ No loyalty card purchase tracking!
```

### 3. **Inventory & Products Flow**
```
PRODUCTS (products table)
    ↓
    ├─→ INVENTORY TRANSACTIONS (inventory_transactions)
    │     ├─→ Type: purchase, sale, adjustment, return
    │     └─→ Tracks quantity changes
    │
    └─→ ⚠️ MISSING: Product Sales Records
          └─→ No connection to customer purchases
          └─→ No link to invoices for retail sales
```

### 4. **Financial Flow**
```
ACCOUNTS RECEIVABLE (Money Coming In):
    ├─→ INVOICES (invoices) ──→ Customer bills
    │     ├─→ Links to: bookings, customers
    │     ├─→ Contains: invoice_items
    │     └─→ Paid via: transactions (payment)
    │
    └─→ TRANSACTIONS (transactions)
          ├─→ Type: payment, refund, expense
          └─→ Links to: invoices

ACCOUNTS PAYABLE (Money Going Out):
    ├─→ VENDORS (vendors) ──→ Suppliers
    ├─→ BILLS (bills) ──→ Purchase invoices
    │     └─→ Contains: bill_items
    │
    ├─→ EXPENSES (expenses)
    │     └─→ Links to: bills, vendors
    │
    └─→ STAFF PAYROLL
          └─→ Based on: staff_time_entries, commissions
```

### 5. **Staff & Operations Flow**
```
STAFF (staff table)
    ↓
    ├─→ STAFF SCHEDULES (staff_schedules) ──→ Availability
    ├─→ BOOKING ITEMS (booking_items.staffId) ──→ Assigned services
    ├─→ TIME TRACKING (staff_time_entries) ──→ Clock in/out
    └─→ COMMISSIONS ──→ From bookings (staff.commissionRate)
```

## ⚠️ CRITICAL MISSING COMPONENTS

### Missing Table 1: **Loyalty Cards**
```sql
-- NEEDED: loyalty_cards table
{
  id: serial PRIMARY KEY
  customerId: integer → customers.id
  cardType: text (e.g., "6-session haircut package")
  purchaseDate: timestamp
  totalSessions: integer (e.g., 6)
  usedSessions: integer (default: 0)
  remainingSessions: integer (computed)
  expiryDate: timestamp
  purchasePrice: decimal
  status: text ("active", "expired", "fully_used")
}

-- NEEDED: loyalty_card_usage table
{
  id: serial PRIMARY KEY
  loyaltyCardId: integer → loyalty_cards.id
  bookingId: integer → bookings.id
  usedAt: timestamp
  sessionValue: decimal
}
```

### Missing Table 2: **Product Sales / Retail Sales**
```sql
-- NEEDED: product_sales table
{
  id: serial PRIMARY KEY
  customerId: integer → customers.id
  productId: integer → products.id
  quantity: integer
  unitPrice: decimal
  totalPrice: decimal
  saleDate: timestamp
  invoiceId: integer → invoices.id (optional)
  transactionId: integer → transactions.id
}
```

### Missing Flow 3: **Unified Sales Record**
Currently, sales are split between:
- Service sales (in bookings)
- Product sales (not tracked!)
- Loyalty card sales (not tracked!)

Need a unified view in Sales Page.

## 📊 Current Data Connections (What Works)

### ✅ Working Connections:

1. **Customer → Booking → Invoice → Payment**
   - Customer books service
   - Booking creates invoice
   - Payment recorded in transactions
   - Updates customer.totalSpent

2. **Booking → Services → Staff**
   - Booking links to booking_items
   - Each item links to service & staff
   - Staff gets commission tracking

3. **Financial Reports**
   - Invoices track receivables
   - Bills track payables
   - Expenses track costs
   - Transactions track cash flow

4. **Inventory Management**
   - Products have stock levels
   - Inventory transactions track changes
   - Reorder levels set

### ❌ Broken/Missing Connections:

1. **No Product Sales Tracking**
   - Products table exists
   - No way to record customer purchases
   - No retail sales reporting

2. **No Loyalty Card System**
   - Customer has loyaltyPoints field
   - No loyalty card purchase tracking
   - No usage tracking when redeemed

3. **Incomplete Sales Page Data**
   - Can show booking-based sales
   - Cannot show product sales
   - Cannot show loyalty card sales

## 🎯 Required Actions to Complete System

### Priority 1: Add Loyalty Cards Tables
```
1. Create loyalty_cards table
2. Create loyalty_card_usage table
3. Link to bookings when redeemed
4. Update customer loyaltyPoints on purchase/use
```

### Priority 2: Add Product Sales Tracking
```
1. Create product_sales table
2. Link to invoice_items (type: "product")
3. Update inventory_transactions on sale
4. Connect to transactions for payments
```

### Priority 3: Unified Sales View
```
1. Aggregate service sales (from bookings/invoices)
2. Aggregate product sales (from product_sales)
3. Aggregate loyalty card sales (from loyalty_cards)
4. Display in Sales page with filters
```

### Priority 4: Complete Reporting
```
1. Sales Report: All revenue sources
2. Client Report: Purchase history (services + products + cards)
3. Inventory Report: Stock + sales velocity
4. Financial Report: Complete P&L with all revenue
```

## 🔗 Entity Relationship Summary

**Core Entities:**
- Customers (👤)
- Bookings (📅)
- Services (💆)
- Products (🛍️)
- Staff (👨‍💼)
- Invoices (📄)
- Transactions (💰)

**Missing Entities:**
- Loyalty Cards (🎫) ❌
- Product Sales (🛒) ❌

**Key Relationships:**
```
Customer 1──────N Bookings
Customer 1──────N Invoices
Customer 1──────N Loyalty Cards (MISSING)
Customer 1──────N Product Sales (MISSING)

Booking 1───────N Booking Items
Booking 1───────1 Invoice
Booking N───────1 Staff (optional)

Invoice 1───────N Invoice Items
Invoice 1───────N Transactions

Product 1───────N Inventory Transactions
Product 1───────N Product Sales (MISSING)

Loyalty Card 1──N Usage Records (MISSING)
```
