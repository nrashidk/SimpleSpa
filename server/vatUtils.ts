/**
 * UAE VAT Utilities
 * UAE VAT Rate: 5% (inclusive pricing model)
 * Tax Codes: SR (Standard Rate 5%), ZR (Zero-Rated 0%), ES (Exempt), OP (Out of Scope)
 */

export const UAE_VAT_RATE = 0.05;

export interface VATCalculation {
  netAmount: number;
  vatAmount: number;
  total: number;
}

/**
 * UAE Tax Codes for FTA Compliance
 */
export const TAX_CODES = {
  SR: { code: 'SR', name: 'Standard Rate (5%)', rate: 0.05 },
  ZR: { code: 'ZR', name: 'Zero-Rated (0%)', rate: 0 },
  ES: { code: 'ES', name: 'Exempt', rate: 0 },
  OP: { code: 'OP', name: 'Out of Scope', rate: 0 },
} as const;

export type TaxCode = keyof typeof TAX_CODES;

/**
 * Calculate VAT from inclusive (gross) amount
 * Used when price already includes VAT (UAE standard practice)
 * 
 * @param inclusiveAmount - Total price including VAT
 * @param taxCode - UAE tax code (SR, ZR, ES, OP)
 * @returns VATCalculation with net, VAT, and total amounts
 * 
 * @example
 * // For AED 105 inclusive price with 5% VAT
 * calculateVAT(105, 'SR')
 * // Returns: { netAmount: 100, vatAmount: 5, total: 105 }
 */
export function calculateVAT(
  inclusiveAmount: number,
  taxCode: TaxCode = 'SR'
): VATCalculation {
  const vatRate = TAX_CODES[taxCode].rate;
  
  if (vatRate === 0) {
    // Zero-rated, exempt, or out of scope - no VAT
    return {
      netAmount: parseFloat(inclusiveAmount.toFixed(2)),
      vatAmount: 0,
      total: parseFloat(inclusiveAmount.toFixed(2)),
    };
  }

  // For inclusive pricing: Net = Total / (1 + VAT Rate)
  const net = inclusiveAmount / (1 + vatRate);
  const vat = inclusiveAmount - net;

  return {
    netAmount: parseFloat(net.toFixed(2)),
    vatAmount: parseFloat(vat.toFixed(2)),
    total: parseFloat(inclusiveAmount.toFixed(2)),
  };
}

/**
 * Calculate VAT from exclusive (net) amount
 * Used when VAT needs to be added on top
 * 
 * @param exclusiveAmount - Net price before VAT
 * @param taxCode - UAE tax code
 * @returns VATCalculation with net, VAT, and total amounts
 * 
 * @example
 * // For AED 100 net with 5% VAT to be added
 * calculateVATFromNet(100, 'SR')
 * // Returns: { netAmount: 100, vatAmount: 5, total: 105 }
 */
export function calculateVATFromNet(
  exclusiveAmount: number,
  taxCode: TaxCode = 'SR'
): VATCalculation {
  const vatRate = TAX_CODES[taxCode].rate;
  
  if (vatRate === 0) {
    return {
      netAmount: parseFloat(exclusiveAmount.toFixed(2)),
      vatAmount: 0,
      total: parseFloat(exclusiveAmount.toFixed(2)),
    };
  }

  const vat = exclusiveAmount * vatRate;
  const total = exclusiveAmount + vat;

  return {
    netAmount: parseFloat(exclusiveAmount.toFixed(2)),
    vatAmount: parseFloat(vat.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
  };
}

/**
 * Apply discount and then calculate VAT
 * Discounts are applied to gross amount, then VAT is calculated
 * 
 * @param grossAmount - Original price including VAT
 * @param discountAmount - Flat discount amount
 * @param taxCode - UAE tax code
 * @returns VATCalculation after discount
 */
export function calculateVATWithDiscount(
  grossAmount: number,
  discountAmount: number,
  taxCode: TaxCode = 'SR'
): VATCalculation {
  const netGrossAmount = grossAmount - discountAmount;
  return calculateVAT(netGrossAmount, taxCode);
}
