import { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { staff, staffRoles } from "@shared/schema";
import { eq } from "drizzle-orm";

// Permission levels (higher number = more permissions)
const roleHierarchy = {
  [staffRoles.BASIC]: 1,
  [staffRoles.VIEW_OWN]: 2,
  [staffRoles.VIEW_ALL]: 3,
  [staffRoles.MANAGE_BOOKINGS]: 4,
  [staffRoles.ADMIN_ACCESS]: 5,
} as const;

// Check if a role has at least the required permission level
export function hasPermission(userRole: string, requiredRole: string): boolean {
  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
  const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0;
  return userLevel >= requiredLevel;
}

// Get staff record for the authenticated user
export async function getStaffByUserId(userId: string) {
  const staffMember = await db.query.staff.findFirst({
    where: eq(staff.userId, userId),
  });
  return staffMember;
}

// Middleware to check if user is staff member
export async function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const userId = (req as any).user.claims.sub;
  const { storage } = await import("./storage");
  const user = await storage.getUser(userId);

  // Admins and super admins have all staff permissions
  if (user?.role === "admin" || user?.role === "super_admin") {
    return next();
  }

  const staffMember = await getStaffByUserId(userId);
  if (!staffMember) {
    return res.status(403).json({ error: "Staff access required" });
  }

  // Attach staff info to request for later use
  (req as any).staffMember = staffMember;
  next();
}

// Middleware to check minimum required role
export function requireStaffRole(requiredRole: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userId = (req as any).user.claims.sub;
    const { storage } = await import("./storage");
    const user = await storage.getUser(userId);

    // Admins and super admins bypass staff role checks
    if (user?.role === "admin" || user?.role === "super_admin") {
      return next();
    }

    const staffMember = await getStaffByUserId(userId);
    if (!staffMember) {
      return res.status(403).json({ error: "Staff access required" });
    }

    if (!hasPermission(staffMember.role || staffRoles.BASIC, requiredRole)) {
      return res.status(403).json({ 
        error: "Insufficient permissions",
        required: requiredRole,
        current: staffMember.role 
      });
    }

    // Attach staff info to request for later use
    (req as any).staffMember = staffMember;
    next();
  };
}

// Check if staff can view a specific staff member's calendar
export function canViewStaffCalendar(viewerRole: string, viewerStaffId: number, targetStaffId: number): boolean {
  // Can always view own calendar if VIEW_OWN or higher
  if (viewerStaffId === targetStaffId && hasPermission(viewerRole, staffRoles.VIEW_OWN)) {
    return true;
  }
  
  // Need VIEW_ALL to view others' calendars
  return hasPermission(viewerRole, staffRoles.VIEW_ALL);
}

// Check if staff can edit appointments
export function canEditAppointments(role: string): boolean {
  return hasPermission(role, staffRoles.MANAGE_BOOKINGS);
}

// Check if staff can access dashboard/reports
export function canAccessDashboard(role: string): boolean {
  return hasPermission(role, staffRoles.ADMIN_ACCESS);
}
