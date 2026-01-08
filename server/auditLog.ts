import { Request } from "express";
import { db } from "./db";
import { auditLogs, InsertAuditLog } from "@shared/schema";
import { logger } from "./logger";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "APPROVAL" | "REJECTION" | "BLOCK" | "UNBLOCK" | "MERGE" | "IMPORT" | "AUTH_FAILED" | "UNAUTHORIZED" | "EXPORT" | "CONFIG_CHANGE" | "PRIVILEGE_USE";
export type AuditEntityType = "booking" | "invoice" | "service" | "membership" | "customer_membership" | "staff" | "staff_emergency_contact" | "staff_timesheet" | "customer" | "spa" | "product" | "loyalty_card" | "expense" | "vendor" | "service_variant" | "variant_staff_pricing" | "service_addon" | "addon_option" | "service_bundle" | "bundle_item" | "service_extra_time" | "notification_provider" | "security" | "report" | "settings";

interface AuditLogData {
  userId?: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: number;
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
  };
  ipAddress?: string;
  userAgent?: string;
  spaId?: number;
  role?: string;
}

export class AuditLogger {
  /**
   * Log an audit event
   */
  static async log(data: AuditLogData): Promise<void> {
    try {
      const auditLog: InsertAuditLog = {
        userId: data.userId,
        userRole: data.role,
        spaId: data.spaId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        changes: data.changes || null,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      };

      await db.insert(auditLogs).values(auditLog);
    } catch (error) {
      logger.error("Failed to create audit log", { error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  /**
   * Log a CREATE action
   */
  static async logCreate(
    req: Request,
    entityType: AuditEntityType,
    entityId: number,
    data: any,
    spaId?: number
  ): Promise<void> {
    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);
    
    await this.log({
      userId,
      action: "CREATE",
      entityType,
      entityId,
      changes: {
        after: data,
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      spaId,
      role,
    });
  }

  /**
   * Log an UPDATE action
   */
  static async logUpdate(
    req: Request,
    entityType: AuditEntityType,
    entityId: number,
    before: any,
    after: any,
    spaId?: number
  ): Promise<void> {
    // Calculate changed fields
    const changedFields = Object.keys(after).filter(
      key => JSON.stringify(before[key]) !== JSON.stringify(after[key])
    );

    if (changedFields.length === 0) {
      return; // No changes, don't log
    }

    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action: "UPDATE",
      entityType,
      entityId,
      changes: {
        before: this.pickFields(before, changedFields),
        after: this.pickFields(after, changedFields),
        fields: changedFields,
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      spaId,
      role,
    });
  }

  /**
   * Log a DELETE action
   */
  static async logDelete(
    req: Request,
    entityType: AuditEntityType,
    entityId: number,
    data: any,
    spaId?: number
  ): Promise<void> {
    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action: "DELETE",
      entityType,
      entityId,
      changes: {
        before: data,
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      spaId,
      role,
    });
  }

  /**
   * Log authentication events
   */
  static async logAuth(
    req: Request,
    action: "LOGIN" | "LOGOUT",
    userId: string
  ): Promise<void> {
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action,
      entityType: "customer", // Use customer as placeholder for auth events
      entityId: 0,
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      role,
    });
  }

  /**
   * Log a generic action (block, unblock, merge, import, etc.)
   */
  static async logAction(
    req: Request,
    action: AuditAction,
    entityType: AuditEntityType,
    entityId: number,
    data?: any,
    spaId?: number
  ): Promise<void> {
    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action,
      entityType,
      entityId,
      changes: data ? { after: data } : undefined,
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      spaId,
      role,
    });
  }

  /**
   * Log approval/rejection events for super admin actions
   */
  static async logApproval(
    req: Request,
    action: "APPROVAL" | "REJECTION",
    entityType: AuditEntityType,
    entityId: number,
    data: any
  ): Promise<void> {
    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action,
      entityType,
      entityId,
      changes: {
        after: data,
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      role,
    });
  }

  /**
   * Log failed authentication attempts
   */
  static async logAuthFailed(
    req: Request,
    email: string,
    reason: string
  ): Promise<void> {
    await this.log({
      userId: undefined,
      action: "AUTH_FAILED",
      entityType: "security",
      entityId: 0,
      changes: {
        after: {
          email: email.replace(/(?<=.{2}).(?=.*@)/g, '*'),
          reason,
          timestamp: new Date().toISOString(),
        },
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
    });
  }

  /**
   * Log unauthorized access attempts (403 responses)
   */
  static async logUnauthorized(
    req: Request,
    resource: string,
    reason?: string
  ): Promise<void> {
    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action: "UNAUTHORIZED",
      entityType: "security",
      entityId: 0,
      changes: {
        after: {
          resource,
          method: req.method,
          path: req.path,
          reason,
          timestamp: new Date().toISOString(),
        },
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      role,
    });
  }

  /**
   * Log data export operations
   */
  static async logExport(
    req: Request,
    exportType: string,
    recordCount: number,
    format: string,
    spaId?: number
  ): Promise<void> {
    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action: "EXPORT",
      entityType: "report",
      entityId: 0,
      changes: {
        after: {
          exportType,
          recordCount,
          format,
          timestamp: new Date().toISOString(),
        },
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      spaId,
      role,
    });
  }

  /**
   * Log configuration changes
   */
  static async logConfigChange(
    req: Request,
    configType: string,
    before: any,
    after: any,
    spaId?: number
  ): Promise<void> {
    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action: "CONFIG_CHANGE",
      entityType: "settings",
      entityId: spaId || 0,
      changes: {
        before,
        after,
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      spaId,
      role,
    });
  }

  /**
   * Log admin privilege usage (sensitive operations)
   */
  static async logPrivilegeUse(
    req: Request,
    operation: string,
    targetUserId?: string,
    details?: any,
    spaId?: number
  ): Promise<void> {
    const userId = this.getUserId(req);
    const role = await this.getUserRole(userId);

    await this.log({
      userId,
      action: "PRIVILEGE_USE",
      entityType: "security",
      entityId: 0,
      changes: {
        after: {
          operation,
          targetUserId,
          details,
          timestamp: new Date().toISOString(),
        },
      },
      ipAddress: this.getIpAddress(req),
      userAgent: req.get("user-agent"),
      spaId,
      role,
    });
  }

  /**
   * Get user ID from request
   */
  private static getUserId(req: Request): string | undefined {
    const user = (req as any).user;
    if (!user) return undefined;
    return user.claims?.sub;
  }

  /**
   * Get user role from database
   */
  private static async getUserRole(userId?: string): Promise<string | undefined> {
    if (!userId) return undefined;
    
    try {
      const { storage } = await import("./storage");
      const user = await storage.getUser(userId);
      return user?.role;
    } catch (error) {
      logger.error("Failed to get user role for audit log", { error: error instanceof Error ? error.message : 'Unknown' });
      return undefined;
    }
  }

  /**
   * Get client IP address from request
   */
  private static getIpAddress(req: Request): string | undefined {
    // Check various headers for the real IP (useful behind proxies)
    const forwarded = req.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    return req.ip || req.socket.remoteAddress;
  }

  /**
   * Pick specific fields from an object
   */
  private static pickFields(obj: any, fields: string[]): any {
    const result: any = {};
    for (const field of fields) {
      if (field in obj) {
        result[field] = obj[field];
      }
    }
    return result;
  }
}
