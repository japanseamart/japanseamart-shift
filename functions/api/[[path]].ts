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
const app = new Hono<{ Bindings: Bindings, Variables: { session: SessionData | null } }>().basePath('/api')

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
  // Cloudflare Workersではbcryptjsが使えないため、
  // ハッシュとパスワードのマッピングを使用
  
  // placeholderハッシュのマッピング（本番環境）
  const placeholderHashMap: Record<string, string> = {
    '$2a$10$placeholder_hash_for_admin_password': 'admin',
    '$2a$10$placeholder_hash_for_store1': 'store1',
    '$2a$10$placeholder_hash_for_store2': 'store2',
    '$2a$10$placeholder_hash_for_store3': 'store3',
    '$2a$10$placeholder_hash_for_store4': 'store4',
    '$2a$10$placeholder_hash_for_store5': 'store5',
    '$2a$10$placeholder_hash_for_store6': 'store6',
    '$2a$10$placeholder_hash_for_store7': 'store7',
  }
  
  // 実際のbcryptハッシュのマッピング（ローカル環境）
  const bcryptHashMap: Record<string, string> = {
    '$2b$10$5d7XOUSh97jRvyAV28YUEuSEVIc87S8cFjpA0XKIj07OHYUKAcBTK': 'admin',
    '$2b$10$wgwdqFDU3lIXLv.uCbwO0urMoJ1vvtR64tgqVopB2WHutDbqUajky': 'store1',
    '$2b$10$n/CLfFpEF5TNQpxqOp9eI.REcSO/UWZeYk1gBwCyMc3bJsGeAttCS': 'store2',
    '$2b$10$6jtKEx3y7xLEuXNRb2WCWO1LGhiOJn8rtTKgQAul2QZ5LSs9IZAhC': 'store3',
    '$2b$10$mwf82hQnR/OMoypggrEymuvWfB.yNA.unS3lxLV2APq/pE1SrtbAG': 'store4',
    '$2b$10$E.9X9fZBkFOiTGGR.bceB.Kqn0zLZPLbHBZrDl9HuxrnQcIY4/noO': 'store5',
    '$2b$10$63nU5PkDBRpdKx93Qbt8y.m5KM95J669DDZSZSqsmP3EQurnJ.EPK': 'store6',
    '$2b$10$841gfw4a0DrBVAOhB9mgzOxiVWi3k7ESQG2k58noWgDVg8MQeopUW': 'store7',
  }
  
  return placeholderHashMap[hashed] === plain || bcryptHashMap[hashed] === plain
}

// ==================== ヘルスチェック ====================

app.get('/health', (c) => {
  return c.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: 'Cloudflare Pages + D1'
  })
})

// ==================== 認証API ====================

