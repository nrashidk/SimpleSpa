/**
 * Amendment Logger for Audit Trail
 * 
 * Logs all data changes for FTA compliance and audit requirements
 * Tracks who changed what, when, and why
 */

import { db } from "./db";
import { amendments, users } from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export interface AmendmentLogData {
  changeType: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  tableName: string;
  recordId: number;
  previous?: any;
  current?: any;
  amendedBy?: number;
  amendedByName?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}

export interface AmendmentFilters {
  changeType?: string;
  tableName?: string;
  startDate?: Date;
  endDate?: Date;
  amendedBy?: number;
  recordId?: number;
}

/**
 * Log an amendment (data change) for audit trail
 */
export async function logAmendment(data: AmendmentLogData): Promise<void> {
  try {
    await db.insert(amendments).values({
      changeType: data.changeType,
      tableName: data.tableName,
      recordId: data.recordId,
      previous: data.previous || null,
      current: data.current || null,
      amendedBy: data.amendedBy || null,
      amendedByName: data.amendedByName || 'System',
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      reason: data.reason || null,
    });
  } catch (error) {
    console.error('Failed to log amendment:', error);
    // Don't throw - logging failures shouldn't break the main operation
  }
}

/**
 * Get amendment logs with optional filters
 */
export async function getAmendmentLogs(filters: AmendmentFilters = {}) {
  const { changeType, tableName, startDate, endDate, amendedBy, recordId } = filters;

  const conditions = [];
  if (changeType) conditions.push(eq(amendments.changeType, changeType));
  if (tableName) conditions.push(eq(amendments.tableName, tableName));
  if (startDate) conditions.push(gte(amendments.amendDate, startDate));
  if (endDate) conditions.push(lte(amendments.amendDate, endDate));
  if (amendedBy) conditions.push(eq(amendments.amendedBy, amendedBy));
  if (recordId) conditions.push(eq(amendments.recordId, recordId));

  const query = db
    .select()
    .from(amendments)
    .orderBy(desc(amendments.amendDate))
    .limit(1000); // Limit to prevent huge result sets

  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }

  return await query;
}

/**
 * Get audit trail for a specific record
 */
export async function getRecordAuditTrail(tableName: string, recordId: number) {
  return await db
    .select()
    .from(amendments)
    .where(and(
      eq(amendments.tableName, tableName),
      eq(amendments.recordId, recordId)
    ))
    .orderBy(desc(amendments.amendDate));
}

/**
 * Helper: Extract user context from request for logging
 */
export function extractUserContext(req: any): Pick<AmendmentLogData, 'ipAddress' | 'userAgent'> {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.headers?.['user-agent'] || 'unknown',
  };
}
