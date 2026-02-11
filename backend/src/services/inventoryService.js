import { jstMinusDays } from "../utils/time.js";

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function getRestockSuggestions({ db, query }) {
  try {
    const days = Number(query.days ?? 30);
    const days7 = 7;
    const limit = Math.min(Number(query.limit ?? 100), 500);
    const targetDays = Number(query.targetDays ?? 14);
    const safetyDays = Number(query.safetyDays ?? 3);
    const minSold = Number(query.minSold ?? 1);
    const includeZeroVelocityWhenOOS = String(query.includeOOS ?? "false") === "true";

    const since7 = jstMinusDays(days7);
    const sinceN = jstMinusDays(days);

    const rows = db
      .prepare(
        `
        SELECT
          pr.id,
          pr.name,
          pr.barcode,
          pr.price,
          pr.stock,
          SUM(CASE WHEN p.timestamp >= ? THEN 1 ELSE 0 END) AS sold_7d,
          SUM(CASE WHEN p.timestamp >= ? THEN 1 ELSE 0 END) AS sold_nd,
          COALESCE(MAX(p.timestamp), '') AS last_sold_at
        FROM products pr
        LEFT JOIN purchases p ON p.product_id = pr.id
        GROUP BY pr.id
        `
      )
      .all(since7, sinceN);

    const suggestions = rows
      .map((r) => {
        const sold7 = Number(r.sold_7d || 0);
        const soldN = Number(r.sold_nd || 0);
        const avg7d = sold7 / days7;
        const avgNd = soldN / Math.max(days, 1);
        const isTrending = avg7d > avgNd;
        const stock = Number(r.stock || 0);
        const isOOS = stock <= 0;
        const velocity = isTrending ? avg7d : avgNd;
        const daysOfSupply = velocity > 0 ? stock / velocity : isOOS ? 0 : 9999;
        const targetQtyFloat = velocity * (targetDays + safetyDays) - stock;
        let suggestedQty = Math.ceil(Math.max(0, targetQtyFloat));
        if (isOOS && velocity === 0 && includeZeroVelocityWhenOOS) {
          suggestedQty = Math.max(suggestedQty, 1);
        }

        let reason = "";
        if (isOOS) reason = "在庫切れ";
        else if (velocity > 0 && daysOfSupply < targetDays)
          reason = `在庫が${Math.ceil(daysOfSupply)}日分しかない`;
        else if (isTrending) reason = "最近よく売れている";

        return {
          id: r.id,
          name: r.name,
          barcode: r.barcode,
          price: r.price,
          stock,
          sold_7d: sold7,
          sold_nd: soldN,
          window_days: days,
          velocity_per_day: Number(velocity.toFixed(3)),
          days_of_supply: Number(
            daysOfSupply === 9999 ? 9999 : daysOfSupply.toFixed(1)
          ),
          last_sold_at: r.last_sold_at,
          suggested_qty: suggestedQty,
          reason,
        };
      })
      .filter((r) => {
        if (r.suggested_qty <= 0) return false;
        if (r.sold_nd >= minSold) return true;
        if (includeZeroVelocityWhenOOS && r.stock <= 0) return true;
        return false;
      })
      .sort((a, b) => b.suggested_qty - a.suggested_qty)
      .slice(0, limit);

    return {
      suggestions,
      meta: { days, targetDays, safetyDays, minSold, limit },
    };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(500, "候補の計算に失敗しました");
  }
}
