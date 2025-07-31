import fs from "fs";
import path from "path";
import sharp from "sharp";
import db from "../src/db/init.js"; // DB初期化のパスは環境に合わせて調整

const uploadDir = path.resolve("uploads");

async function processImage(imagePath) {
  const fullPath = path.join(uploadDir, path.basename(imagePath));
  if (!fs.existsSync(fullPath)) return;

  try {
    const image = sharp(fullPath);
    const meta = await image.metadata();
    if (meta.width > 600 || meta.height > 600 || meta.format !== "jpeg" || (meta.quality && meta.quality > 70)) {
      const tmpPath = fullPath + ".tmp";
      await image
        .resize({ width: 600, height: 600, fit: "inside" })
        .jpeg({ quality: 70 })
        .toFile(tmpPath);
      fs.renameSync(tmpPath, fullPath);
      console.log(`Resized: ${fullPath}`);
    }
  } catch (e) {
    console.error(`Failed to process ${fullPath}:`, e.message);
  }
}

async function main() {
  const products = db.prepare("SELECT id, image FROM products WHERE image IS NOT NULL AND image != ''").all();
  for (const prod of products) {
    const imagePath = prod.image.replace(/^\/api\/uploads\//, "");
    await processImage(imagePath);
  }
  console.log("Done.");
}

main();