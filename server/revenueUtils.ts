/**
 * Revenue Utilities for VAT Threshold Tracking
 * 
 * Calculates annual revenue to help spas track when they approach
 * the UAE VAT registration threshold (AED 375,000 per calendar year).
 */

import type { Invoice } from "@shared/schema";

/**
 * Calculate total revenue for a specific calendar year from invoices.
 * 
 * @param invoices - Array of invoices to analyze
 * @param year - Calendar year (e.g., 2025)
 * @returns Total revenue amount for the year
 */
export function calculateAnnualRevenue(invoices: Invoice[], year: number): number {
  const yearStart = new Date(year, 0, 1); // Jan 1
  const yearEnd = new Date(year, 11, 31, 23, 59, 59); // Dec 31

  return invoices
    .filter(invoice => {
      const issueDate = new Date(invoice.issueDate);
      return issueDate >= yearStart && issueDate <= yearEnd;
    })
    .reduce((total, invoice) => {
      return total + parseFloat(invoice.totalAmount);
    }, 0);
}

/**
 * Check if spa has reached VAT threshold for current year.
 * 
 * @param invoices - Array of invoices
 * @param thresholdAmount - VAT threshold amount (default AED 375,000)
 * @returns Object with threshold status and details
 */
export function checkVATThreshold(
  invoices: Invoice[],
  thresholdAmount: number = 375000
): {
  currentYear: number;
  annualRevenue: number;
  thresholdAmount: number;
  thresholdReached: boolean;
  percentageOfThreshold: number;
  remainingToThreshold: number;
} {
  const currentYear = new Date().getFullYear();
  const annualRevenue = calculateAnnualRevenue(invoices, currentYear);
  const thresholdReached = annualRevenue >= thresholdAmount;
  const percentageOfThreshold = (annualRevenue / thresholdAmount) * 100;
  const remainingToThreshold = Math.max(0, thresholdAmount - annualRevenue);

  return {
    currentYear,
    annualRevenue,
    thresholdAmount,
    thresholdReached,
    percentageOfThreshold,
    remainingToThreshold,
  };
}

/**
 * Determine if a threshold notification should be sent.
 * 
 * Notifications are sent once per year when threshold is reached,
 * unless already sent in the current year.
 * 
 * @param thresholdReached - Whether threshold has been reached
 * @param lastNotificationYear - Last year notification was sent (null if never)
 * @returns Whether to send notification
 */
export function shouldSendThresholdNotification(
  thresholdReached: boolean,
  lastNotificationYear: number | null
): boolean {
  if (!thresholdReached) {
    return false;
  }

  const currentYear = new Date().getFullYear();
  
  // Send if never sent before, or not sent this year
  return lastNotificationYear === null || lastNotificationYear < currentYear;
}
