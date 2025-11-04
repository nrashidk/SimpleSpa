/**
 * FTA Audit File (FAF) Export Generator
 * Generates UAE Federal Tax Authority compliant audit files
 * for VAT reporting and compliance
 */

import { db } from "./db";
import { productSales, loyaltyCards, bookings, invoices, transactions, staff, services } from "@shared/schema";
import { desc, gte, lte, and, eq } from "drizzle-orm";

export interface FAFExportFilters {
  startDate?: Date;
  endDate?: Date;
  spaId?: number;
}

export interface FAFRecord {
  transactionId: string;
  transactionDate: string;
  transactionType: string;
  customerId: number;
  grossAmount: string;
  netAmount: string;
  vatAmount: string;
  taxCode: string;
  currency: string;
  description: string;
}

/**
 * Generate FTA Audit File for tax compliance
 * Includes all revenue streams: bookings, product sales, loyalty cards
 */
export async function generateFAFExport(filters?: FAFExportFilters): Promise<FAFRecord[]> {
  const records: FAFRecord[] = [];
  
  // 1. Export Bookings (Service Revenue)
  let bookingsQuery = db.select({
    id: bookings.id,
    date: bookings.bookingDate,
    customerId: bookings.customerId,
    totalAmount: bookings.totalAmount,
    discountAmount: bookings.discountAmount,
  }).from(bookings);
  
  const bookingConditions = [];
  if (filters?.startDate) {
    bookingConditions.push(gte(bookings.bookingDate, filters.startDate));
  }
  if (filters?.endDate) {
    bookingConditions.push(lte(bookings.bookingDate, filters.endDate));
  }
  if (filters?.spaId) {
    bookingConditions.push(eq(bookings.spaId, filters.spaId));
  }
  if (bookingConditions.length > 0) {
    bookingsQuery = bookingsQuery.where(and(...bookingConditions)) as any;
  }
  
  const bookingsData = await bookingsQuery.orderBy(desc(bookings.bookingDate));
  
  // For bookings, calculate VAT (5% inclusive)
  bookingsData.forEach(booking => {
    const grossAmount = parseFloat(booking.totalAmount || '0');
    const netAmount = grossAmount / 1.05;
    const vatAmount = grossAmount - netAmount;
    
    records.push({
      transactionId: `BK-${booking.id}`,
      transactionDate: booking.date.toISOString().split('T')[0],
      transactionType: 'Booking (Service)',
      customerId: booking.customerId,
      grossAmount: grossAmount.toFixed(2),
      netAmount: netAmount.toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      taxCode: 'SR',
      currency: 'AED',
      description: 'Service booking',
    });
  });
  
  // 2. Export Product Sales (filter by staff spa if spaId provided)
  let productSalesQuery = db.select({
    id: productSales.id,
    date: productSales.saleDate,
    customerId: productSales.customerId,
    totalPrice: productSales.totalPrice,
    netAmount: productSales.netAmount,
    vatAmount: productSales.vatAmount,
    taxCode: productSales.taxCode,
  }).from(productSales);
  
  if (filters?.spaId) {
    productSalesQuery = productSalesQuery.innerJoin(staff, eq(productSales.soldBy, staff.id)) as any;
    const productConditions = [eq(staff.spaId, filters.spaId)];
    if (filters.startDate) productConditions.push(gte(productSales.saleDate, filters.startDate));
    if (filters.endDate) productConditions.push(lte(productSales.saleDate, filters.endDate));
    productSalesQuery = productSalesQuery.where(and(...productConditions)) as any;
  } else {
    const productConditions = [];
    if (filters?.startDate) productConditions.push(gte(productSales.saleDate, filters.startDate));
    if (filters?.endDate) productConditions.push(lte(productSales.saleDate, filters.endDate));
    if (productConditions.length > 0) {
      productSalesQuery = productSalesQuery.where(and(...productConditions)) as any;
    }
  }
  
  const productSalesData = await productSalesQuery.orderBy(desc(productSales.saleDate));
  
  productSalesData.forEach(sale => {
    records.push({
      transactionId: `PS-${sale.id}`,
      transactionDate: sale.date.toISOString().split('T')[0],
      transactionType: 'Product Sale',
      customerId: sale.customerId,
      grossAmount: sale.totalPrice || '0.00',
      netAmount: sale.netAmount || '0.00',
      vatAmount: sale.vatAmount || '0.00',
      taxCode: sale.taxCode || 'SR',
      currency: 'AED',
      description: 'Retail product sale',
    });
  });
  
  // 3. Export Loyalty Card Purchases (filter by service spa if spaId provided)
  let loyaltyCardsQuery = db.select({
    id: loyaltyCards.id,
    date: loyaltyCards.purchaseDate,
    customerId: loyaltyCards.customerId,
    purchasePrice: loyaltyCards.purchasePrice,
    netAmount: loyaltyCards.netAmount,
    vatAmount: loyaltyCards.vatAmount,
    taxCode: loyaltyCards.taxCode,
    cardType: loyaltyCards.cardType,
  }).from(loyaltyCards);
  
  if (filters?.spaId) {
    loyaltyCardsQuery = loyaltyCardsQuery.innerJoin(services, eq(loyaltyCards.serviceId, services.id)) as any;
    const loyaltyConditions = [eq(services.spaId, filters.spaId)];
    if (filters.startDate) loyaltyConditions.push(gte(loyaltyCards.purchaseDate, filters.startDate));
    if (filters.endDate) loyaltyConditions.push(lte(loyaltyCards.purchaseDate, filters.endDate));
    loyaltyCardsQuery = loyaltyCardsQuery.where(and(...loyaltyConditions)) as any;
  } else {
    const loyaltyConditions = [];
    if (filters?.startDate) loyaltyConditions.push(gte(loyaltyCards.purchaseDate, filters.startDate));
    if (filters?.endDate) loyaltyConditions.push(lte(loyaltyCards.purchaseDate, filters.endDate));
    if (loyaltyConditions.length > 0) {
      loyaltyCardsQuery = loyaltyCardsQuery.where(and(...loyaltyConditions)) as any;
    }
  }
  
  const loyaltyCardsData = await loyaltyCardsQuery.orderBy(desc(loyaltyCards.purchaseDate));
  
  loyaltyCardsData.forEach(card => {
    records.push({
      transactionId: `LC-${card.id}`,
      transactionDate: card.date.toISOString().split('T')[0],
      transactionType: 'Loyalty Card Purchase',
      customerId: card.customerId,
      grossAmount: card.purchasePrice || '0.00',
      netAmount: card.netAmount || '0.00',
      vatAmount: card.vatAmount || '0.00',
      taxCode: card.taxCode || 'SR',
      currency: 'AED',
      description: card.cardType || 'Loyalty package',
    });
  });
  
  // 4. Export Invoices (with optional spa filtering)
  let invoicesQuery = db.select({
    id: invoices.id,
    date: invoices.issueDate,
    customerId: invoices.customerId,
    totalAmount: invoices.totalAmount,
    bookingId: invoices.bookingId,
  }).from(invoices);
  
  if (filters?.spaId) {
    invoicesQuery = invoicesQuery.innerJoin(bookings, eq(invoices.bookingId, bookings.id)) as any;
    const invoiceConditions = [eq(bookings.spaId, filters.spaId)];
    if (filters.startDate) invoiceConditions.push(gte(invoices.issueDate, filters.startDate));
    if (filters.endDate) invoiceConditions.push(lte(invoices.issueDate, filters.endDate));
    invoicesQuery = invoicesQuery.where(and(...invoiceConditions)) as any;
  } else {
    const invoiceConditions = [];
    if (filters?.startDate) invoiceConditions.push(gte(invoices.issueDate, filters.startDate));
    if (filters?.endDate) invoiceConditions.push(lte(invoices.issueDate, filters.endDate));
    if (invoiceConditions.length > 0) {
      invoicesQuery = invoicesQuery.where(and(...invoiceConditions)) as any;
    }
  }
  
  const invoicesData = await invoicesQuery.orderBy(desc(invoices.issueDate));
    
    invoicesData.forEach(invoice => {
      const grossAmount = parseFloat(invoice.totalAmount || '0');
      const netAmount = grossAmount / 1.05;
      const vatAmount = grossAmount - netAmount;
      
      records.push({
        transactionId: `INV-${invoice.id}`,
        transactionDate: invoice.date.toISOString().split('T')[0],
        transactionType: 'Invoice',
        customerId: invoice.customerId || 0,
        grossAmount: grossAmount.toFixed(2),
        netAmount: netAmount.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        taxCode: 'SR',
        currency: 'AED',
        description: 'Invoice',
      });
    });
  
  // 5. Export Payment Transactions (with optional spa filtering)
  let transactionsQuery = db.select({
    id: transactions.id,
    date: transactions.transactionDate,
    type: transactions.transactionType,
    amount: transactions.amount,
    invoiceId: transactions.invoiceId,
  }).from(transactions);
  
  if (filters?.spaId) {
    transactionsQuery = transactionsQuery
      .innerJoin(invoices, eq(transactions.invoiceId, invoices.id))
      .innerJoin(bookings, eq(invoices.bookingId, bookings.id)) as any;
    const txnConditions = [eq(bookings.spaId, filters.spaId)];
    if (filters.startDate) txnConditions.push(gte(transactions.transactionDate, filters.startDate));
    if (filters.endDate) txnConditions.push(lte(transactions.transactionDate, filters.endDate));
    transactionsQuery = transactionsQuery.where(and(...txnConditions)) as any;
  } else {
    const txnConditions = [];
    if (filters?.startDate) txnConditions.push(gte(transactions.transactionDate, filters.startDate));
    if (filters?.endDate) txnConditions.push(lte(transactions.transactionDate, filters.endDate));
    if (txnConditions.length > 0) {
      transactionsQuery = transactionsQuery.where(and(...txnConditions)) as any;
    }
  }
  
  const transactionsData = await transactionsQuery.orderBy(desc(transactions.transactionDate));
    
    transactionsData.forEach(txn => {
      const grossAmount = parseFloat(txn.amount || '0');
      const netAmount = grossAmount / 1.05;
      const vatAmount = grossAmount - netAmount;
      
      records.push({
        transactionId: `TXN-${txn.id}`,
        transactionDate: txn.date.toISOString().split('T')[0],
        transactionType: txn.type || 'Payment',
        customerId: 0, // Transactions may not have direct customer link
        grossAmount: grossAmount.toFixed(2),
        netAmount: netAmount.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        taxCode: 'SR',
        currency: 'AED',
        description: `${txn.type || 'Transaction'} ${txn.invoiceId ? `(Invoice #${txn.invoiceId})` : ''}`,
      });
    });
  
  // Sort all records by date descending
  records.sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
  
  return records;
}

/**
 * Convert FAF records to CSV format
 */
export function convertFAFToCSV(records: FAFRecord[]): string {
  const headers = [
    'Transaction ID',
    'Date',
    'Type',
    'Customer ID',
    'Gross Amount (AED)',
    'Net Amount (AED)',
    'VAT Amount (AED)',
    'Tax Code',
    'Currency',
    'Description'
  ];
  
  const rows = records.map(r => [
    r.transactionId,
    r.transactionDate,
    r.transactionType,
    r.customerId.toString(),
    r.grossAmount,
    r.netAmount,
    r.vatAmount,
    r.taxCode,
    r.currency,
    `"${r.description.replace(/"/g, '""')}"` // Escape quotes in description
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');
  
  return csvContent;
}
