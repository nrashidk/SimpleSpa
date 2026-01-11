/**
 * Modular Routes Architecture - ILLUSTRATIVE PATTERN ONLY
 * 
 * This file demonstrates the target architecture for incremental route modularization.
 * The modularRoutes export is NOT YET MOUNTED in the main app.
 * 
 * Migration Plan:
 * 1. Extract routes from server/routes.ts into domain-specific files (e.g., services.routes.ts)
 * 2. Centralize shared utilities (parseNumericId, handleRouteError) into server/routes/utils.ts
 * 3. Test each extracted router independently
 * 4. Mount modularRoutes in server/index.ts once all routes are migrated
 * 5. Remove legacy routes from server/routes.ts
 * 
 * Post-launch backlog item - estimated 20-40 hours for full migration.
 */
import { Router } from "express";
import { adminServicesRouter } from "./admin/services.routes";

const router = Router();

router.use("/admin", adminServicesRouter);

export { router as modularRoutes };
