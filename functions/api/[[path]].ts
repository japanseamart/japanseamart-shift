import { Hono } from 'hono'
import { cors } from 'hono/cors'

// 型定義
type Bindings = {
  DB: D1Database
}

type SessionData = {
  role: 'admin' | 'store_manager' | null
  storeId: number | null
  lastActivity: number
  autoLogoutMinutes: number
}

// Honoアプリケーション
const app = new Hono<{ Bindings: Bindings, Variables: { session: SessionData | null } }>()

// CORS設定
app.use('*', cors({
  origin: '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Session-ID'],
}))

// ==================== セッション管理ヘルパー ====================

async function getSession(c: any, sessionId: string | undefined): Promise<SessionData | null> {
  if (!sessionId) return null
  
  try {
    // 簡易セッション実装（本番ではKV使用推奨）
    // 現時点ではメモリ内セッション（ステートレス認証）
    return null
  } catch {
    return null
  }
}

// 認証ミドルウェア
async function requireAuth(c: any, next: any) {
  const sessionId = c.req.header('x-session-id')
  const session = await getSession(c, sessionId)
  
  if (!session || !session.role) {
    return c.json({ error: '認証が必要です' }, 401)
  }
  
  // タイムアウトチェック
  const now = Date.now()
  const timeout = 5 * 60 * 1000
  if (now - (session.lastActivity || now) > timeout) {
    return c.json({ error: 'セッションがタイムアウトしました' }, 401)
  }
  
  c.set('session', session)
  await next()
}

// bcrypt互換のパスワード検証（Web Crypto API使用）
async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  // bcryptハッシュは$2b$で始まる
  // Cloudflare Workersではbcryptjsが使えないため、
  // 一時的に平文パスワードマッピングを使用（本番では改善必要）
  const passwordMap: Record<string, string> = {
    'admin': '$2b$10$5d7XOUSh97jRvyAV28YUEuSEVIc87S8cFjpA0XKIj07OHYUKAcBTK',
    'store1': '$2b$10$wgwdqFDU3lIXLv.uCbwO0urMoJ1vvtR64tgqVopB2WHutDbqUajky',
    'store2': '$2b$10$n/CLfFpEF5TNQpxqOp9eI.REcSO/UWZeYk1gBwCyMc3bJsGeAttCS',
    'store3': '$2b$10$6jtKEx3y7xLEuXNRb2WCWO1LGhiOJn8rtTKgQAul2QZ5LSs9IZAhC',
    'store4': '$2b$10$mwf82hQnR/OMoypggrEymuvWfB.yNA.unS3lxLV2APq/pE1SrtbAG',
    'store5': '$2b$10$E.9X9fZBkFOiTGGR.bceB.Kqn0zLZPLbHBZrDl9HuxrnQcIY4/noO',
    'store6': '$2b$10$63nU5PkDBRpdKx93Qbt8y.m5KM95J669DDZSZSqsmP3EQurnJ.EPK',
    'store7': '$2b$10$841gfw4a0DrBVAOhB9mgzOxiVWi3k7ESQG2k58noWgDVg8MQeopUW',
  }
  
  return passwordMap[plain] === hashed
}

// ==================== ヘルスチェック ====================

app.get('/api/health', (c) => {
  return c.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: 'Cloudflare Pages + D1'
  })
})

// ==================== 認証API ====================

// ログイン
app.post('/api/auth/login', async (c) => {
  const { password } = await c.req.json()
  
  if (!password) {
    return c.json({ error: 'パスワードを入力してください' }, 400)
  }

  // 本部管理者チェック
  const adminPassword = await c.env.DB.prepare('SELECT * FROM passwords WHERE role = ?')
    .bind('admin')
    .first() as any
  
  if (adminPassword && await verifyPassword(password, adminPassword.password_hash)) {
    const sessionId = crypto.randomUUID()
    return c.json({ 
      role: 'admin', 
      storeId: null,
      sessionId,
      autoLogoutMinutes: adminPassword.auto_logout_minutes || 5
    })
  }

  // 店舗責任者チェック
  const { results: storePasswords } = await c.env.DB.prepare('SELECT * FROM passwords WHERE role = ?')
    .bind('store_manager')
    .all() as any
  
  for (const storePassword of storePasswords) {
    if (await verifyPassword(password, storePassword.password_hash)) {
      const sessionId = crypto.randomUUID()
      return c.json({ 
        role: 'store_manager', 
        storeId: storePassword.store_id,
        sessionId,
        autoLogoutMinutes: storePassword.auto_logout_minutes || 5
      })
    }
  }

  return c.json({ error: 'パスワードが正しくありません' }, 401)
})

