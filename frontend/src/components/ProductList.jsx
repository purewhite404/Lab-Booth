// src/components/ProductList.jsx
import { useState, useMemo } from "react";
import ProductCard from "./ProductCard";
import genreKeywords from "../assets/genreRules.json"

/* --- ルールベースのジャンル分類関数 --- */
// src/utils/classifyGenre.js に移行しても良い
function classifyGenre(name) {
  const n = name.toLowerCase();
  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    if (keywords.some((k) => n.includes(k.toLowerCase()))) {
      return genre;
    }
  }

  return "その他";
}

export default function ProductList({ products, onAdd, onImageUpload }) {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState("name"); // 'name' or 'genre'
  const [selectedGenre, setSelectedGenre] = useState("");

  const genreList = ["スナック", "チョコ", "アイス", "インスタント麺", "冷凍食品", "飲料", "一口小物", "その他"];

  /* --- フィルタリング --- */
  const filtered = useMemo(() => {
    if (searchMode === "name") {
      return products.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase())
      );
    } else {
      return products.filter((p) => classifyGenre(p.name) === selectedGenre);
    }
  }, [query, selectedGenre, searchMode, products]);

  return (
    <div className="flex flex-col w-full lg:w-2/3 min-h-0">
      {/* ── 検索バー + モード切り替え ────────────── */}
      <div
        className="sticky top-0 z-10 pb-4 bg-gradient-to-b
                    from-gray-900/90 to-transparent backdrop-blur-sm"
      >
        <div className="flex items-center space-x-2 mb-2">
          <button
            onClick={() => {
              setSearchMode("name");
              setSelectedGenre("");
              setQuery("");
            }}
            className={`min-w-[8rem] px-6 py-4 rounded-full flex grid gap-4 text-sm font-semibold ${
              searchMode === "name"
                ? "bg-indigo-600 text-white"
                : "bg-gray-700 text-gray-300"
            }`}
          >
            商品名で検索
          </button>
          <button
            onClick={() => {
              setSearchMode("genre");
              setQuery("");
            }}
            className={`min-w-[8rem] px-6 py-4 rounded-full flex grid gap-4 text-sm font-semibold ${
              searchMode === "genre"
                ? "bg-indigo-600 text-white"
                : "bg-gray-700 text-gray-300"
            }`}
          >
            ジャンルで検索
          </button>
        </div>

        {searchMode === "name" ? (
          /* relative でボタンを重ねるためのラッパー */
          <div className="relative">
            {/* 入力欄 */}
            <input
              type="text"
              placeholder="🔍 商品名で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-4 py-3 pr-10 rounded-2xl bg-gray-800/60
                         backdrop-blur-md border border-gray-700
                         focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />

            {/* クリアボタン（入力があるときのみ表示） */}
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="検索語をクリア"
                className="absolute right-3 top-1/2 -translate-y-1/2
                           text-gray-400 hover:text-gray-200 text-xl
                           focus:outline-none"
              >
                ×
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 mt-2">
            {genreList.map((genre) => (
              <button
                key={genre}
                onClick={() =>
                  setSelectedGenre((prev) => (prev === genre ? "" : genre))
                }
                className={`min-w-[8rem] px-6 py-4 rounded-full flex grid gap-4 text-sm font-semibold ${
                  selectedGenre === genre
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 商品グリッド ───────────────────── */}
      <div className="flex-1 min-h-0">
        <div
          className="grid gap-6 pr-1 mt-2 sm:grid-cols-2 md:grid-cols-3 lg:pr-4
                     overflow-y-auto max-h-[31.5rem] scroll-smooth"
        >
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onAdd={onAdd}
              onImageUpload={onImageUpload}
            />
          ))}

          {filtered.length === 0 && (
            <p className="col-span-full text-center text-gray-400">
              商品が見つかりませんでした。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
