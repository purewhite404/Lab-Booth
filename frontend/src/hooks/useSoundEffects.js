// frontend/src/hooks/useSoundEffects.js
import { useMemo } from "react";

/* 🎵 効果音ファイル定義（.mp3 は同階層の public/sounds 内） */
export const SOUND_FILES = {
  scanSuccess: "/sounds/scan_success.mp3",
  scanError: "/sounds/scan_error.mp3",
  addProduct: "/sounds/add_product.mp3",
  confirm: "/sounds/confirm.mp3",
};

/* ──────────────────────────────────────────
   📀 マスター Audio をモジュールスコープでプリロード
   ────────────────────────────────────────── */
const masterAudios = new Map();
Object.entries(SOUND_FILES).forEach(([key, src]) => {
  const a = new Audio(src);
  a.preload = "auto";
  masterAudios.set(key, a);
});

/* ===========================================================
 *  🔊 効果音再生フック
 *     const { play } = useSoundEffects();
 *     play("addProduct");
 * =========================================================== */
export default function useSoundEffects(override = {}) {
  /* 上書き用ソース（メモ化して再レンダと無縁に） */
  const sources = useMemo(() => ({ ...SOUND_FILES, ...override }), [override]);

  /** 独立インスタンスを生成して再生するユーティリティ */
  const play = (key) => {
    const src = sources[key];
    if (!src) return;

    /* cloneNode() で高速複製 → 完全に独立した Audio になる */
    const base = masterAudios.get(key) ?? new Audio(src);
    const a = /** @type {HTMLAudioElement} */ (base.cloneNode());
    a.currentTime = 0;

    /* Safari 自動再生ブロック対策で Promise を握りつぶす */
    a.play().catch(() => {});
  };

  return { play };
}
