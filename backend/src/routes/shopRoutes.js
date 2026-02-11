import { Router } from "express";
import {
  getMembers,
  getProducts,
  purchase,
  uploadProductImage,
} from "../controllers/shopController.js";
import { upload } from "../config/multer.js";
import { validatePurchase } from "../middlewares/validators.js";

const router = Router();

router.get("/api/members", getMembers);
router.get("/api/products", getProducts);
router.post("/api/purchase", validatePurchase, purchase);
router.post("/api/products/:id/image", upload.single("image"), uploadProductImage);

export default router;
