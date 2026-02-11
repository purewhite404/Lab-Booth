import db from "../db/init.js";
import { PurchaseDeduplicator } from "../utils/dedup.js";
import { processPurchase } from "../services/purchaseService.js";
import { replaceProductImage } from "../services/imageService.js";
import { uploadDir } from "../config/multer.js";

const purchaseDedup = new PurchaseDeduplicator();

export function getMembers(_req, res) {
  try {
    const members = db.prepare("SELECT * FROM members").all();
    res.json({ members });
  } catch {
    res.status(500).json({ error: "メンバー取得に失敗しました" });
  }
}

export function getProducts(_req, res) {
  try {
    const products = db.prepare("SELECT * FROM products").all();
    res.json({ products });
  } catch {
    res.status(500).json({ error: "商品取得に失敗しました" });
  }
}

export async function purchase(req, res) {
  try {
    const { memberId, productIds } = req.body;
    const result = await processPurchase({
      db,
      purchaseDedup,
      memberId,
      productIds,
    });
    res.json(result);
  } catch (e) {
    console.error(e);
    const status = e.statusCode ?? 500;
    const message = e.message ?? "購入処理に失敗しました";
    res.status(status).json({ error: message });
  }
}

export async function uploadProductImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "画像がありません" });
    const id = Number(req.params.id);
    const product = await replaceProductImage({
      db,
      uploadDir,
      productId: id,
      tempPath: req.file.path,
    });

    res.json({ product });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "画像アップロードに失敗しました" });
  }
}
