import { useCallback, useEffect, useState } from "react";
import { fetchProducts } from "../api/shopApi";

export default function useProducts() {
  const [products, setProducts] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const clearToast = useCallback(() => setToast(null), []);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const ps = await fetchProducts();
      setProducts(ps);
    } catch (err) {
      console.error(err);
      setToast({ msg: "商品一覧の取得に失敗しました😢", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const adjustStock = useCallback((productId, delta) => {
    setProducts((ps) =>
      ps.map((p) =>
        p.id === productId ? { ...p, stock: p.stock + delta } : p
      )
    );
  }, []);

  const replaceProduct = useCallback((updated) => {
    setProducts((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const replaceProducts = useCallback((nextProducts) => {
    setProducts(nextProducts || []);
  }, []);

  const handleImageUpload = useCallback(
    (updated) => {
      replaceProduct(updated);
      setToast({ msg: "画像を更新しました🖼️", type: "success" });
    },
    [replaceProduct]
  );

  return {
    products,
    isLoading,
    loadProducts,
    adjustStock,
    replaceProducts,
    handleImageUpload,
    toast,
    clearToast,
  };
}
