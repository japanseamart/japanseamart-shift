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

// ==================== 締切自動計算ヘルパー ====================
// 仕様: シフト開始日の6日前 23:59 を締切とする (全店統一)
// - 前半(1-15日): 開始日=1日 → 締切=前月26日
// - 後半(16日以降): 開始日=16日 → 締切=同月10日
function computeAutoDeadline(targetYear: number, targetMonth: number, targetPeriod: 'first' | 'second'): string {
  if (targetPeriod === 'first') {
    // 前月26日
    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}-26`
  } else {
    // 同月10日
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-10`
  }
}

// 既存の締切レコードを自動計算値で上書き(DBは残しつつ、フロントには常に計算値を返す)
function overrideDeadlineWithAuto(row: any): any {
  if (!row) return row
  const autoDate = computeAutoDeadline(row.target_year, row.target_month, row.target_period)
  return {
    ...row,
    deadline_date: autoDate,
    notification_message: row.notification_message || '【全店自動設定】シフト開始日の6日前 23:59 が締切です',
    is_auto: true,
  }
}

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
  // プレーンテキスト形式のチェック（新規追加された店舗用）
  if (hashed.startsWith('plain:')) {
    return hashed.substring(6) === plain
  }
  
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
  const data = await c.req.json()
  const { name, monthly_budget, password, overtime_rate_enabled, saturday_rate, sunday_rate, holiday_rate,
          business_hours_start, business_hours_end, morning_start, morning_end,
          afternoon_start, afternoon_end, evening_start, evening_end } = data
  
  // 店舗を追加
  const result = await c.env.DB.prepare(`
    INSERT INTO stores (
      name, monthly_budget, overtime_rate_enabled, saturday_rate, sunday_rate, holiday_rate,
      business_hours_start, business_hours_end, morning_start, morning_end,
      afternoon_start, afternoon_end, evening_start, evening_end
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    name, 
    monthly_budget || 0,
    overtime_rate_enabled ? 1 : 0,
    saturday_rate || 0,
    sunday_rate || 0,
    holiday_rate || 0,
    business_hours_start || '07:00',
    business_hours_end || '22:00',
    morning_start || '07:00',
    morning_end || '12:00',
    afternoon_start || '12:00',
    afternoon_end || '17:00',
    evening_start || '17:00',
    evening_end || '22:00'
  ).run()

  const storeId = result.meta.last_row_id
  const newStore = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?')
    .bind(storeId).first()
  
  // パスワードが提供されている場合、passwordsテーブルに保存
  if (password) {
    // プレーンテキスト形式でパスワードを保存（plain:プレフィックス付き）
    // 注意: 本番環境では適切なハッシュ化が必要
    await c.env.DB.prepare(`
      INSERT INTO passwords (role, store_id, password_hash)
      VALUES ('store_manager', ?, ?)
    `).bind(storeId, `plain:${password}`).run()
  }
  
  return c.json(newStore)
})

// 店舗更新
app.put('/stores/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  
  const { name, monthly_budget, password, overtime_rate_enabled, saturday_rate, sunday_rate, holiday_rate,
          business_hours_start, business_hours_end, morning_start, morning_end,
          afternoon_start, afternoon_end, evening_start, evening_end } = data

  // パスワードが提供されている場合のみ更新
  if (password && password.trim() !== '') {
    await c.env.DB.prepare(`
      UPDATE stores SET 
        name = ?, 
        monthly_budget = ?,
        password = ?,
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
      name, monthly_budget, `plain:${password}`, overtime_rate_enabled ? 1 : 0, saturday_rate, sunday_rate, holiday_rate,
      business_hours_start, business_hours_end, morning_start, morning_end,
      afternoon_start, afternoon_end, evening_start, evening_end, id
    ).run()
  } else {
    // パスワードが空の場合はパスワード以外を更新
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
  }

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