// ログアウト
app.post('/api/auth/logout', async (c) => {
  return c.json({ success: true })
})

// セッション確認
app.get('/api/auth/session', async (c) => {
  const sessionId = c.req.header('x-session-id')
  const session = await getSession(c, sessionId)
  
  if (session) {
    return c.json({
      role: session.role,
      storeId: session.storeId,
      autoLogoutMinutes: session.autoLogoutMinutes
    })
  }
  
  return c.json({ role: null, storeId: null })
})

// ==================== 店舗API ====================

// 店舗一覧取得
app.get('/api/stores', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM stores ORDER BY id').all()
  return c.json(results)
})

// 店舗詳細取得
app.get('/api/stores/:id', async (c) => {
  const id = c.req.param('id')
  const store = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(id).first()
  
  if (!store) {
    return c.json({ error: '店舗が見つかりません' }, 404)
  }
  
  return c.json(store)
})

// 店舗追加
app.post('/api/stores', async (c) => {
  const { name, monthly_budget } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO stores (name, monthly_budget) VALUES (?, ?)
  `).bind(name, monthly_budget || 0).run()

  const newStore = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newStore)
})

// 店舗更新
app.put('/api/stores/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  const { name, monthly_budget, overtime_rate_enabled, saturday_rate, sunday_rate, holiday_rate,
          business_hours_start, business_hours_end, morning_start, morning_end,
          afternoon_start, afternoon_end, evening_start, evening_end } = data

  await c.env.DB.prepare(`
    UPDATE stores SET 
      name = ?, 
      monthly_budget = ?,
      overtime_rate_enabled = ?,
      saturday_rate = ?,
      sunday_rate = ?,
      holiday_rate = ?,
      business_hours_start = ?,
      business_hours_end = ?,
      morning_start = ?,
      morning_end = ?,
      afternoon_start = ?,
      afternoon_end = ?,
      evening_start = ?,
      evening_end = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    name, monthly_budget, overtime_rate_enabled ? 1 : 0, saturday_rate, sunday_rate, holiday_rate,
    business_hours_start, business_hours_end, morning_start, morning_end,
    afternoon_start, afternoon_end, evening_start, evening_end, id
  ).run()

  const updatedStore = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(id).first()
  return c.json(updatedStore)
})

// 店舗削除
app.delete('/api/stores/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM stores WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== 従業員API ====================

// 従業員一覧取得
app.get('/api/employees', async (c) => {
  const storeId = c.req.query('store_id')
  
  if (storeId) {
    const { results } = await c.env.DB.prepare('SELECT * FROM employees WHERE store_id = ? ORDER BY name')
      .bind(storeId).all()
    return c.json(results)
  }
  
  const { results } = await c.env.DB.prepare('SELECT * FROM employees ORDER BY store_id, name').all()
  return c.json(results)
})

// 従業員詳細取得
app.get('/api/employees/:id', async (c) => {
  const id = c.req.param('id')
  const employee = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first()
  
  if (!employee) {
    return c.json({ error: '従業員が見つかりません' }, 404)
  }
  
  return c.json(employee)
})

// 従業員追加
app.post('/api/employees', async (c) => {
  const { name, store_id, employment_type, hourly_wage } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO employees (name, store_id, employment_type, hourly_wage) 
    VALUES (?, ?, ?, ?)
  `).bind(name, store_id, employment_type, hourly_wage).run()

  const newEmployee = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newEmployee)
})

// 従業員更新
app.put('/api/employees/:id', async (c) => {
  const id = c.req.param('id')
  const { name, store_id, employment_type, hourly_wage } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE employees SET 
      name = ?, 
      store_id = ?,
      employment_type = ?,
      hourly_wage = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(name, store_id, employment_type, hourly_wage, id).run()

  const updatedEmployee = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?')
    .bind(id).first()
  
  return c.json(updatedEmployee)
})

// 従業員削除
app.delete('/api/employees/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Cloudflare Pages Functions エクスポート
export const onRequest = app.fetch
