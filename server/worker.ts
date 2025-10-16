/**
 * Cloudflare Workers用のエントリーポイント
 * 
 * 注意: このプロジェクトは以下の理由でCloudflare Workersへの完全移行が困難です：
 * 1. Express.js依存（Workers環境で完全互換性なし）
 * 2. better-sqlite3パッケージ（Node.js専用、Workers非対応）
 * 3. express-sessionミドルウェア（Workers環境で動作せず）
 * 
 * Cloudflareでのデプロイには以下の対応が必要：
 * - フロントエンド: Cloudflare Pages（静的サイト）
 * - バックエンド: 別のNode.js対応ホスティング（Railway, Render等）
 * 
 * または、大規模なリファクタリングが必要：
 * - Express → Hono（Workers対応フレームワーク）
 * - better-sqlite3 → Cloudflare D1 API
 * - express-session → Cloudflare KV + カスタムセッション管理
 */

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    return new Response(
      JSON.stringify({
        error: 'このプロジェクトはCloudflare Workersとの完全な互換性がありません',
        message: 'フロントエンドのみCloudflare Pagesでホスト可能です',
        recommendation: 'バックエンドはRailway, Render, またはVPSでホストしてください',
        details: {
          frontend: 'Cloudflare Pagesで/distをホスト',
          backend: '別サービスでNode.jsサーバーをホスト',
          api_url: '環境変数でAPIエンドポイントを設定'
        }
      }),
      {
        status: 501,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  },
};
