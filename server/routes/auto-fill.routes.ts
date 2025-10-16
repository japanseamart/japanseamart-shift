import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';
import db from '../database.js';

const router = Router();

router.post('/auto-fill-requests', requireAuth, (req, res) => {
  const { store_id, week_start_date } = req.body;
  
  // 店舗管理者は自店舗のみ
  if (req.session?.role === 'store_manager' && req.session?.storeId !== store_id) {
    return res.status(403).json({ error: '他店舗のシフトは作成できません' });
  }
  
  try {
    // 週の開始日から7日分の日付を生成
    const startDate = new Date(week_start_date);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    // 対象週のシフト希望を取得
    const requests = db.prepare(`
      SELECT sr.*, e.hourly_wage, e.employment_type 
      FROM shift_requests sr
      JOIN employees e ON sr.employee_id = e.id
      WHERE sr.store_id = ? AND sr.date IN (${dates.map(() => '?').join(',')})
    `).all(store_id, ...dates) as any[];
    
    let createdCount = 0;
    const errors: string[] = [];
    
    requests.forEach(request => {
      try {
        const patterns = JSON.parse(request.patterns);
        
        // カスタム時間がある場合はそれを使用
        let startTime = request.custom_start;
        let endTime = request.custom_end;
        
        // カスタム時間がない場合は、最初のパターンを使用
        if (!startTime || !endTime) {
          // 店舗情報を取得してデフォルト時間を設定
          const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id) as any;
          
          if (patterns.includes('morning')) {
            startTime = store.morning_start;
            endTime = store.morning_end;
          } else if (patterns.includes('afternoon')) {
            startTime = store.afternoon_start;
            endTime = store.afternoon_end;
          } else if (patterns.includes('evening')) {
            startTime = store.evening_start;
            endTime = store.evening_end;
          } else if (patterns.includes('full')) {
            startTime = store.business_hours_start;
            endTime = store.business_hours_end;
          } else if (patterns.includes('off')) {
            // 休み希望はスキップ
            return;
          } else {
            return; // パターンが不明な場合はスキップ
          }
        }
        
        // 既に同じ日にシフトが存在するかチェック
        const existingShift = db.prepare(
          'SELECT id FROM shifts WHERE employee_id = ? AND date = ?'
        ).get(request.employee_id, request.date);
        
        if (existingShift) {
          return; // 既存シフトがある場合はスキップ
        }
        
        // 休憩時間を自動計算（6時間以上は60分）
        const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
        const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
        const workMinutes = endMinutes - startMinutes;
        const breakMinutes = workMinutes >= 360 ? 60 : 0;
        
        // 人件費計算
        let laborCost = 0;
        if (request.employment_type !== 'full_time' && request.hourly_wage) {
          const actualWorkMinutes = workMinutes - breakMinutes;
          const hours = Math.ceil(actualWorkMinutes / 30) * 0.5;
          
          let hourlyRate = request.hourly_wage;
          
          // 曜日・祝日加算
          const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id) as any;
          const dayOfWeek = new Date(request.date).getDay();
          
          if (store.overtime_rate_enabled) {
            if (dayOfWeek === 6 && store.saturday_rate > 0) {
              hourlyRate += store.saturday_rate;
            } else if (dayOfWeek === 0 && store.sunday_rate > 0) {
              hourlyRate += store.sunday_rate;
            }
          }
          
          const specialDay = db.prepare('SELECT * FROM special_days WHERE date = ?').get(request.date) as any;
          if (specialDay && store.overtime_rate_enabled && store.holiday_rate > 0) {
            hourlyRate += store.holiday_rate;
          }
          
          laborCost = hours * hourlyRate;
        }
        
        // シフトを作成
        db.prepare(`
          INSERT INTO shifts (employee_id, store_id, date, start_time, end_time, break_minutes, labor_cost)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(request.employee_id, store_id, request.date, startTime, endTime, breakMinutes, laborCost);
        
        createdCount++;
      } catch (error: any) {
        errors.push(`${request.date}: ${error.message}`);
      }
    });
    
    res.json({ 
      success: true, 
      createdCount,
      totalRequests: requests.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('自動反映エラー:', error);
    res.status(500).json({ error: 'シフト希望の自動反映に失敗しました' });
  }
});

export default router;
