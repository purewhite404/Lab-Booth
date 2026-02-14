function sendValidationError(res, message) {
  return res.status(400).json({ error: message });
}

export function validatePurchase(req, res, next) {
  const body = req.body || {};
  const { memberId, productIds } = body;

  if (memberId === undefined || memberId === null || memberId === "") {
    return sendValidationError(res, "memberId が必要です");
  }

  if (!Array.isArray(productIds)) {
    return sendValidationError(res, "productIds は配列である必要があります");
  }

  if (productIds.length === 0) {
    return sendValidationError(res, "productIds は空にできません");
  }

  return next();
}

export function validateRestockQuantity(req, res, next) {
  if (req.params?.table !== "restock_history") {
    return next();
  }

  const body = req.body || {};
  const { quantity } = body;
  const qty = Number(quantity);

  if (quantity === undefined || quantity === null || quantity === "") {
    return sendValidationError(res, "quantity が必要です");
  }

  if (!Number.isFinite(qty)) {
    return sendValidationError(res, "quantity は数値である必要があります");
  }

  if (qty < 0) {
    return sendValidationError(res, "quantity は負の値にできません");
  }

  return next();
}

export function validateLogin(req, res, next) {
  const body = req.body || {};
  const password = body.password;

  if (typeof password !== "string" || password.trim().length === 0) {
    return sendValidationError(res, "password が空です");
  }

  return next();
}
