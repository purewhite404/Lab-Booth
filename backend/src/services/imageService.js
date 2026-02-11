import fs from "fs";
import path from "path";
import sharp from "sharp";

export async function replaceProductImage({
  db,
  uploadDir,
  productId,
  tempPath,
}) {
  const cur = db.prepare("SELECT image FROM products WHERE id = ?").get(productId);
  if (cur && cur.image) {
    const oldName = path.basename(cur.image);
    const oldPath = path.join(uploadDir, oldName);
    try {
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch (e) {
      console.error("旧画像の削除に失敗:", e.message);
    }
  }

  const filename = `product_${productId}_${Date.now()}.jpg`;
  const outPath = path.join(uploadDir, filename);

  await sharp(tempPath)
    .resize({ width: 600, height: 600, fit: "inside" })
    .jpeg({ quality: 70 })
    .toFile(outPath);

  fs.unlinkSync(tempPath);

  const publicPath = `/api/uploads/${filename}`;
  db.prepare("UPDATE products SET image = ? WHERE id = ?").run(
    publicPath,
    productId
  );

  return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
}
