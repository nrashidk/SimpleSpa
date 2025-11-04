import { db } from "./db";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "@shared/schema";

type NeonTransaction = Parameters<Parameters<NeonDatabase<typeof schema>['transaction']>[0]>[0];
type TransactionCallback<T> = (tx: NeonTransaction) => Promise<T>;

/**
 * Wraps database operations in a transaction
 * Automatically commits on success or rolls back on error
 * 
 * @param callback - Async function containing database operations
 * @returns The result of the callback function
 * @throws Re-throws any error from the callback after rollback
 * 
 * @example
 * const result = await withTransaction(async (tx) => {
 *   const user = await tx.insert(users).values({...}).returning();
 *   const spa = await tx.insert(spas).values({...}).returning();
 *   return { user, spa };
 * });
 */
export async function withTransaction<T>(
  callback: TransactionCallback<T>
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      return await callback(tx);
    });
  } catch (error) {
    console.error("Transaction failed and was rolled back:", error);
    throw error;
  }
}

/**
 * Type guard to check if an error is a database constraint violation
 */
export function isConstraintViolation(error: any): boolean {
  return error?.code === '23505' || error?.code === '23503' || error?.code === '23502';
}

/**
 * Type guard to check if an error is a foreign key violation
 */
export function isForeignKeyViolation(error: any): boolean {
  return error?.code === '23503';
}

/**
 * Type guard to check if an error is a unique constraint violation
 */
export function isUniqueViolation(error: any): boolean {
  return error?.code === '23505';
}

/**
 * Type guard to check if an error is a not-null violation
 */
export function isNotNullViolation(error: any): boolean {
  return error?.code === '23502';
}

/**
 * Extract a user-friendly error message from a database error
 */
export function getDbErrorMessage(error: any): string {
  if (isUniqueViolation(error)) {
    return "A record with this value already exists";
  }
  if (isForeignKeyViolation(error)) {
    return "Referenced record does not exist";
  }
  if (isNotNullViolation(error)) {
    return "Required field is missing";
  }
  return error?.message || "Database operation failed";
}
