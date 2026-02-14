// frontend/src/pages/Shop.jsx
import useCart from "../hooks/useCart";
import useProducts from "../hooks/useProducts";
import NameSelector from "../components/features/shop/NameSelector";
import ProductList from "../components/features/shop/ProductList";
import CartList from "../components/features/shop/CartList";
import Toast from "../components/ui/Toast";
import TopBar from "../components/features/layout/TopBar";

export default function Shop() {
  const {
    products,
    isLoading: isProductsLoading,
    adjustStock,
    replaceProducts,
    handleImageUpload,
    toast: productToast,
    clearToast: clearProductToast,
  } = useProducts();

  const {
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
    toast: cartToast,
    clearToast: clearCartToast,
  } = useCart({ products, adjustStock, replaceProducts });

  const toast = cartToast || productToast;
  const clearToast = () => {
    if (cartToast) {
      clearCartToast();
    } else {
      clearProductToast();
    }
  };

  /* ---------- ローディング ---------- */
  if (isProductsLoading || isLoadingMembers)
    return (
      <div className="h-screen flex items-center justify-center text-xl">
        読み込み中…
      </div>
    );

  /* ---------- 画面描画 ---------- */
  return (
    <>
      <TopBar />
      <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col gap-16 pb-40">
        <h1
          className="text-5xl md:text-6xl font-extrabold text-center tracking-wider
                     bg-clip-text text-transparent bg-gradient-to-r
                     from-indigo-400 via-purple-400 to-pink-400"
        >
          Lab Booth
        </h1>

        {/* 名前選択 */}
        <div className="flex justify-center">
          <NameSelector
            members={members}
            currentMember={currentMember}
            setCurrentMember={setCurrentMember}
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-12">
          <ProductList
            products={products}
            onAdd={addProduct}          
            onImageUpload={handleImageUpload}
          />
          <CartList
            cart={cart}
            total={totalPrice}
            onRemove={removeProduct}
            onConfirm={handleConfirm}
            isConfirming={isConfirming}
          />
        </div>

        {toast && (
          <Toast
            message={toast.msg}
            type={toast.type}
            onClose={clearToast}
          />
        )}
      </div>
    </>
  );
}
