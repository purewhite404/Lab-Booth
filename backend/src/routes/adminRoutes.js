import { Router } from "express";
import adminAuth from "../adminAuth.js";
import {
  getRestockSuggestions,
  getInvoiceSummary,
  getTableColumns,
  getTableRows,
  createTableRow,
  updateTableRow,
  deleteTableRow,
  importRestock,
} from "../controllers/adminController.js";

const router = Router();

router.use("/api/admin", adminAuth);

router.get("/api/admin/restock-suggestions", getRestockSuggestions);
router.get("/api/admin/invoice-summary", getInvoiceSummary);
router.get("/api/admin/:table/columns", getTableColumns);
router.get("/api/admin/:table", getTableRows);
router.post("/api/admin/:table", createTableRow);
router.put("/api/admin/:table/:id", updateTableRow);
router.delete("/api/admin/:table/:id", deleteTableRow);
router.post("/api/admin/restock/import", importRestock);

export default router;
