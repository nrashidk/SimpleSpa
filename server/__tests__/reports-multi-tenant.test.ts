import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { db } from "../db";
import { registerRoutes } from "../routes";
import {
  cleanupTestData,
  createTestSpa,
  createTestStaff,
  createTestService,
  createTestCustomer,
  createTestBooking,
} from "./setup";

const app = express();
app.use(express.json());
app.use(
  session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

let spaA: { user: any; spa: any };
let spaB: { user: any; spa: any };

const testDate = "2025-01-15";

describe("Multi-Tenant Report Data Isolation", () => {
  beforeAll(async () => {
    await registerRoutes(app);
    await cleanupTestData();

    // Create two separate spas with data
    spaA = await createTestSpa("Test Spa A", "admin-a@test.com");
    spaB = await createTestSpa("Test Spa B", "admin-b@test.com");

    // Create staff for each spa
    const staffA = await createTestStaff(spaA.spa.id, "Staff A", "staff-a@test-spa-a.com");
    const staffB = await createTestStaff(spaB.spa.id, "Staff B", "staff-b@test-spa-b.com");

    // Create services for each spa
    const serviceA = await createTestService(spaA.spa.id, "Massage A", "500.00");
    const serviceB = await createTestService(spaB.spa.id, "Massage B", "600.00");

    // Create customers for each spa
    const customerA = await createTestCustomer(spaA.spa.id, "Customer A", "customer-a@test.com");
    const customerB = await createTestCustomer(spaB.spa.id, "Customer B", "customer-b@test.com");

    // Create bookings for each spa
    await createTestBooking(
      spaA.spa.id,
      staffA.id,
      serviceA.id,
      customerA.id,
      testDate,
      "500.00",
      "confirmed"
    );

    await createTestBooking(
      spaB.spa.id,
      staffB.id,
      serviceB.id,
      customerB.id,
      testDate,
      "600.00",
      "confirmed"
    );
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  async function authenticateAs(user: any) {
    const agent = request.agent(app);
    
    await agent
      .post("/api/auth/login")
      .send({
        email: user.email,
        password: "TestPassword123!",
      });

    return agent;
  }

  describe("Appointments Summary Report", () => {
    it("should only return Spa A appointments for Spa A admin", async () => {
      const agent = await authenticateAs(spaA.user);
      
      const response = await agent
        .get("/api/admin/reports/appointments-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.summary).toBeDefined();
      expect(response.body.summary.appointmentsCount).toBe(1);
    });

    it("should only return Spa B appointments for Spa B admin", async () => {
      const agent = await authenticateAs(spaB.user);
      
      const response = await agent
        .get("/api/admin/reports/appointments-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.summary).toBeDefined();
      expect(response.body.summary.appointmentsCount).toBe(1);
    });

    it("should not leak data between spas", async () => {
      const agentA = await authenticateAs(spaA.user);
      const agentB = await authenticateAs(spaB.user);

      const responseA = await agentA
        .get("/api/admin/reports/appointments-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      const responseB = await agentB
        .get("/api/admin/reports/appointments-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      // Both should have data but different counts based on their own bookings
      expect(responseA.body.summary.appointmentsCount).toBe(1);
      expect(responseB.body.summary.appointmentsCount).toBe(1);
      
      // They should see different total values
      expect(responseA.body.summary.totalAppointmentValue).not.toBe(
        responseB.body.summary.totalAppointmentValue
      );
    });
  });

  describe("Finance Summary Report", () => {
    it("should only return Spa A data for Spa A admin", async () => {
      const agent = await authenticateAs(spaA.user);
      
      const response = await agent
        .get("/api/admin/reports/finance-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.summary).toBeDefined();
      
      // Verify data is present but limited to realistic Spa A values
      const grossSales = parseFloat(response.body.summary.grossSales || "0");
      expect(grossSales).toBeGreaterThan(0);
      expect(grossSales).toBeLessThanOrEqual(500); // Spa A has single 500 AED booking
    });

    it("should only return Spa B data for Spa B admin", async () => {
      const agent = await authenticateAs(spaB.user);
      
      const response = await agent
        .get("/api/admin/reports/finance-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.summary).toBeDefined();
      
      // Verify data is present but limited to realistic Spa B values
      const grossSales = parseFloat(response.body.summary.grossSales || "0");
      expect(grossSales).toBeGreaterThan(0);
      expect(grossSales).toBeLessThanOrEqual(600); // Spa B has single 600 AED booking
    });

    it("should show different financial data for different spas", async () => {
      const agentA = await authenticateAs(spaA.user);
      const agentB = await authenticateAs(spaB.user);

      const responseA = await agentA
        .get("/api/admin/reports/finance-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      const responseB = await agentB
        .get("/api/admin/reports/finance-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      const salesA = parseFloat(responseA.body.summary.grossSales || "0");
      const salesB = parseFloat(responseB.body.summary.grossSales || "0");

      // Both spas should have data
      expect(salesA).toBeGreaterThan(0);
      expect(salesB).toBeGreaterThan(0);
      
      // But they should be different (500 vs 600)
      expect(salesA).not.toBe(salesB);
      
      // Verify neither sees aggregated total (1100)
      expect(salesA).toBeLessThan(1100);
      expect(salesB).toBeLessThan(1100);
    });
  });

  describe("Sales Summary Report", () => {
    it("should only return Spa A data for Spa A admin", async () => {
      const agent = await authenticateAs(spaA.user);
      
      const response = await agent
        .get("/api/admin/reports/sales-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.salesByType).toBeDefined();
      expect(Array.isArray(response.body.salesByType)).toBe(true);
      
      // Calculate total sales across all types
      const totalSales = response.body.salesByType.reduce(
        (sum: number, item: any) => sum + parseFloat(item.netSales || "0"),
        0
      );
      
      // Should have sales from Spa A's booking only (≤500)
      expect(totalSales).toBeGreaterThan(0);
      expect(totalSales).toBeLessThanOrEqual(500);
    });

    it("should only return Spa B data for Spa B admin", async () => {
      const agent = await authenticateAs(spaB.user);
      
      const response = await agent
        .get("/api/admin/reports/sales-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.salesByType).toBeDefined();
      expect(Array.isArray(response.body.salesByType)).toBe(true);
      
      // Calculate total sales across all types
      const totalSales = response.body.salesByType.reduce(
        (sum: number, item: any) => sum + parseFloat(item.netSales || "0"),
        0
      );
      
      // Should have sales from Spa B's booking only (≤600)
      expect(totalSales).toBeGreaterThan(0);
      expect(totalSales).toBeLessThanOrEqual(600);
    });

    it("should show different sales data for different spas", async () => {
      const agentA = await authenticateAs(spaA.user);
      const agentB = await authenticateAs(spaB.user);

      const responseA = await agentA
        .get("/api/admin/reports/sales-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      const responseB = await agentB
        .get("/api/admin/reports/sales-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      const totalA = responseA.body.salesByType.reduce(
        (sum: number, item: any) => sum + parseFloat(item.netSales || "0"),
        0
      );
      const totalB = responseB.body.salesByType.reduce(
        (sum: number, item: any) => sum + parseFloat(item.netSales || "0"),
        0
      );

      // Both should have data but different totals
      expect(totalA).toBeGreaterThan(0);
      expect(totalB).toBeGreaterThan(0);
      expect(totalA).not.toBe(totalB);
      
      // Neither should see combined total
      expect(totalA + totalB).toBeLessThanOrEqual(1100);
    });
  });

  describe("Sales List Report", () => {
    it("should only return Spa A sales for Spa A admin", async () => {
      const agent = await authenticateAs(spaA.user);
      
      const response = await agent
        .get("/api/admin/reports/sales-list")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.sales).toBeDefined();
      
      // If there are sales, verify they're all from Spa A
      if (response.body.sales.length > 0) {
        response.body.sales.forEach((sale: any) => {
          expect(sale.spaId).toBe(spaA.spa.id);
        });
      }
    });

    it("should only return Spa B sales for Spa B admin", async () => {
      const agent = await authenticateAs(spaB.user);
      
      const response = await agent
        .get("/api/admin/reports/sales-list")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.sales).toBeDefined();
      
      // If there are sales, verify they're all from Spa B
      if (response.body.sales.length > 0) {
        response.body.sales.forEach((sale: any) => {
          expect(sale.spaId).toBe(spaB.spa.id);
        });
      }
    });
  });

  describe("Payment Summary Report", () => {
    it("should only return Spa A payments for Spa A admin", async () => {
      const agent = await authenticateAs(spaA.user);
      
      const response = await agent
        .get("/api/admin/reports/payment-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.paymentsByMethod).toBeDefined();
      expect(Array.isArray(response.body.paymentsByMethod)).toBe(true);
      
      // Calculate total payments
      const totalPayments = response.body.paymentsByMethod.reduce(
        (sum: number, method: any) => sum + parseFloat(method.netPayments || "0"),
        0
      );
      
      // Should have payments from Spa A only (≤500)
      expect(totalPayments).toBeGreaterThan(0);
      expect(totalPayments).toBeLessThanOrEqual(500);
    });

    it("should only return Spa B payments for Spa B admin", async () => {
      const agent = await authenticateAs(spaB.user);
      
      const response = await agent
        .get("/api/admin/reports/payment-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(response.status).toBe(200);
      expect(response.body.paymentsByMethod).toBeDefined();
      expect(Array.isArray(response.body.paymentsByMethod)).toBe(true);
      
      // Calculate total payments
      const totalPayments = response.body.paymentsByMethod.reduce(
        (sum: number, method: any) => sum + parseFloat(method.netPayments || "0"),
        0
      );
      
      // Should have payments from Spa B only (≤600)
      expect(totalPayments).toBeGreaterThan(0);
      expect(totalPayments).toBeLessThanOrEqual(600);
    });

    it("should show different payment totals for different spas", async () => {
      const agentA = await authenticateAs(spaA.user);
      const agentB = await authenticateAs(spaB.user);

      const responseA = await agentA
        .get("/api/admin/reports/payment-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      const responseB = await agentB
        .get("/api/admin/reports/payment-summary")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      const totalA = responseA.body.paymentsByMethod.reduce(
        (sum: number, method: any) => sum + parseFloat(method.netPayments || "0"),
        0
      );
      const totalB = responseB.body.paymentsByMethod.reduce(
        (sum: number, method: any) => sum + parseFloat(method.netPayments || "0"),
        0
      );

      // Both should have payments but different totals
      expect(totalA).toBeGreaterThan(0);
      expect(totalB).toBeGreaterThan(0);
      expect(totalA).not.toBe(totalB);
      
      // Neither should see aggregated payments from both spas
      expect(totalA).toBeLessThan(1100);
      expect(totalB).toBeLessThan(1100);
    });
  });

  describe("Unauthenticated Access", () => {
    it("should reject requests without authentication", async () => {
      const endpoints = [
        "/api/admin/reports/finance-summary",
        "/api/admin/reports/sales-summary",
        "/api/admin/reports/sales-list",
        "/api/admin/reports/appointments-summary",
        "/api/admin/reports/payment-summary",
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

        expect(response.status).toBe(401);
      }
    });
  });

  describe("Cross-Tenant Access Prevention", () => {
    it("should prevent accessing another spa's services", async () => {
      const agent = await authenticateAs(spaA.user);
      
      // Try to access all services - should only get Spa A services
      const response = await agent.get("/api/admin/services");
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // All services should belong to Spa A
      response.body.forEach((service: any) => {
        expect(service.spaId).toBe(spaA.spa.id);
      });
    });

    it("should prevent accessing another spa's staff", async () => {
      const agent = await authenticateAs(spaB.user);
      
      // Try to access all staff - should only get Spa B staff
      const response = await agent.get("/api/admin/staff");
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // All staff should belong to Spa B
      response.body.forEach((member: any) => {
        expect(member.spaId).toBe(spaB.spa.id);
      });
    });

    it("should prevent accessing another spa's bookings", async () => {
      const agent = await authenticateAs(spaA.user);
      
      // Try to access all bookings - should only get Spa A bookings
      const response = await agent
        .get("/api/admin/bookings")
        .query({ startDate: testDate, endDate: testDate });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      // All bookings should belong to Spa A
      response.body.forEach((booking: any) => {
        expect(booking.spaId).toBe(spaA.spa.id);
      });
    });
  });
});
