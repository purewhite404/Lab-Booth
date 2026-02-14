import fs from "fs";
import path from "path";
import multer from "multer";

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) =>
    cb(
      null,
      `product_${req.params.id || "upload"}_${Date.now()}${path.extname(
        file.originalname
      )}`
    ),
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

export { upload, uploadDir };
