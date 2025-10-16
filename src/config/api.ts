/**
 * API設定
 * 
 * 開発環境: Viteプロキシ経由で /api にアクセス
 * 本番環境: VITE_API_URL環境変数で指定されたバックエンドにアクセス
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * API URLを取得
 * @param path APIパス（例: '/api/stores'）
 * @returns 完全なAPI URL
 */
export function getApiUrl(path: string): string {
  // 本番環境ではVITE_API_URLを使用、開発環境では相対パス
  return `${API_BASE_URL}${path}`;
}

/**
 * fetch用のデフォルトオプション
 */
export const fetchOptions: RequestInit = {
  credentials: 'include', // クロスドメインでもCookieを送信
  headers: {
    'Content-Type': 'application/json',
  },
};
