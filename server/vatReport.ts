/**
 * VAT Return Report Aggregator
 * 
 * Aggregates VAT amounts from all revenue streams:
 * - Service bookings
 * - Retail product sales
 * - Loyalty card purchases
 * 
 * Provides comprehensive VAT reporting for UAE FTA compliance
 */

import { db } from "./db";
import { bookings, productSales, loyaltyCards, bookingItems, services, staff } from "@shared/schema";
import { gte, lte, and, eq, sum, sql } from "drizzle-orm";

export interface VATReportFilters {
  startDate?: Date;
  endDate?: Date;
  spaId?: number;
  taxCode?: string; // SR, ZR, ES, OP
}

export interface VATReportResult {
  period: {
    from: string;
    to: string;
  };
  totals: {
    services: {
      count: number;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
    };
    products: {
      count: number;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
    };
    loyalty: {
      count: number;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
    };
    overall: {
      totalCount: number;
      totalNet: number;
      totalVAT: number;
      totalGross: number;
    };
  };
  byTaxCode: {
    taxCode: string;
    count: number;
    netAmount: number;
    vatAmount: number;
    grossAmount: number;
  }[];
}

/**
 * Generate comprehensive VAT return report
 */
export async function getVATReturnReport(filters: VATReportFilters): Promise<VATReportResult> {
  const { startDate, endDate, spaId, taxCode } = filters;

  // Build date conditions
  const dateConditions = [];
  if (startDate) dateConditions.push(gte(bookings.bookingDate, startDate));
  if (endDate) dateConditions.push(lte(bookings.bookingDate, endDate));

  // 1. Aggregate Service Bookings VAT
  const serviceVATQuery = db
    .select({
      count: sql<number>`count(*)::int`,
      netAmount: sql<string>`COALESCE(SUM(COALESCE(${bookingItems.netAmount}, 0)), 0)`,
      vatAmount: sql<string>`COALESCE(SUM(COALESCE(${bookingItems.vatAmount}, 0)), 0)`,
      grossAmount: sql<string>`COALESCE(SUM(COALESCE(${bookingItems.price}, 0)), 0)`,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id));

  const serviceConditions = [...dateConditions];
  if (spaId) serviceConditions.push(eq(bookings.spaId, spaId));
  if (taxCode) serviceConditions.push(eq(bookingItems.taxCode, taxCode));

  const servicesData = serviceConditions.length > 0
    ? await serviceVATQuery.where(and(...serviceConditions))
    : await serviceVATQuery;

  // 2. Aggregate Product Sales VAT (filter by staff spa)
  const productVATQuery = db
    .select({
      count: sql<number>`count(*)::int`,
      netAmount: sql<string>`COALESCE(SUM(COALESCE(${productSales.netAmount}, 0)), 0)`,
      vatAmount: sql<string>`COALESCE(SUM(COALESCE(${productSales.vatAmount}, 0)), 0)`,
      grossAmount: sql<string>`COALESCE(SUM(COALESCE(${productSales.totalPrice}, 0)), 0)`,
    })
    .from(productSales);

  let productsData;
  if (spaId) {
    // Filter by staff's spa
    const productConditions = [];
    if (startDate) productConditions.push(gte(productSales.saleDate, startDate));
    if (endDate) productConditions.push(lte(productSales.saleDate, endDate));
    if (taxCode) productConditions.push(eq(productSales.taxCode, taxCode));

    productsData = await db
      .select({
        count: sql<number>`count(*)::int`,
        netAmount: sql<string>`COALESCE(SUM(COALESCE(${productSales.netAmount}, 0)), 0)`,
        vatAmount: sql<string>`COALESCE(SUM(COALESCE(${productSales.vatAmount}, 0)), 0)`,
        grossAmount: sql<string>`COALESCE(SUM(COALESCE(${productSales.totalPrice}, 0)), 0)`,
      })
      .from(productSales)
      .innerJoin(staff, eq(productSales.soldBy, staff.id))
      .where(and(
        eq(staff.spaId, spaId),
        ...productConditions
      ));
  } else {
    const productConditions = [];
    if (startDate) productConditions.push(gte(productSales.saleDate, startDate));
    if (endDate) productConditions.push(lte(productSales.saleDate, endDate));
    if (taxCode) productConditions.push(eq(productSales.taxCode, taxCode));

    productsData = productConditions.length > 0
      ? await productVATQuery.where(and(...productConditions))
      : await productVATQuery;
  }

  // 3. Aggregate Loyalty Card Purchases VAT (filter by service spa)
  const loyaltyVATQuery = db
    .select({
      count: sql<number>`count(*)::int`,
      netAmount: sql<string>`COALESCE(SUM(COALESCE(${loyaltyCards.netAmount}, 0)), 0)`,
      vatAmount: sql<string>`COALESCE(SUM(COALESCE(${loyaltyCards.vatAmount}, 0)), 0)`,
      grossAmount: sql<string>`COALESCE(SUM(COALESCE(${loyaltyCards.purchasePrice}, 0)), 0)`,
    })
    .from(loyaltyCards);

  let loyaltyData;
  if (spaId) {
    // Filter by service's spa
    const loyaltyConditions = [];
    if (startDate) loyaltyConditions.push(gte(loyaltyCards.purchaseDate, startDate));
    if (endDate) loyaltyConditions.push(lte(loyaltyCards.purchaseDate, endDate));
    if (taxCode) loyaltyConditions.push(eq(loyaltyCards.taxCode, taxCode));

    loyaltyData = await db
      .select({
        count: sql<number>`count(*)::int`,
        netAmount: sql<string>`COALESCE(SUM(COALESCE(${loyaltyCards.netAmount}, 0)), 0)`,
        vatAmount: sql<string>`COALESCE(SUM(COALESCE(${loyaltyCards.vatAmount}, 0)), 0)`,
        grossAmount: sql<string>`COALESCE(SUM(COALESCE(${loyaltyCards.purchasePrice}, 0)), 0)`,
      })
      .from(loyaltyCards)
      .innerJoin(services, eq(loyaltyCards.serviceId, services.id))
      .where(and(
        eq(services.spaId, spaId),
        ...loyaltyConditions
      ));
  } else {
    const loyaltyConditions = [];
    if (startDate) loyaltyConditions.push(gte(loyaltyCards.purchaseDate, startDate));
    if (endDate) loyaltyConditions.push(lte(loyaltyCards.purchaseDate, endDate));
    if (taxCode) loyaltyConditions.push(eq(loyaltyCards.taxCode, taxCode));

    loyaltyData = loyaltyConditions.length > 0
      ? await loyaltyVATQuery.where(and(...loyaltyConditions))
      : await loyaltyVATQuery;
  }

  const services = servicesData[0] || { count: 0, netAmount: '0', vatAmount: '0', grossAmount: '0' };
  const products = productsData[0] || { count: 0, netAmount: '0', vatAmount: '0', grossAmount: '0' };
  const loyalty = loyaltyData[0] || { count: 0, netAmount: '0', vatAmount: '0', grossAmount: '0' };

  const totalNet = parseFloat(services.netAmount) + parseFloat(products.netAmount) + parseFloat(loyalty.netAmount);
  const totalVAT = parseFloat(services.vatAmount) + parseFloat(products.vatAmount) + parseFloat(loyalty.vatAmount);
  const totalGross = parseFloat(services.grossAmount) + parseFloat(products.grossAmount) + parseFloat(loyalty.grossAmount);

  // Get breakdown by tax code
  const taxCodes = ['SR', 'ZR', 'ES', 'OP'];
  const byTaxCodePromises = taxCodes.map(async (code) => {
    const report = await getVATReturnReport({ ...filters, taxCode: code });
    return {
      taxCode: code,
      count: report.totals.overall.totalCount,
      netAmount: report.totals.overall.totalNet,
      vatAmount: report.totals.overall.totalVAT,
      grossAmount: report.totals.overall.totalGross,
    };
  });

  const byTaxCode = taxCode ? [] : await Promise.all(byTaxCodePromises);

  return {
    period: {
      from: startDate?.toISOString().split('T')[0] || 'All time',
      to: endDate?.toISOString().split('T')[0] || 'All time',
    },
    totals: {
      services: {
        count: services.count,
        netAmount: parseFloat(services.netAmount),
        vatAmount: parseFloat(services.vatAmount),
        grossAmount: parseFloat(services.grossAmount),
      },
      products: {
        count: products.count,
        netAmount: parseFloat(products.netAmount),
        vatAmount: parseFloat(products.vatAmount),
        grossAmount: parseFloat(products.grossAmount),
      },
      loyalty: {
        count: loyalty.count,
        netAmount: parseFloat(loyalty.netAmount),
        vatAmount: parseFloat(loyalty.vatAmount),
        grossAmount: parseFloat(loyalty.grossAmount),
      },
      overall: {
        totalCount: services.count + products.count + loyalty.count,
        totalNet,
        totalVAT,
        totalGross,
      },
    },
    byTaxCode,
  };
}
