import { nowJST } from "../utils/time.js";

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function processPurchase({
  db,
  purchaseDedup,
  memberId,
  productIds,
}) {
  let dedupKey;

  try {
    const ts = nowJST();

    const getMember = db.prepare("SELECT name FROM members WHERE id = ?");
    const getProduct = db.prepare("SELECT name FROM products WHERE id = ?");

    const memberRow = getMember.get(memberId);
    if (!memberRow) {
      throw new HttpError(400, "不正な memberId です");
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new HttpError(400, "productIds が不正です");
    }
    for (const pid of productIds) {
      const prodRow = getProduct.get(pid);
      if (!prodRow) {
        throw new HttpError(400, "不正な productId が含まれています");
      }
    }

    dedupKey = purchaseDedup.makeKey(memberId, productIds);
    const now = Date.now();
    if (purchaseDedup.isDuplicate(dedupKey, now)) {
      throw new HttpError(
        409,
        "同一内容の購入リクエストが短時間に連続しています"
      );
    }
    purchaseDedup.mark(dedupKey, now);

    const insertPurchase = db.prepare(`
      INSERT INTO purchases
        (member_id, member_name, product_id, product_name, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    const updateStock = db.prepare(`
      UPDATE products
      SET stock = CASE WHEN stock > 0 THEN stock - 1 ELSE 0 END
      WHERE id = ?
    `);

    db.transaction(() => {
      productIds.forEach((pid) => {
        const prodRow = getProduct.get(pid);
        insertPurchase.run(memberId, memberRow.name, pid, prodRow.name, ts);
        updateStock.run(pid);
      });
      db.prepare("UPDATE products SET stock = 0 WHERE stock < 0").run();
    })();

    return {
      members: db.prepare("SELECT * FROM members").all(),
      products: db.prepare("SELECT * FROM products").all(),
    };
  } catch (e) {
    if (dedupKey) purchaseDedup.release(dedupKey);
    if (e instanceof HttpError) throw e;
    throw new HttpError(500, "購入処理に失敗しました");
  }
}