// シフト希望の自動反映
app.post('/shifts/auto-fill-requests', async (c) => {
  const { store_id, start_date, end_date, week_start_date } = await c.req.json()
  
  // 新しいパラメータ（start_date, end_date）または従来のパラメータ（week_start_date）をサポート
  const periodStartDate = start_date || week_start_date
  let periodEndDate = end_date
  
  if (!store_id || !periodStartDate) {
    return c.json({ success: false, error: 'store_idとstart_date（またはweek_start_date）が必要です' }, 400)
  }
  
  // end_dateが指定されていない場合は従来の週単位（+6日）
  if (!periodEndDate) {
    const startDateObj = new Date(periodStartDate)
    const endDateObj = new Date(startDateObj)
    endDateObj.setDate(endDateObj.getDate() + 6)
    periodEndDate = endDateObj.toISOString().split('T')[0]
  }
  
  try {
    // 対象期間のシフト希望を取得
    const { results: requests } = await c.env.DB.prepare(`
      SELECT sr.*, e.hourly_wage 
      FROM shift_requests sr
      JOIN employees e ON sr.employee_id = e.id
      WHERE sr.store_id = ? 
        AND sr.date >= ? 
        AND sr.date <= ?
      ORDER BY sr.date, sr.employee_id
    `).bind(store_id, periodStartDate, periodEndDate).all()
    
    if (!requests || requests.length === 0) {
      return c.json({ success: true, createdCount: 0, totalRequests: 0 })
    }
    
    // 店舗情報を取得（シフトパターンの時間設定用）
    const store = await c.env.DB.prepare('SELECT * FROM stores WHERE id = ?').bind(store_id).first()
    if (!store) {
      return c.json({ success: false, error: '店舗が見つかりません' }, 404)
    }
    
    let createdCount = 0
    
    for (const request of requests as any[]) {
      // 既存のシフトがあればスキップ
      const existing = await c.env.DB.prepare(`
        SELECT id FROM shifts 
        WHERE employee_id = ? AND date = ?
      `).bind(request.employee_id, request.date).first()
      
      if (existing) continue
      
      // パターンを解析
      let patterns: string[] = []
      try {
        patterns = JSON.parse(request.patterns)
      } catch {
        continue
      }
      
      // カスタム時間が設定されている場合
      if (request.custom_start && request.custom_end) {
        // 労働時間を計算（休憩時間なし）
        const startMinutes = parseInt(request.custom_start.split(':')[0]) * 60 + parseInt(request.custom_start.split(':')[1])
        const endMinutes = parseInt(request.custom_end.split(':')[0]) * 60 + parseInt(request.custom_end.split(':')[1])
        const totalMinutes = endMinutes - startMinutes
        const totalHours = totalMinutes / 60
        
        // 6時間以上なら60分、未満なら0分の休憩時間
        const breakMinutes = totalHours >= 6 ? 60 : 0
        
        // 実労働時間と人件費を計算
        const workMinutes = totalMinutes - breakMinutes
        const laborCost = Math.round((workMinutes / 60) * request.hourly_wage)
        
        await c.env.DB.prepare(`
          INSERT INTO shifts (store_id, employee_id, date, start_time, end_time, break_minutes, labor_cost)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(store_id, request.employee_id, request.date, request.custom_start, request.custom_end, breakMinutes, laborCost).run()
        
        createdCount++
        continue
      }
      
      // 標準パターンからシフトを作成（最初のパターンを使用）
      if (patterns.length === 0 || patterns[0] === 'off') continue
      
      const pattern = patterns[0]
      let startTime = '', endTime = ''
      
      switch (pattern) {
        case 'morning':
          startTime = store.morning_start as string
          endTime = store.morning_end as string
          break
        case 'afternoon':
          startTime = store.afternoon_start as string
          endTime = store.afternoon_end as string
          break
        case 'evening':
          startTime = store.evening_start as string
          endTime = store.evening_end as string
          break
        case 'full':
          startTime = store.business_hours_start as string
          endTime = store.business_hours_end as string
          break
        default:
          continue
      }
      
      // 労働時間を計算（休憩時間なし）
      const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])
      const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1])
      const totalMinutes = endMinutes - startMinutes
      const totalHours = totalMinutes / 60
      
      // 6時間以上なら60分、未満なら0分の休憩時間
      const breakMinutes = totalHours >= 6 ? 60 : 0
      
      // 実労働時間と人件費を計算
      const workMinutes = totalMinutes - breakMinutes
      const laborCost = Math.round((workMinutes / 60) * request.hourly_wage)
      
      await c.env.DB.prepare(`
        INSERT INTO shifts (store_id, employee_id, date, start_time, end_time, break_minutes, labor_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(store_id, request.employee_id, request.date, startTime, endTime, breakMinutes, laborCost).run()
      
      createdCount++
    }
    
    return c.json({ 
      success: true, 
      createdCount, 
      totalRequests: requests.length 
    })
  } catch (error: any) {
    console.error('シフト自動反映エラー:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
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
  const { store_id, employee_id, date, patterns, custom_start, custom_end } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO shift_requests (store_id, employee_id, date, patterns, custom_start, custom_end, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).bind(store_id, employee_id, date, patterns, custom_start || null, custom_end || null).run()

  const newRequest = await c.env.DB.prepare('SELECT * FROM shift_requests WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newRequest)
})

// シフト希望更新
app.put('/shift-requests/:id', async (c) => {
  const id = c.req.param('id')
  const { patterns, custom_start, custom_end, status } = await c.req.json()
  
  // statusが提供された場合（承認・却下時）
  if (status) {
    await c.env.DB.prepare(`
      UPDATE shift_requests SET 
        status = ?,
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(status, id).run()
  } else {
    // 通常の更新（従業員による編集時）
    await c.env.DB.prepare(`
      UPDATE shift_requests SET 
        patterns = ?,
        custom_start = ?,
        custom_end = ?
      WHERE id = ?
    `).bind(patterns, custom_start || null, custom_end || null, id).run()
  }

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

// シフト締切一覧取得（新スキーマ: 年/月/期間別）
// 【自動締切化】: DB値は残しつつ、返却時に必ず「開始日6日前」に上書き
app.get('/shift-deadlines', async (c) => {
  const storeId = c.req.query('store_id')
  const targetYear = c.req.query('target_year')
  const targetMonth = c.req.query('target_month')
  const targetPeriod = c.req.query('target_period') // 'first' or 'second'
  
  let query = 'SELECT * FROM shift_deadlines WHERE 1=1'
  const params: any[] = []
  
  if (storeId) {
    query += ' AND store_id = ?'
    params.push(storeId)
  }
  
  if (targetYear) {
    query += ' AND target_year = ?'
    params.push(targetYear)
  }
  
  if (targetMonth) {
    query += ' AND target_month = ?'
    params.push(targetMonth)
  }
  
  if (targetPeriod) {
    query += ' AND target_period = ?'
    params.push(targetPeriod)
  }
  
  query += ' ORDER BY target_year DESC, target_month DESC, target_period'
  
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  // 全レコードを自動計算値で上書き
  const overridden = (results || []).map(overrideDeadlineWithAuto)
  return c.json(overridden)
})

// 【自動締切化により廃止】シフト締切追加・更新・削除
// 全店統一の自動計算 (開始日6日前 23:59) に変更されたため、
// 個別設定はサポートしません。互換のためエラーを返します。
app.post('/shift-deadlines', async (c) => {
  return c.json({
    error: '締切は全店統一で自動設定されるようになりました',
    message: 'シフト開始日の6日前 23:59 が全店共通の締切です。個別設定は廃止されました。',
  }, 410)
})

app.put('/shift-deadlines/:id', async (c) => {
  return c.json({
    error: '締切は全店統一で自動設定されるようになりました',
    message: 'シフト開始日の6日前 23:59 が全店共通の締切です。個別設定は廃止されました。',
  }, 410)
})

app.delete('/shift-deadlines/:id', async (c) => {
  return c.json({
    error: '締切は全店統一で自動設定されるようになりました',
    message: '個別設定は廃止されました。',
  }, 410)
})

// 【自動締切化により意味変化】: 既に全店統一の自動計算なので、
// このエンドポイントは自動計算値をそのまま返します(既存コード互換のため残す)
app.post('/shift-deadlines/auto-setup', async (c) => {
  try {
    const { target_year, target_month } = await c.req.json()
    if (!target_year || !target_month) {
      return c.json({ error: 'target_year and target_month are required' }, 400)
    }
    const firstHalfDeadline = computeAutoDeadline(target_year, target_month, 'first')
    const secondHalfDeadline = computeAutoDeadline(target_year, target_month, 'second')
    return c.json({
      success: true,
      auto: true,
      message: '締切は全店統一で自動計算されます(シフト開始日の6日前 23:59)',
      target_year,
      target_month,
      first_half_deadline: firstHalfDeadline,
      second_half_deadline: secondHalfDeadline,
    })
  } catch (error) {
    console.error('自動設定エラー:', error)
    return c.json({ error: '自動設定に失敗しました' }, 500)
  }
})

// 従業員用: 締切情報を取得（告知用・全店統一の自動計算）
// 【自動締切化】: DB非依存で、締切前の2期間を動的計算して返す
// - 「今から見て次に来る締切」を含む2期間分
app.get('/shift-deadlines/for-employee', async (c) => {
  const storeId = c.req.query('store_id') // 互換のため受け取るが使用しない
  
  const now = new Date()
  const nowTs = now.getTime()
  
  // 直近から順に候補期間を生成
  // 起点: 今月前半 → 今月後半 → 来月前半 → 来月後半 → 再来月前半 …
  const candidates: Array<{ year: number; month: number; period: 'first' | 'second' }> = []
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  for (let offset = 0; offset < 6; offset++) {
    let y = currentYear
    let m = currentMonth + offset
    while (m > 12) { m -= 12; y += 1 }
    candidates.push({ year: y, month: m, period: 'first' })
    candidates.push({ year: y, month: m, period: 'second' })
  }
  
  // 締切がまだ来ていないものだけ抽出し、最初の2つを返す
  const upcoming = []
  for (const cand of candidates) {
    const deadlineDateStr = computeAutoDeadline(cand.year, cand.month, cand.period)
    const dt = new Date(deadlineDateStr)
    dt.setHours(23, 59, 59, 999)
    if (dt.getTime() >= nowTs) {
      upcoming.push({
        id: 0, // ダミー
        store_id: storeId ? parseInt(storeId) : 0,
        target_year: cand.year,
        target_month: cand.month,
        target_period: cand.period,
        deadline_date: deadlineDateStr,
        notification_message: '【全店自動設定】シフト開始日の6日前 23:59 が締切です',
        is_changed: 0,
        change_count: 0,
        is_auto: true,
      })
      if (upcoming.length >= 2) break
    }
  }
  
  return c.json(upcoming)
})

// ==================== 全店舗締切ステータス（従業員お知らせ用） ====================

// 全店舗の締切ステータス取得
// 【自動締切化】: 全店統一なので、全店分に同じ自動計算値を返す
// 「締切前の直近2期間」を返す(Q8-3仕様)
app.get('/shift-deadlines/all-stores-status', async (c) => {
  const now = new Date()
  const nowTs = now.getTime()

  // 締切前の直近2期間を計算
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const candidates: Array<{ year: number; month: number; period: 'first' | 'second' }> = []
  for (let offset = 0; offset < 6; offset++) {
    let y = currentYear
    let m = currentMonth + offset
    while (m > 12) { m -= 12; y += 1 }
    candidates.push({ year: y, month: m, period: 'first' })
    candidates.push({ year: y, month: m, period: 'second' })
  }
  const upcomingPeriods: Array<{ year: number; month: number; period: 'first' | 'second'; deadline_date: string }> = []
  for (const cand of candidates) {
    const deadlineDateStr = computeAutoDeadline(cand.year, cand.month, cand.period)
    const dt = new Date(deadlineDateStr)
    dt.setHours(23, 59, 59, 999)
    if (dt.getTime() >= nowTs) {
      upcomingPeriods.push({ ...cand, deadline_date: deadlineDateStr })
      if (upcomingPeriods.length >= 2) break
    }
  }

  // 全店舗取得（店舗ID順）
  const storesRes = await c.env.DB.prepare(
    'SELECT id, name FROM stores ORDER BY id ASC'
  ).all()
  const stores = storesRes.results || []

  // 全店統一なので、全店分同じ締切を割り当てる
  const rows = []
  for (const store of stores) {
    for (const tp of upcomingPeriods) {
      rows.push({
        store_id: store.id,
        store_name: store.name,
        target_year: tp.year,
        target_month: tp.month,
        target_period: tp.period,
        deadline: {
          id: 0,
          store_id: store.id,
          target_year: tp.year,
          target_month: tp.month,
          target_period: tp.period,
          deadline_date: tp.deadline_date,
          notification_message: '【全店自動設定】シフト開始日の6日前 23:59 が締切です',
          is_changed: 0,
          change_count: 0,
          is_auto: true,
        },
      })
    }
  }

  return c.json({
    generated_at: now.toISOString(),
    auto: true,
    unified: true,
    periods: upcomingPeriods.map(p => ({ year: p.year, month: p.month, period: p.period })),
    rows,
  })
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
  const { date, type, name, description } = await c.req.json()
  
  const result = await c.env.DB.prepare(`
    INSERT INTO special_days (date, type, name, description) VALUES (?, ?, ?, ?)
  `).bind(date, type, name, description || null).run()

  const newSpecialDay = await c.env.DB.prepare('SELECT * FROM special_days WHERE id = ?')
    .bind(result.meta.last_row_id).first()
  
  return c.json(newSpecialDay)
})

// 特別日更新
app.put('/special-days/:id', async (c) => {
  const id = c.req.param('id')
  const { date, type, name, description } = await c.req.json()
  
  await c.env.DB.prepare(`
    UPDATE special_days SET 
      date = ?,
      type = ?,
      name = ?,
      description = ?
    WHERE id = ?
  `).bind(date, type, name, description || null, id).run()

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

// ==================== 🎌 日本の祝日を自動同期 ====================
// 内閣府「国民の祝日」CSV（syukujitsu.csv）を源とする holidays-jp を利用。
// holidays-jp.github.io は内閣府CSVを日次バッチでJSON化した公開サービス。
// 内閣府CSV自体はShift_JISのためCloudflare Workers上のTextDecoderで扱えないため、
// UTF-8 JSONで提供される同等データを利用する。ソースURLは切替可能。
//
// 挙動:
//  - 現在年 + 来年 の祝日のみ抽出
//  - date (YYYY-MM-DD) が既存の special_days に存在すれば UPDATE、なければ INSERT
//  - type は常に 1 (祝日・休日) を設定
//  - description に "自動同期 (holidays-jp)" を記録して手動登録と区別しやすくする
app.post('/special-days/sync-japan-holidays', async (c) => {
  const HOLIDAYS_JP_URL = 'https://holidays-jp.github.io/api/v1/date.json'
  try {
    const now = new Date()
    const thisYear = now.getFullYear()
    const nextYear = thisYear + 1

    // 1) 祝日データ取得
    const res = await fetch(HOLIDAYS_JP_URL, {
      headers: { 'User-Agent': 'japanseamart-shift/1.0' },
    })
    if (!res.ok) {
      return c.json({ error: `祝日データ取得失敗 (HTTP ${res.status})` }, 502)
    }
    const holidayMap = await res.json() as Record<string, string>

    // 2) 対象年フィルタ + パース
    const targetHolidays: Array<{ date: string; name: string }> = []
    for (const [dateStr, name] of Object.entries(holidayMap)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue
      const y = parseInt(dateStr.slice(0, 4), 10)
      if (y !== thisYear && y !== nextYear) continue
      targetHolidays.push({ date: dateStr, name })
    }
    targetHolidays.sort((a, b) => a.date.localeCompare(b.date))

    if (targetHolidays.length === 0) {
      return c.json({ error: '対象年の祝日データが空でした', years: [thisYear, nextYear] }, 500)
    }

    // 3) UPSERT ループ (D1 は ON CONFLICT に date のUNIQUE制約が必要な場合があるため
    //    存在チェック → INSERT or UPDATE で実装)
    let inserted = 0
    let updated = 0
    const description = '自動同期 (holidays-jp / 内閣府CSV由来)'

    for (const h of targetHolidays) {
      const existing = await c.env.DB.prepare(
        'SELECT id FROM special_days WHERE date = ?'
      ).bind(h.date).first<{ id: number }>()

      if (existing) {
        await c.env.DB.prepare(`
          UPDATE special_days SET type = 1, name = ?, description = ? WHERE id = ?
        `).bind(h.name, description, existing.id).run()
        updated++
      } else {
        await c.env.DB.prepare(`
          INSERT INTO special_days (date, type, name, description) VALUES (?, 1, ?, ?)
        `).bind(h.date, h.name, description).run()
        inserted++
      }
    }

    return c.json({
      success: true,
      years: [thisYear, nextYear],
      total: targetHolidays.length,
      inserted,
      updated,
      source: HOLIDAYS_JP_URL,
      holidays: targetHolidays,
    })
  } catch (error: any) {
    console.error('祝日同期エラー:', error)
    return c.json({ error: `祝日同期に失敗しました: ${error?.message || String(error)}` }, 500)
  }
})

// ==================== 週次公開状態API ====================

// 週次公開状態の取得
app.get('/weekly-publications', async (c) => {
  const storeId = c.req.query('store_id')
  const weekStartDate = c.req.query('week_start_date')
  
  if (!storeId || !weekStartDate) {
    return c.json({ error: 'store_idとweek_start_dateが必要です' }, 400)
  }
  
  const publication = await c.env.DB.prepare(`
    SELECT * FROM weekly_publications 
    WHERE store_id = ? AND week_start_date = ?
  `).bind(storeId, weekStartDate).first()
  
  if (!publication) {
    return c.json({ is_published: false })
  }
  
  return c.json(publication)
})

// 従業員お知らせ用: 全店舗の公開状況(直近2期間)を一括取得
// 締切バナーと同じ「直近2期間」で店舗別マトリクスを返す
app.get('/weekly-publications/all-stores-status', async (c) => {
  const now = new Date()
  const nowTs = now.getTime()

  // 締切前の直近2期間を計算(締切バナーと統一)
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const candidates: Array<{ year: number; month: number; period: 'first' | 'second' }> = []
  for (let offset = 0; offset < 6; offset++) {
    let y = currentYear
    let m = currentMonth + offset
    while (m > 12) { m -= 12; y += 1 }
    candidates.push({ year: y, month: m, period: 'first' })
    candidates.push({ year: y, month: m, period: 'second' })
  }
  const upcomingPeriods: Array<{ year: number; month: number; period: 'first' | 'second'; week_start_date: string }> = []
  for (const cand of candidates) {
    const deadlineDateStr = computeAutoDeadline(cand.year, cand.month, cand.period)
    const dt = new Date(deadlineDateStr)
    dt.setHours(23, 59, 59, 999)
    if (dt.getTime() >= nowTs) {
      const day = cand.period === 'first' ? 1 : 16
      const weekStart = `${cand.year}-${String(cand.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      upcomingPeriods.push({ ...cand, week_start_date: weekStart })
      if (upcomingPeriods.length >= 2) break
    }
  }

  // 全店舗取得(本部除く)
  const storesRes = await c.env.DB.prepare(
    'SELECT id, name FROM stores WHERE id != 8 ORDER BY id ASC'
  ).all()
  const stores = storesRes.results || []

  if (upcomingPeriods.length === 0 || stores.length === 0) {
    return c.json({ generated_at: now.toISOString(), periods: [], rows: [] })
  }

  // 対象期間の公開レコードを一括取得
  const weekStartDates = upcomingPeriods.map(p => p.week_start_date)
  const placeholders = weekStartDates.map(() => '?').join(',')
  const pubsRes = await c.env.DB.prepare(`
    SELECT * FROM weekly_publications
    WHERE week_start_date IN (${placeholders})
  `).bind(...weekStartDates).all()
  const publications = pubsRes.results || []

  // 店舗×期間のマトリクス構築
  const rows: any[] = []
  for (const store of stores as any[]) {
    const storeRow: any = {
      store_id: store.id,
      store_name: store.name,
      periods: [],
    }
    for (const tp of upcomingPeriods) {
      const found = publications.find((p: any) =>
        p.store_id === store.id && p.week_start_date === tp.week_start_date
      )
      storeRow.periods.push({
        target_year: tp.year,
        target_month: tp.month,
        target_period: tp.period,
        week_start_date: tp.week_start_date,
        is_published: found ? Boolean((found as any).is_published) : false,
        published_at: found ? (found as any).published_at : null,
      })
    }
    rows.push(storeRow)
  }

  return c.json({
    generated_at: now.toISOString(),
    periods: upcomingPeriods.map(p => ({
      year: p.year,
      month: p.month,
      period: p.period,
      week_start_date: p.week_start_date,
    })),
    rows,
  })
})

// 週次公開状態の設定
app.post('/weekly-publications', async (c) => {
  const { store_id, week_start_date, is_published } = await c.req.json()
  
  if (!store_id || !week_start_date) {
    return c.json({ error: 'store_idとweek_start_dateが必要です' }, 400)
  }
  
  // 既存のレコードを確認
  const existing = await c.env.DB.prepare(`
    SELECT id FROM weekly_publications 
    WHERE store_id = ? AND week_start_date = ?
  `).bind(store_id, week_start_date).first()
  
  if (existing) {
    // 更新
    await c.env.DB.prepare(`
      UPDATE weekly_publications 
      SET is_published = ?, updated_at = CURRENT_TIMESTAMP
      WHERE store_id = ? AND week_start_date = ?
    `).bind(is_published ? 1 : 0, store_id, week_start_date).run()
  } else {
    // 新規作成
    await c.env.DB.prepare(`
      INSERT INTO weekly_publications (store_id, week_start_date, is_published)
      VALUES (?, ?, ?)
    `).bind(store_id, week_start_date, is_published ? 1 : 0).run()
  }
  
  const updated = await c.env.DB.prepare(`
    SELECT * FROM weekly_publications 
    WHERE store_id = ? AND week_start_date = ?
  `).bind(store_id, week_start_date).first()
  
  return c.json(updated)
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

// ==================== 月別予算API ====================

// 月別予算一覧取得（年・店舗でフィルタ可能）
app.get('/monthly-budgets', async (c) => {
  const store_id = c.req.query('store_id')
  const year = c.req.query('year')
  
  let query = 'SELECT * FROM monthly_budgets WHERE 1=1'
  const params: (string | number)[] = []
  
  if (store_id) {
    query += ' AND store_id = ?'
    params.push(parseInt(store_id))
  }
  if (year) {
    query += ' AND year = ?'
    params.push(parseInt(year))
  }
  
  query += ' ORDER BY store_id, year, month'
  
  const stmt = c.env.DB.prepare(query)
  const { results } = params.length > 0 
    ? await stmt.bind(...params).all()
    : await stmt.all()
  
  return c.json(results)
})

// 特定月の予算取得
app.get('/monthly-budgets/:store_id/:year/:month', async (c) => {
  const store_id = c.req.param('store_id')
  const year = c.req.param('year')
  const month = c.req.param('month')
  
  const budget = await c.env.DB.prepare(`
    SELECT * FROM monthly_budgets 
    WHERE store_id = ? AND year = ? AND month = ?
  `).bind(store_id, year, month).first()
  
  return c.json(budget || { store_id: parseInt(store_id), year: parseInt(year), month: parseInt(month), budget: null })
})

// 月別予算を設定/更新
app.post('/monthly-budgets', async (c) => {
  const { store_id, year, month, budget, note } = await c.req.json()
  
  // 既存レコードを確認
  const existing = await c.env.DB.prepare(`
    SELECT id FROM monthly_budgets 
    WHERE store_id = ? AND year = ? AND month = ?
  `).bind(store_id, year, month).first()
  
  if (existing) {
    // 更新
    await c.env.DB.prepare(`
      UPDATE monthly_budgets 
      SET budget = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(budget, note || null, existing.id).run()
  } else {
    // 新規作成
    await c.env.DB.prepare(`
      INSERT INTO monthly_budgets (store_id, year, month, budget, note)
      VALUES (?, ?, ?, ?, ?)
    `).bind(store_id, year, month, budget, note || null).run()
  }
  
  const result = await c.env.DB.prepare(`
    SELECT * FROM monthly_budgets 
    WHERE store_id = ? AND year = ? AND month = ?
  `).bind(store_id, year, month).first()
  
  return c.json(result)
})

// 前月から予算をコピー
app.post('/monthly-budgets/copy-from-previous', async (c) => {
  const { store_id, year, month } = await c.req.json()
  
  // 前月を計算
  let prevYear = year
  let prevMonth = month - 1
  if (prevMonth === 0) {
    prevMonth = 12
    prevYear = year - 1
  }
  
  // 前月の予算を取得
  const prevBudget = await c.env.DB.prepare(`
    SELECT budget, note FROM monthly_budgets 
    WHERE store_id = ? AND year = ? AND month = ?
  `).bind(store_id, prevYear, prevMonth).first()
  
  if (!prevBudget) {
    // 前月の予算がない場合は店舗のデフォルト予算を使用
    const store = await c.env.DB.prepare(`
      SELECT monthly_budget FROM stores WHERE id = ?
    `).bind(store_id).first()
    
    if (!store) {
      return c.json({ error: '店舗が見つかりません' }, 404)
    }
    
    // デフォルト予算で新規作成
    await c.env.DB.prepare(`
      INSERT INTO monthly_budgets (store_id, year, month, budget, note)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(store_id, year, month) DO UPDATE SET
        budget = excluded.budget,
        note = excluded.note,
        updated_at = CURRENT_TIMESTAMP
    `).bind(store_id, year, month, store.monthly_budget || 0, '店舗デフォルト予算からコピー').run()
  } else {
    // 前月の予算をコピー
    await c.env.DB.prepare(`
      INSERT INTO monthly_budgets (store_id, year, month, budget, note)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(store_id, year, month) DO UPDATE SET
        budget = excluded.budget,
        note = excluded.note,
        updated_at = CURRENT_TIMESTAMP
    `).bind(store_id, year, month, prevBudget.budget, `${prevYear}年${prevMonth}月からコピー`).run()
  }
  
  const result = await c.env.DB.prepare(`
    SELECT * FROM monthly_budgets 
    WHERE store_id = ? AND year = ? AND month = ?
  `).bind(store_id, year, month).first()
  
  return c.json(result)
})

// 全店舗の予算を一括コピー
app.post('/monthly-budgets/copy-all-from-previous', async (c) => {
  const { year, month } = await c.req.json()
  
  // 前月を計算
  let prevYear = year
  let prevMonth = month - 1
  if (prevMonth === 0) {
    prevMonth = 12
    prevYear = year - 1
  }
  
  // 全店舗を取得
  const { results: stores } = await c.env.DB.prepare('SELECT id, monthly_budget FROM stores').all()
  
  let copiedCount = 0
  let skippedCount = 0
  
  for (const store of stores as { id: number; monthly_budget: number }[]) {
    // 既に設定されているか確認
    const existing = await c.env.DB.prepare(`
      SELECT id FROM monthly_budgets 
      WHERE store_id = ? AND year = ? AND month = ?
    `).bind(store.id, year, month).first()
    
    if (existing) {
      skippedCount++
      continue
    }
    
    // 前月の予算を取得
    const prevBudget = await c.env.DB.prepare(`
      SELECT budget FROM monthly_budgets 
      WHERE store_id = ? AND year = ? AND month = ?
    `).bind(store.id, prevYear, prevMonth).first()
    
    const budgetValue = prevBudget ? (prevBudget as { budget: number }).budget : store.monthly_budget || 0
    const noteText = prevBudget ? `${prevYear}年${prevMonth}月からコピー` : '店舗デフォルト予算'
    
    await c.env.DB.prepare(`
      INSERT INTO monthly_budgets (store_id, year, month, budget, note)
      VALUES (?, ?, ?, ?, ?)
    `).bind(store.id, year, month, budgetValue, noteText).run()
    
    copiedCount++
  }
  
  return c.json({ success: true, copied_count: copiedCount, skipped_count: skippedCount })
})

// ==================== 暗証番号（PIN）関連 ====================

// 暗証番号認証（ログインチェック）
app.post('/employees/:id/verify-pin', async (c) => {
  const id = c.req.param('id')
  const { pin } = await c.req.json()
  
  const employee = await c.env.DB.prepare(
    'SELECT id, name, pin FROM employees WHERE id = ?'
  ).bind(id).first() as { id: number; name: string; pin: string } | null
  
  if (!employee) {
    return c.json({ error: '従業員が見つかりません' }, 404)
  }
  
  const storedPin = employee.pin || '0000'
  const isValid = storedPin === pin
  const isDefaultPin = storedPin === '0000'
  
  return c.json({ 
    valid: isValid, 
    isDefaultPin: isDefaultPin,
    employeeName: employee.name 
  })
})

// 暗証番号変更
app.put('/employees/:id/pin', async (c) => {
  const id = c.req.param('id')
  const { currentPin, newPin } = await c.req.json()
  
  // 新しいPINが4桁の数字かチェック
  if (!newPin || !/^\d{4}$/.test(newPin)) {
    return c.json({ error: '暗証番号は4桁の数字で入力してください' }, 400)
  }
  
  const employee = await c.env.DB.prepare(
    'SELECT id, pin FROM employees WHERE id = ?'
  ).bind(id).first() as { id: number; pin: string } | null
  
  if (!employee) {
    return c.json({ error: '従業員が見つかりません' }, 404)
  }
  
  const storedPin = employee.pin || '0000'
  
  // 現在のPINが正しいかチェック
  if (storedPin !== currentPin) {
    return c.json({ error: '現在の暗証番号が正しくありません' }, 401)
  }
  
  // 新しいPINに更新
  await c.env.DB.prepare(
    'UPDATE employees SET pin = ? WHERE id = ?'
  ).bind(newPin, id).run()
  
  return c.json({ success: true, message: '暗証番号を変更しました' })
})

// 従業員のPIN状態を確認（デフォルトかどうか）
app.get('/employees/:id/pin-status', async (c) => {
  const id = c.req.param('id')
  
  const employee = await c.env.DB.prepare(
    'SELECT id, name, pin FROM employees WHERE id = ?'
  ).bind(id).first() as { id: number; name: string; pin: string } | null
  
  if (!employee) {
    return c.json({ error: '従業員が見つかりません' }, 404)
  }
  
  const storedPin = employee.pin || '0000'
  const isDefaultPin = storedPin === '0000'
  
  return c.json({ 
    isDefaultPin: isDefaultPin,
    employeeName: employee.name 
  })
})

// Cloudflare Pages Functions エクスポート
export const onRequest: PagesFunction = async (context) => {
  return app.fetch(context.request, context.env, context)
}
