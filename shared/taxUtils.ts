/**
 * UAE VAT Tax Calculation Utilities
 * 
 * In UAE, VAT is tax-inclusive:
 * - Service prices INCLUDE tax (not added on top)
 * - Bills/expenses INCLUDE tax (deductible from collected tax)
 * - Net VAT = (Tax Collected from Customers) - (Tax Paid on Expenses)
 */

export interface TaxBreakdown {
  totalAmount: number;
  netAmount: number;
  taxAmount: number;
  taxRate: number;
}

/**
 * Calculate tax breakdown from a tax-inclusive total price
 * Formula: Tax Amount = (Total × Tax Rate) / (100 + Tax Rate)
 * 
 * @param totalPrice - The total price INCLUDING tax
 * @param taxRate - Tax rate as percentage (e.g., 5 for 5%)
 * @returns Breakdown with total, net amount, and tax amount
 */
export function calculateTaxInclusive(totalPrice: number, taxRate: number): TaxBreakdown {
  const taxMultiplier = taxRate / (100 + taxRate);
  const taxAmount = totalPrice * taxMultiplier;
  const netAmount = totalPrice - taxAmount;
  
  return {
    totalAmount: Number(totalPrice.toFixed(2)),
    netAmount: Number(netAmount.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    taxRate,
  };
}

/**
 * Calculate total from net amount and tax rate
 * Formula: Total = Net Amount × (1 + Tax Rate / 100)
 * 
 * @param netAmount - The net amount (before tax)
 * @param taxRate - Tax rate as percentage (e.g., 5 for 5%)
 * @returns Total amount including tax
 */
export function calculateTotalFromNet(netAmount: number, taxRate: number): number {
  const total = netAmount * (1 + taxRate / 100);
  return Number(total.toFixed(2));
}

/**
 * Calculate VAT summary for the business
 * Net VAT Payable = VAT Collected from Customers - VAT Paid on Expenses
 * 
 * @param vatCollected - Total tax collected from customer sales
 * @param vatPaid - Total tax paid on bills/expenses
 * @returns Net VAT payable (positive = owe to authorities, negative = credit)
 */
export function calculateNetVAT(vatCollected: number, vatPaid: number): {
  vatCollected: number;
  vatPaid: number;
  netVATPayable: number;
} {
  const netVATPayable = vatCollected - vatPaid;
  
  return {
    vatCollected: Number(vatCollected.toFixed(2)),
    vatPaid: Number(vatPaid.toFixed(2)),
    netVATPayable: Number(netVATPayable.toFixed(2)),
  };
}

/**
 * Format currency with AED symbol
 */
export function formatCurrency(amount: number, currency: string = 'AED'): string {
  return `${currency} ${amount.toFixed(2)}`;
}

/**
 * Calculate tax for multiple items
 */
export function calculateItemsTax(items: { price: number; quantity?: number }[], taxRate: number): TaxBreakdown {
  const totalAmount = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  return calculateTaxInclusive(totalAmount, taxRate);
}