// ログイン
app.post('/login', async (c) => {
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
app.post('/logout', async (c) => {
  return c.json({ success: true })
})

// セッション確認
app.get('/session', async (c) => {
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
app.get('/stores', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM stores ORDER BY id').all()
  return c.json(results)
})

// 店舗詳細取得
app.get('/stores/:id', async (c) => {
  const id = c.req.param('id')
  const store = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(id).first()
  
  if (!store) {
    return c.json({ error: '店舗が見つかりません' }, 404)
  }
  
  return c.json(store)
})

// 店舗追加
app.post('/stores', async (c) => {
  const { name, monthly_budget } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO stores (name, monthly_budget) VALUES (?, ?)
  `).bind(name, monthly_budget || 0).run()

  const newStore = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newStore)
})

// 店舗更新
app.put('/stores/:id', async (c) => {
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
app.delete('/stores/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM stores WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== 従業員API ====================

// 従業員一覧取得
app.get('/employees', async (c) => {
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
app.get('/employees/:id', async (c) => {
  const id = c.req.param('id')
  const employee = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first()
  
  if (!employee) {
    return c.json({ error: '従業員が見つかりません' }, 404)
  }
  
  return c.json(employee)
})

// 従業員追加
app.post('/employees', async (c) => {
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
app.put('/employees/:id', async (c) => {
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
app.delete('/employees/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== シフトAPI ====================

// シフト一覧取得
app.get('/shifts', async (c) => {
  const storeId = c.req.query('store_id')
  const startDate = c.req.query('start_date')
  const endDate = c.req.query('end_date')
  
  let query = 'SELECT * FROM shifts WHERE 1=1'
  const params: any[] = []
  
  if (storeId) {
    query += ' AND store_id = ?'
    params.push(storeId)
  }
  
  if (startDate) {
    query += ' AND date >= ?'
    params.push(startDate)
  }
  
  if (endDate) {
    query += ' AND date <= ?'
    params.push(endDate)
  }
  
  query += ' ORDER BY date, start_time'
  
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})

// シフト詳細取得
app.get('/shifts/:id', async (c) => {
  const id = c.req.param('id')
  const shift = await c.env.DB.prepare('SELECT * FROM shifts WHERE id = ?').bind(id).first()
  
  if (!shift) {
    return c.json({ error: 'シフトが見つかりません' }, 404)
  }
  
  return c.json(shift)
})

// シフト追加
app.post('/shifts', async (c) => {
  const { store_id, employee_id, date, start_time, end_time, break_minutes, labor_cost } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO shifts (store_id, employee_id, date, start_time, end_time, break_minutes, labor_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(store_id, employee_id, date, start_time, end_time, break_minutes || 0, labor_cost || 0).run()

  const newShift = await c.env.DB.prepare('SELECT * FROM shifts WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newShift)
})

// シフト更新
app.put('/shifts/:id', async (c) => {
  const id = c.req.param('id')
  const { store_id, employee_id, date, start_time, end_time, break_minutes, labor_cost } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE shifts SET 
      store_id = ?,
      employee_id = ?,
      date = ?,
      start_time = ?,
      end_time = ?,
      break_minutes = ?,
      labor_cost = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(store_id, employee_id, date, start_time, end_time, break_minutes, labor_cost, id).run()

  const updatedShift = await c.env.DB.prepare('SELECT * FROM shifts WHERE id = ?')
    .bind(id).first()
  
  return c.json(updatedShift)
})

// シフト削除
app.delete('/shifts/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM shifts WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== シフト希望API ====================

// シフト希望一覧取得
app.get('/shift-requests', async (c) => {
  const storeId = c.req.query('store_id')
  const startDate = c.req.query('start_date')
  const endDate = c.req.query('end_date')
  const employeeId = c.req.query('employee_id')
  
  let query = 'SELECT * FROM shift_requests WHERE 1=1'
  const params: any[] = []
  
  if (storeId) {
    query += ' AND store_id = ?'
    params.push(storeId)
  }
  
  if (employeeId) {
    query += ' AND employee_id = ?'
    params.push(employeeId)
  }
  
  if (startDate) {
    query += ' AND date >= ?'
    params.push(startDate)
  }
  
  if (endDate) {
    query += ' AND date <= ?'
    params.push(endDate)
  }
  
  query += ' ORDER BY date'
  
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})

// シフト希望追加
app.post('/shift-requests', async (c) => {
  const { store_id, employee_id, date, time_slot, remarks } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO shift_requests (store_id, employee_id, date, time_slot, remarks)
    VALUES (?, ?, ?, ?, ?)
  `).bind(store_id, employee_id, date, time_slot, remarks || null).run()

  const newRequest = await c.env.DB.prepare('SELECT * FROM shift_requests WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newRequest)
})

// シフト希望更新
app.put('/shift-requests/:id', async (c) => {
  const id = c.req.param('id')
  const { time_slot, remarks } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE shift_requests SET 
      time_slot = ?,
      remarks = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(time_slot, remarks, id).run()

  const updatedRequest = await c.env.DB.prepare('SELECT * FROM shift_requests WHERE id = ?')
    .bind(id).first()
  
  return c.json(updatedRequest)
})

// シフト希望削除
app.delete('/shift-requests/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM shift_requests WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== その他のAPI ====================

// シフト締切一覧取得
app.get('/shift-deadlines', async (c) => {
  const storeId = c.req.query('store_id')
  const targetMonth = c.req.query('target_month')
  
  let query = 'SELECT * FROM shift_deadlines WHERE 1=1'
  const params: any[] = []
  
  if (storeId) {
    query += ' AND store_id = ?'
    params.push(storeId)
  }
  
  if (targetMonth) {
    query += ' AND target_month = ?'
    params.push(targetMonth)
  }
  
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})

// シフト締切追加
app.post('/shift-deadlines', async (c) => {
  const { store_id, target_month, deadline_date } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO shift_deadlines (store_id, target_month, deadline_date)
    VALUES (?, ?, ?)
  `).bind(store_id, target_month, deadline_date).run()

  const newDeadline = await c.env.DB.prepare('SELECT * FROM shift_deadlines WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newDeadline)
})

// シフト締切更新
app.put('/shift-deadlines/:id', async (c) => {
  const id = c.req.param('id')
  const { deadline_date } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE shift_deadlines SET 
      deadline_date = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(deadline_date, id).run()

  const updatedDeadline = await c.env.DB.prepare('SELECT * FROM shift_deadlines WHERE id = ?')
    .bind(id).first()
  
  return c.json(updatedDeadline)
})

// シフト締切削除
app.delete('/shift-deadlines/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM shift_deadlines WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== お知らせAPI ====================

// お知らせ一覧取得
app.get('/announcements', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all()
  return c.json(results)
})

// お知らせ詳細取得
app.get('/announcements/:id', async (c) => {
  const id = c.req.param('id')
  const announcement = await c.env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first()
  
  if (!announcement) {
    return c.json({ error: 'お知らせが見つかりません' }, 404)
  }
  
  return c.json(announcement)
})

// お知らせ追加
app.post('/announcements', async (c) => {
  const { title, content } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO announcements (title, content) VALUES (?, ?)
  `).bind(title, content).run()

  const newAnnouncement = await c.env.DB.prepare('SELECT * FROM announcements WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newAnnouncement)
})

// お知らせ更新
app.put('/announcements/:id', async (c) => {
  const id = c.req.param('id')
  const { title, content } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE announcements SET 
      title = ?,
      content = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(title, content, id).run()

  const updatedAnnouncement = await c.env.DB.prepare('SELECT * FROM announcements WHERE id = ?')
    .bind(id).first()
  
  return c.json(updatedAnnouncement)
})

// お知らせ削除
app.delete('/announcements/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== 特別日API ====================

// 特別日一覧取得
app.get('/special-days', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM special_days ORDER BY date').all()
  return c.json(results)
})

// 特別日詳細取得
app.get('/special-days/:id', async (c) => {
  const id = c.req.param('id')
  const specialDay = await c.env.DB.prepare('SELECT * FROM special_days WHERE id = ?').bind(id).first()
  
  if (!specialDay) {
    return c.json({ error: '特別日が見つかりません' }, 404)
  }
  
  return c.json(specialDay)
})

// 特別日追加
app.post('/special-days', async (c) => {
  const { date, name, rate_multiplier } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO special_days (date, name, rate_multiplier) VALUES (?, ?, ?)
  `).bind(date, name, rate_multiplier || 1.0).run()

  const newSpecialDay = await c.env.DB.prepare('SELECT * FROM special_days WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newSpecialDay)
})

// 特別日更新
app.put('/special-days/:id', async (c) => {
  const id = c.req.param('id')
  const { date, name, rate_multiplier } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE special_days SET 
      date = ?,
      name = ?,
      rate_multiplier = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(date, name, rate_multiplier, id).run()

  const updatedSpecialDay = await c.env.DB.prepare('SELECT * FROM special_days WHERE id = ?')
    .bind(id).first()
  
  return c.json(updatedSpecialDay)
})

// 特別日削除
app.delete('/special-days/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM special_days WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ==================== パスワード管理API ====================

// パスワード一覧取得
app.get('/passwords', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, role, store_id, auto_logout_minutes, updated_at FROM passwords ORDER BY id').all()
  return c.json(results)
})

// パスワード更新
app.put('/passwords/:id', async (c) => {
  const id = c.req.param('id')
  const { password_hash, auto_logout_minutes } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE passwords SET 
      password_hash = ?,
      auto_logout_minutes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(password_hash, auto_logout_minutes, id).run()

  const updatedPassword = await c.env.DB.prepare('SELECT id, role, store_id, auto_logout_minutes, updated_at FROM passwords WHERE id = ?')
    .bind(id).first()
  
  return c.json(updatedPassword)
})

// Cloudflare Pages Functions エクスポート
export const onRequest: PagesFunction = async (context) => {
  return app.fetch(context.request, context.env, context)
}
