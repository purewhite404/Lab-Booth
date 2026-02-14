import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMembers, postPurchase } from "../api/shopApi";
import useBarcodeScanner from "./useBarcodeScanner";
import useSoundEffects from "./useSoundEffects";

export default function useCart({ products, adjustStock, replaceProducts }) {
  const [members, setMembers] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState(null);
  const [isLoadingMembers, setLoadingMembers] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const isMounted = useRef(true);

  const { play } = useSoundEffects();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const ms = await fetchMembers();
        setMembers(ms);
      } catch (err) {
        console.error(err);
        setToast({ msg: "メンバー取得に失敗しました😢", type: "error" });
      } finally {
        setLoadingMembers(false);
      }
    })();
  }, []);

  const addProduct = useCallback(
    (product, playSound = true) => {
      if (playSound) play("addProduct");
      setCart((c) => [...c, product]);
      adjustStock?.(product.id, -1);
      setToast({ msg: `${product.name} を追加しました😊`, type: "success" });
    },
    [adjustStock, play]
  );

  const removeProduct = useCallback(
    (index) => {
      setCart((c) => {
        const removed = c[index];
        if (removed) adjustStock?.(removed.id, 1);
        return c.filter((_, i) => i !== index);
      });
    },
    [adjustStock]
  );

  const totalPrice = useMemo(
    () => cart.reduce((sum, item) => sum + item.price, 0),
    [cart]
  );

  const handleConfirm = useCallback(async () => {
    if (!currentMember) {
      setToast({ msg: "名前を選択してください", type: "info" });
      return;
    }
    if (cart.length === 0) {
      setToast({ msg: "まず商品を追加してください", type: "info" });
      return;
    }
    if (isConfirming) return;

    try {
      setIsConfirming(true);
      const { members: ms, products: ps } = await postPurchase({
        memberId: currentMember.id,
        productIds: cart.map((p) => p.id),
      });
      play("confirm");
      setMembers(ms);
      replaceProducts?.(ps);
      setCart([]);
      setCurrentMember(null);
      setToast({ msg: "購入が完了しました🎉", type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ msg: "購入処理に失敗しました😢", type: "error" });
    } finally {
      if (isMounted.current) {
        setIsConfirming(false);
      }
    }
  }, [cart, currentMember, isConfirming, play, replaceProducts]);

  const handleScan = useCallback(
    (code) => {
      const product = products?.find((p) => p.barcode === code);
      if (!product) {
        play("scanError");
        setToast({ msg: "登録されていない商品です😢", type: "error" });
        return;
      }
      play("scanSuccess");
      addProduct(product, false);
    },
    [addProduct, play, products]
  );

  useBarcodeScanner(handleScan);

  const clearToast = useCallback(() => setToast(null), []);

  return {
    members,
    currentMember,
    setCurrentMember,
    cart,
    addProduct,
    removeProduct,
    totalPrice,
    handleConfirm,
    isConfirming,
    isLoadingMembers,
    toast,
    clearToast,
  };
}
