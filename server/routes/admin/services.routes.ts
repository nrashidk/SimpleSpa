/**
 * Admin Services Routes - ILLUSTRATIVE PATTERN ONLY
 * 
 * This file demonstrates how to extract routes from the monolithic routes.ts.
 * NOT YET MOUNTED in production - serves as a reference implementation.
 * 
 * TODO before mounting:
 * - Add PUT /services/:id and DELETE /services/:id handlers
 * - Move shared utilities to server/routes/utils.ts
 * - Add integration tests
 */
import { Router } from "express";
import { storage } from "../../storage";
import { logger } from "../../logger";
import { isAdmin, injectAdminSpa, ensureSetupComplete } from "../../firebaseAuth";
import { insertServiceCategorySchema, insertServiceSchema } from "@shared/schema";
import { AuditLogger } from "../../auditLog";

const router = Router();

function parseNumericId(param: string): number | null {
  const id = parseInt(param, 10);
  return isNaN(id) ? null : id;
}

function handleRouteError(res: any, error: any, defaultMessage: string) {
  if (error instanceof Error && error.name === 'ZodError') {
    return res.status(400).json({ message: "Validation error", errors: (error as any).errors });
  }
  logger.error(defaultMessage, { error: error instanceof Error ? error.message : 'Unknown' });
  res.status(500).json({ message: defaultMessage });
}

router.get("/service-categories", isAdmin, injectAdminSpa, async (req: any, res) => {
  try {
    const categories = await storage.getServiceCategoriesBySpaId(req.adminSpa.id);
    res.json(categories);
  } catch (error) {
    logger.error("Error fetching service categories", { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ message: "Failed to fetch service categories" });
  }
});

router.post("/service-categories", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
  try {
    const validatedData = insertServiceCategorySchema.parse({
      ...req.body,
      spaId: req.adminSpa.id,
    });
    const category = await storage.createServiceCategory(validatedData);
    res.json(category);
  } catch (error) {
    logger.error("Error creating service category", { error: error instanceof Error ? error.message : 'Unknown' });
    handleRouteError(res, error, "Failed to create service category");
  }
});

router.put("/service-categories/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
  try {
    const id = parseNumericId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid category ID" });
    }
    
    const validatedData = insertServiceCategorySchema.partial().parse(req.body);
    const category = await storage.updateServiceCategory(id, validatedData);
    if (!category) {
      return res.status(404).json({ message: "Service category not found" });
    }
    res.json(category);
  } catch (error) {
    handleRouteError(res, error, "Failed to update service category");
  }
});

router.delete("/service-categories/:id", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
  try {
    const id = parseNumericId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid category ID" });
    }
    
    const deleted = await storage.deleteServiceCategory(id);
    if (!deleted) {
      return res.status(404).json({ message: "Service category not found" });
    }
    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, "Failed to delete service category");
  }
});

router.get("/services", isAdmin, injectAdminSpa, async (req: any, res) => {
  try {
    const services = await storage.getServicesBySpaId(req.adminSpa.id);
    res.json(services);
  } catch (error) {
    logger.error("Error fetching services", { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ message: "Failed to fetch services" });
  }
});

router.post("/services", isAdmin, injectAdminSpa, ensureSetupComplete, async (req: any, res) => {
  try {
    const validatedData = insertServiceSchema.parse({
      ...req.body,
      spaId: req.adminSpa.id,
    });
    const service = await storage.createService(validatedData);
    
    await AuditLogger.logCreate(req, "service", service.id, validatedData, validatedData.spaId);
    
    res.json(service);
  } catch (error) {
    logger.error("Error creating service", { error: error instanceof Error ? error.message : 'Unknown' });
    handleRouteError(res, error, "Failed to create service");
  }
});

export { router as adminServicesRouter };
