import express from "express";
import dotenv from "dotenv";
import { uploadDir } from "./config/multer.js";
import authRoutes from "./routes/authRoutes.js";
import shopRoutes from "./routes/shopRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());

app.use("/api/uploads", express.static(uploadDir));

app.use(authRoutes);
app.use(shopRoutes);
app.use(adminRoutes);

app.use((err, _req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "画像が大きすぎます（最大10MB）" });
  }
  next(err);
});

export default app;
