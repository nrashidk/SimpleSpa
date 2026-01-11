/**
 * Test Data Import Utility for FTA Certification
 * 
 * Imports test datasets provided by UAE Federal Tax Authority
 * for VAT compliance validation and certification testing
 */

import { db } from "./db";
import { bookings, productSales, loyaltyCards, invoices, transactions } from "@shared/schema";
import { calculateVAT, type TaxCode } from "./vatUtils";

export interface TestDataTransaction {
  type: 'booking' | 'product_sale' | 'loyalty_card' | 'invoice' | 'transaction';
  date: string;
  amount: number;
  taxCode?: string;
  customerId?: number;
  spaId?: number;
  // Additional fields based on type
  [key: string]: any;
}

export interface TestDataImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Validate a single test data entry before import
 */
function validateTestDataEntry(entry: TestDataTransaction): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!entry.type) errors.push('Missing transaction type');
  if (!entry.date) errors.push('Missing date');
  if (entry.amount === undefined || entry.amount === null) errors.push('Missing amount');
  if (isNaN(entry.amount)) errors.push('Invalid amount - must be a number');

  // Validate amount is positive
  if (entry.amount < 0) errors.push('Amount must be positive');

  // Validate tax code if provided
  if (entry.taxCode && !['SR', 'ZR', 'ES', 'OP'].includes(entry.taxCode)) {
    errors.push(`Invalid tax code: ${entry.taxCode}. Must be SR, ZR, ES, or OP`);
  }

  // Validate date format
  const dateObj = new Date(entry.date);
  if (isNaN(dateObj.getTime())) {
    errors.push(`Invalid date format: ${entry.date}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Import FTA test data from JSON array
 */
export async function importFTATestData(
  testData: TestDataTransaction[]
): Promise<TestDataImportResult> {
  const result: TestDataImportResult = {
    success: true,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  for (const entry of testData) {
    try {
      // Validate entry
      const validation = validateTestDataEntry(entry);
      if (!validation.valid) {
        result.skipped++;
        result.errors.push(`Skipped entry: ${validation.errors.join(', ')}`);
        continue;
      }

      // Calculate VAT amounts
      const taxCode = (entry.taxCode || 'SR') as TaxCode;
      const vatData = calculateVAT(entry.amount, taxCode);

      // Import based on type
      switch (entry.type) {
        case 'product_sale':
          await db.insert(productSales).values({
            customerId: entry.customerId || 1,
            productId: entry.productId || 1,
            quantity: entry.quantity || 1,
            unitPrice: (entry.amount / (entry.quantity || 1)).toString(),
            totalPrice: entry.amount.toString(),
            netAmount: vatData.netAmount.toString(),
            vatAmount: vatData.vatAmount.toString(),
            taxCode,
            saleDate: new Date(entry.date),
            soldBy: entry.soldBy || 1,
            notes: entry.notes || 'FTA Test Data',
          });
          result.imported++;
          break;

        case 'loyalty_card':
          await db.insert(loyaltyCards).values({
            customerId: entry.customerId || 1,
            serviceId: entry.serviceId || 1,
            cardType: entry.cardType || 'Test Package',
            purchasePrice: entry.amount.toString(),
            netAmount: vatData.netAmount.toString(),
            vatAmount: vatData.vatAmount.toString(),
            taxCode,
            totalSessions: entry.sessionsIncluded || 10,
            usedSessions: (entry.sessionsIncluded || 10) - (entry.sessionsRemaining || 10),
            purchaseDate: new Date(entry.date),
            expiryDate: entry.expiryDate ? new Date(entry.expiryDate) : undefined,
            notes: entry.notes || 'FTA Test Data',
          });
          result.imported++;
          break;

        case 'transaction':
          // Transactions typically link to invoices
          if (entry.invoiceId) {
            await db.insert(transactions).values({
              invoiceId: entry.invoiceId,
              transactionType: entry.transactionType || 'payment',
              amount: entry.amount.toString(),
              transactionDate: new Date(entry.date),
              paymentMethod: entry.paymentMethod || 'cash',
              notes: entry.notes || 'FTA Test Data',
            });
            result.imported++;
          } else {
            result.skipped++;
            result.errors.push('Transaction requires invoiceId');
          }
          break;

        default:
          result.skipped++;
          result.errors.push(`Unsupported transaction type: ${entry.type}`);
      }
    } catch (error: any) {
      result.errors.push(`Failed to import entry: ${error.message}`);
      result.skipped++;
      result.success = false;
    }
  }

  return result;
}

/**
 * Import test data from JSON file content
 */
export async function importFromJSON(jsonContent: string): Promise<TestDataImportResult> {
  try {
    const data = JSON.parse(jsonContent);
    
    // Support both array format and object with transactions property
    const transactions = Array.isArray(data) ? data : data.transactions || [];
    
    return await importFTATestData(transactions);
  } catch (error: any) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors: [`Failed to parse JSON: ${error.message}`],
    };
  }
}

/**
 * Generate sample FTA test data for validation
 */
export function generateSampleTestData(): TestDataTransaction[] {
  return [
    {
      type: 'product_sale',
      date: new Date().toISOString(),
      amount: 105.00, // 100 net + 5 VAT
      taxCode: 'SR',
      customerId: 1,
      productId: 1,
      quantity: 1,
      soldBy: 1,
      notes: 'Sample product sale with standard rated VAT',
    },
    {
      type: 'loyalty_card',
      date: new Date().toISOString(),
      amount: 525.00, // 500 net + 25 VAT
      taxCode: 'SR',
      customerId: 1,
      serviceId: 1,
      cardType: '10 Session Package',
      sessionsIncluded: 10,
      sessionsRemaining: 10,
      notes: 'Sample loyalty card purchase',
    },
    {
      type: 'product_sale',
      date: new Date().toISOString(),
      amount: 50.00, // Zero-rated, no VAT
      taxCode: 'ZR',
      customerId: 1,
      productId: 2,
      quantity: 1,
      soldBy: 1,
      notes: 'Zero-rated product sale',
    },
  ];
}
