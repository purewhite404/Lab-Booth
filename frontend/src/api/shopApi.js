import client from "./client";

export async function fetchMembers() {
  try {
    const { data } = await client.get("/members");
    return data.members;
  } catch {
    throw new Error("メンバー取得に失敗しました");
  }
}

export async function fetchProducts() {
  try {
    const { data } = await client.get("/products");
    return data.products;
  } catch {
    throw new Error("商品取得に失敗しました");
  }
}

export async function postPurchase({ memberId, productIds }) {
  try {
    const { data } = await client.post("/purchase", { memberId, productIds });
    return data;
  } catch {
    throw new Error("購入処理に失敗しました");
  }
}

export async function uploadProductImage(productId, file) {
  try {
    const form = new FormData();
    form.append("image", file);
    const { data } = await client.post(`/products/${productId}/image`, form);
    return data.product;
  } catch {
    throw new Error("画像アップロードに失敗しました");
  }
}
