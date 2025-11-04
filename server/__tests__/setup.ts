import { db } from "../db";
import { 
  users, spas, staff, services, customers, 
  bookings, bookingItems
} from "../../shared/schema";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function cleanupTestData() {
  await db.delete(bookingItems);
  await db.delete(bookings);
  await db.delete(customers);
  await db.delete(services);
  await db.delete(staff);
  await db.delete(users).where(sql`email LIKE '%@test%'`);
  await db.delete(spas).where(sql`name LIKE '%Test%'`);
}

export async function createTestSpa(name: string, email: string) {
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);
  
  const [user] = await db.insert(users).values({
    email,
    password: hashedPassword,
    role: "admin",
    status: "approved",
  }).returning();

  const [spa] = await db.insert(spas).values({
    name,
    slug: generateSlug(name),
    contactEmail: email,
    contactPhone: "+971501234567",
    address: "Test Address",
    city: "Dubai",
    active: true,
    setupComplete: true,
  }).returning();

  await db.update(users)
    .set({ adminSpaId: spa.id })
    .where(sql`id = ${user.id}`);

  const [updatedUser] = await db.select()
    .from(users)
    .where(sql`id = ${user.id}`);

  return { user: updatedUser, spa };
}

export async function createTestStaff(spaId: number, name: string, email: string) {
  const [staffMember] = await db.insert(staff).values({
    spaId,
    name,
    email,
    phone: "+971501234567",
    role: "basic",
  }).returning();

  return staffMember;
}

export async function createTestService(spaId: number, name: string, price: string) {
  const [service] = await db.insert(services).values({
    spaId,
    name,
    description: `Test service ${name}`,
    duration: 60,
    price,
  }).returning();

  return service;
}

export async function createTestCustomer(spaId: number, name: string, email: string) {
  const [customer] = await db.insert(customers).values({
    name,
    email,
    phone: "+971501234567",
  }).returning();

  return customer;
}

export async function createTestBooking(
  spaId: number,
  staffId: number,
  serviceId: number,
  customerId: number,
  date: string,
  totalAmount: string,
  status: string = "confirmed"
) {
  const bookingTimestamp = new Date(`${date}T10:00:00Z`);
  
  const [booking] = await db.insert(bookings).values({
    spaId,
    customerId,
    staffId,
    bookingDate: bookingTimestamp,
    status,
    totalAmount,
  }).returning();

  await db.insert(bookingItems).values({
    bookingId: booking.id,
    serviceId,
    staffId,
    price: totalAmount,
    duration: 60,
  });

  return booking;
}

// Test authentication middleware
export function createTestAuthMiddleware(userId: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Mock Replit Auth user object
    (req as any).user = {
      claims: {
        sub: userId,
      },
    };
    next();
  };
}
