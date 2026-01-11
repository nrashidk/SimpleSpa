/**
 * UAE FTA-Compliant Invoice Generation Utilities
 * Handles VAT activation, TRN population, invoice types, and 5-year retention
 */

import { Spa, Customer, InsertInvoice } from "../shared/schema";

export interface InvoiceGenerationParams {
  spa: Spa;
  customer: Customer;
  subtotal: number; // Net amount (before VAT or VAT-exclusive)
  taxAmount: number; // VAT amount (0 if VAT disabled)
  totalAmount: number; // Total including VAT
  invoiceNumber: string;
  customerId: number;
  bookingId?: number;
  paymentMethod?: string;
  notes?: string;
}

/**
 * Prepares FTA-compliant invoice data based on spa's VAT status
 * 
 * @param params - Invoice generation parameters
 * @returns InsertInvoice with FTA compliance fields populated
 * 
 * @example
 * // VAT-enabled spa
 * const spa = { vatEnabled: true, taxRegistrationNumber: '123456789012345', ... };
 * const invoice = prepareFTACompliantInvoice({ spa, customer, subtotal, ... });
 * // Result: { invoiceType: 'simplified', supplierTrn: '123456789012345', retentionDate: +5 years }
 * 
 * @example
 * // VAT-disabled spa
 * const spa = { vatEnabled: false, ... };
 * const invoice = prepareFTACompliantInvoice({ spa, customer, subtotal, ... });
 * // Result: { invoiceType: 'standard', supplierTrn: null, customerTrn: null }
 */
export function prepareFTACompliantInvoice(params: InvoiceGenerationParams): InsertInvoice {
  const {
    spa,
    customer,
    subtotal,
    taxAmount,
    totalAmount,
    invoiceNumber,
    customerId,
    bookingId,
    paymentMethod,
    notes,
  } = params;

  const issueDate = new Date();
  
  // Base invoice data
  const invoiceData: InsertInvoice = {
    spaId: spa.id,
    invoiceNumber,
    customerId,
    bookingId: bookingId || null,
    issueDate,
    subtotal: subtotal.toString(),
    taxAmount: taxAmount.toString(),
    totalAmount: totalAmount.toString(),
    paidAmount: "0.00",
    status: "pending",
    paymentMethod: paymentMethod || null,
    notes: notes || null,
  };

  // FTA Compliance: Check if spa has VAT enabled
  if (spa.vatEnabled && spa.taxRegistrationNumber) {
    // VAT IS ENABLED - Apply FTA tax invoice requirements
    
    // 1. Determine invoice type based on total amount threshold (AED 10,000)
    const invoiceType = totalAmount >= 10000 ? 'full' : 'simplified';
    
    // 2. Populate supplier TRN (spa's tax registration number)
    const supplierTrn = spa.taxRegistrationNumber;
    
    // 3. Populate customer TRN if customer is VAT-registered (B2B)
    const customerTrn = customer.taxRegistrationNumber || null;
    
    // 4. Calculate retention date (5 years from issue date per FTA requirement)
    const retentionDate = new Date(issueDate);
    retentionDate.setFullYear(retentionDate.getFullYear() + 5);
    
    return {
      ...invoiceData,
      invoiceType,
      supplierTrn,
      customerTrn,
      retentionDate,
    };
  } else {
    // VAT IS DISABLED - Standard invoice (no tax compliance needed)
    
    return {
      ...invoiceData,
      invoiceType: 'standard',
      supplierTrn: null,
      customerTrn: null,
      retentionDate: null,
    };
  }
}

/**
 * Validates if an invoice can be deleted based on retention requirements
 * FTA requires 5 years of record retention
 * 
 * @param invoice - Invoice to check
 * @returns { canDelete: boolean; reason?: string }
 */
export function canDeleteInvoice(invoice: { retentionDate: Date | null; issueDate: Date }): {
  canDelete: boolean;
  reason?: string;
} {
  // No retention date = standard invoice (VAT disabled), can delete
  if (!invoice.retentionDate) {
    return { canDelete: true };
  }

  const now = new Date();
  
  // Check if retention period has passed
  if (now < invoice.retentionDate) {
    const yearsRemaining = Math.ceil(
      (invoice.retentionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365)
    );
    
    return {
      canDelete: false,
      reason: `UAE FTA requires this invoice to be retained for ${yearsRemaining} more year(s). Retention expires on ${invoice.retentionDate.toLocaleDateString()}.`,
    };
  }

  return { canDelete: true };
}

/**
 * Generates the invoice title/designation based on type
 * 
 * @param invoiceType - Type of invoice
 * @returns Human-readable invoice designation
 */
export function getInvoiceDesignation(invoiceType: string | null): string {
  switch (invoiceType) {
    case 'full':
      return 'TAX INVOICE';
    case 'simplified':
      return 'SIMPLIFIED TAX INVOICE';
    case 'standard':
    default:
      return 'INVOICE';
  }
}

/**
 * Validates UAE Tax Registration Number (TRN) format
 * UAE TRN is 15 digits
 * 
 * @param trn - Tax registration number to validate
 * @returns { valid: boolean; error?: string }
 */
export function validateTRN(trn: string | null | undefined): {
  valid: boolean;
  error?: string;
} {
  if (!trn) {
    return { valid: false, error: 'TRN is required' };
  }

  // Remove any spaces or dashes
  const cleanTrn = trn.replace(/[\s-]/g, '');

  // UAE TRN must be exactly 15 digits
  if (!/^\d{15}$/.test(cleanTrn)) {
    return {
      valid: false,
      error: 'UAE TRN must be exactly 15 digits',
    };
  }

  return { valid: true };
}
