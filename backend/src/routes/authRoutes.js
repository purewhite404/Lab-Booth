import { Router } from "express";
import { login } from "../controllers/authController.js";
import { validateLogin } from "../middlewares/validators.js";

const router = Router();

router.post("/api/login", validateLogin, login);

export default router;
