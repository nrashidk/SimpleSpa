import { Router } from "express";
import { adminServicesRouter } from "./admin/services.routes";

const router = Router();

router.use("/admin", adminServicesRouter);

export { router as modularRoutes };
