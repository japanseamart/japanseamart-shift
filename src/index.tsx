import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// 型定義
type Store = {
  id: number
  name: string
  address: string
  created_at: string
}

type Employee = {
  id: number
  name: string
  hourly_rate: number
  store_ids: number[]
  created_at: string
}

type Shift = {
  id: number
  employee_id: number
  store_id: number
  date: string
  start_time: string
  end_time: string
  created_at: string
}

type ShiftRequest = {
  id: number
  employee_id: number
  store_id: number
  date: string
  time_period: 'morning' | 'afternoon' | 'evening' | 'night' | 'allday'
  request_type: 'work' | 'off'
  created_at: string
  status: 'pending' | 'approved' | 'rejected'
}

const app = new Hono()

// CORS設定
app.use('/api/*', cors())

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './public' }))

// データベース（メモリベース）
let stores: Store[] = [
  { id: 1, name: "本店", address: "東京都中央区築地1-1-1", created_at: new Date().toISOString() },
  { id: 2, name: "新橋店", address: "東京都港区新橋2-2-2", created_at: new Date().toISOString() },
  { id: 3, name: "銀座店", address: "東京都中央区銀座3-3-3", created_at: new Date().toISOString() },
  { id: 4, name: "渋谷店", address: "東京都渋谷区渋谷4-4-4", created_at: new Date().toISOString() },
  { id: 5, name: "新宿店", address: "東京都新宿区新宿5-5-5", created_at: new Date().toISOString() },
  { id: 6, name: "池袋店", address: "東京都豊島区池袋6-6-6", created_at: new Date().toISOString() },
  { id: 7, name: "上野店", address: "東京都台東区上野7-7-7", created_at: new Date().toISOString() }
]

let employees: Employee[] = [
  { id: 1, name: "田中太郎", hourly_rate: 1200, store_ids: [1, 2], created_at: new Date().toISOString() },
  { id: 2, name: "佐藤花子", hourly_rate: 1100, store_ids: [1], created_at: new Date().toISOString() },
  { id: 3, name: "鈴木次郎", hourly_rate: 1300, store_ids: [2, 3], created_at: new Date().toISOString() },
  { id: 4, name: "山田美咲", hourly_rate: 1000, store_ids: [3], created_at: new Date().toISOString() },
  { id: 5, name: "加藤健一", hourly_rate: 1400, store_ids: [4, 5], created_at: new Date().toISOString() }
]

let shifts: Shift[] = []
let shiftRequests: ShiftRequest[] = []

// HTMLテンプレート作成関数
const createHtmlTemplate = (title: string, bodyContent: string) => `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        [v-cloak] { display: none; }
        .gantt-grid {
            display: grid;
            grid-template-columns: 150px repeat(40, 30px);
            gap: 1px;
            background: #e5e7eb;
            border: 1px solid #d1d5db;
        }
        .time-slot {
            height: 50px;
            background: white;
            border-right: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
        }
        .employee-row {
            height: 50px;
            background: #f9fafb;
            display: flex;
            align-items: center;
            padding-left: 8px;
            font-weight: 500;
            border-bottom: 1px solid #e5e7eb;
        }
        .shift-bar {
            height: 46px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 500;
            color: white;
            margin: 2px 0;
            cursor: pointer;
            position: relative;
        }
        .time-morning { background: linear-gradient(45deg, #f59e0b, #f97316); }
        .time-lunch { background: linear-gradient(45deg, #059669, #10b981); }
        .time-evening { background: linear-gradient(45deg, #3b82f6, #6366f1); }
        .time-night { background: linear-gradient(45deg, #7c3aed, #8b5cf6); }
    </style>
</head>
<body class="bg-gray-100">
    ${bodyContent}
</body>
</html>`

// メインページ（管理者用）
app.get('/', (c) => {
  const bodyContent = `
    <div id="app" v-cloak>
      <!-- ヘッダー -->
      <header class="bg-blue-600 text-white p-4 shadow-lg">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold">
              <i class="fas fa-calendar-alt mr-2"></i>
              シフト管理システム
            </h1>
            <p class="text-blue-200">{{ selectedStore ? selectedStore.name : '店舗を選択してください' }}</p>
          </div>
          <div class="text-right">
            <p class="text-sm">{{ currentDate }}</p>
            <p class="text-xs text-blue-200">7店舗対応版</p>
          </div>
        </div>
      </header>

      <div class="flex h-screen">
        <!-- サイドバー -->
        <aside class="w-64 bg-white shadow-lg">
          <div class="p-4">
            <h2 class="text-lg font-semibold mb-4">店舗一覧</h2>
            <ul class="space-y-2">
              <li v-for="store in stores" :key="store.id">
                <button 
                  @click="selectStore(store)"
                  :class="[
                    'w-full text-left p-3 rounded-lg transition-colors',
                    selectedStore && selectedStore.id === store.id ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-500' : 'hover:bg-gray-50'
                  ]"
                >
                  <i class="fas fa-store mr-2"></i>{{ store.name }}
                  <div class="text-xs text-gray-500 mt-1">{{ store.address }}</div>
                </button>
              </li>
            </ul>
          </div>

          <div class="p-4 border-t">
            <h3 class="font-semibold mb-3">機能メニュー</h3>
            <ul class="space-y-2">
              <li>
                <button 
                  @click="currentView = 'gantt'"
                  :class="[
                    'w-full text-left p-2 rounded transition-colors',
                    currentView === 'gantt' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-50'
                  ]"
                >
                  <i class="fas fa-chart-gantt mr-2"></i>ガントチャート
                </button>
              </li>
              <li>
                <button 
                  @click="currentView = 'employees'"
                  :class="[
                    'w-full text-left p-2 rounded transition-colors',
                    currentView === 'employees' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-50'
                  ]"
                >
                  <i class="fas fa-users mr-2"></i>従業員管理
                </button>
              </li>
              <li>
                <button 
                  @click="currentView = 'reports'"
                  :class="[
                    'w-full text-left p-2 rounded transition-colors',
                    currentView === 'reports' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-50'
                  ]"
                >
                  <i class="fas fa-chart-bar mr-2"></i>レポート
                </button>
              </li>
            </ul>
          </div>
          
          <div class="p-4 border-t">
            <h3 class="font-semibold mb-3">従業員用ページ</h3>
            <a href="/employee" class="block w-full text-left p-2 rounded transition-colors hover:bg-gray-50">
              <i class="fas fa-eye mr-2"></i>シフト閲覧
            </a>
            <a href="/request" class="block w-full text-left p-2 rounded transition-colors hover:bg-gray-50 mt-2">
              <i class="fas fa-paper-plane mr-2"></i>シフト希望提出
            </a>
          </div>
        </aside>

        <!-- メインコンテンツ -->
        <main class="flex-1 p-6 overflow-auto">
          <!-- ガントチャート表示 -->
          <div v-if="currentView === 'gantt'" class="space-y-6">
            <div class="flex justify-between items-center">
              <h2 class="text-2xl font-bold">ガントチャート - {{ selectedDate }}</h2>
              <div class="flex space-x-2">
                <input 
                  type="date" 
                  v-model="selectedDate"
                  @change="loadShifts"
                  class="border rounded px-3 py-2"
                >
                <button 
                  @click="openShiftModal()"
                  class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  <i class="fas fa-plus mr-2"></i>シフト追加
                </button>
              </div>
            </div>

            <div class="bg-white rounded-lg shadow overflow-x-auto">
              <div class="gantt-grid min-w-max">
                <!-- ヘッダー行 -->
                <div class="employee-row font-bold">従業員</div>
                <div v-for="slot in timeSlots" :key="slot" class="time-slot">
                  {{ slot }}
                </div>

                <!-- 従業員ごとの行 -->
                <template v-for="employee in storeEmployees" :key="employee.id">
                  <div class="employee-row">
                    {{ employee.name }}
                    <div class="text-xs text-gray-500 ml-2">¥{{ employee.hourly_rate }}/h</div>
                  </div>
                  <!-- シフト表示エリア -->
                  <div v-for="slot in timeSlots" :key="employee.id + '-' + slot" class="time-slot relative">
                    <div 
                      v-for="shift in getShiftsForEmployeeAtSlot(employee.id, slot)" 
                      :key="shift.id"
                      :class="['shift-bar', getTimeColorClass(shift.start_time)]"
                      @click="openShiftModal(shift)"
                      :title="shift.start_time + '-' + shift.end_time + ' (¥' + calculateShiftWage(shift) + ')'"
                    >
                      {{ shift.start_time.substr(0,5) }}-{{ shift.end_time.substr(0,5) }}
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- 従業員管理表示 -->
          <div v-if="currentView === 'employees'" class="space-y-6">
            <div class="flex justify-between items-center">
              <h2 class="text-2xl font-bold">従業員管理</h2>
              <button 
                @click="openEmployeeModal()"
                class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                <i class="fas fa-user-plus mr-2"></i>従業員追加
              </button>
            </div>

            <div class="bg-white rounded-lg shadow overflow-hidden">
              <table class="min-w-full">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">時間単価</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">担当店舗</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="employee in employees" :key="employee.id">
                    <td class="px-6 py-4 whitespace-nowrap">{{ employee.name }}</td>
                    <td class="px-6 py-4 whitespace-nowrap">¥{{ employee.hourly_rate }}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <span v-for="storeId in employee.store_ids" :key="storeId" class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-1">
                        {{ getStoreName(storeId) }}
                      </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <button @click="openEmployeeModal(employee)" class="text-blue-600 hover:text-blue-800 mr-2">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button @click="deleteEmployee(employee.id)" class="text-red-600 hover:text-red-800">
                        <i class="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- レポート表示 -->
          <div v-if="currentView === 'reports'" class="space-y-6">
            <div class="flex justify-between items-center">
              <h2 class="text-2xl font-bold">月間レポート</h2>
              <button @click="loadMonthlyReport()" class="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
                <i class="fas fa-refresh mr-2"></i>更新
              </button>
            </div>
            
            <div v-if="monthlyReport" class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="bg-white p-6 rounded-lg shadow">
                <h3 class="text-lg font-semibold mb-2">総人件費</h3>
                <p class="text-3xl font-bold text-red-600">¥{{ monthlyReport.total_labor_cost ? monthlyReport.total_labor_cost.toLocaleString() : 0 }}</p>
              </div>
              <div class="bg-white p-6 rounded-lg shadow">
                <h3 class="text-lg font-semibold mb-2">総労働時間</h3>
                <p class="text-3xl font-bold text-green-600">{{ monthlyReport.total_hours || 0 }}時間</p>
              </div>
              <div class="bg-white p-6 rounded-lg shadow">
                <h3 class="text-lg font-semibold mb-2">従業員数</h3>
                <p class="text-3xl font-bold text-blue-600">{{ monthlyReport.employee_count || 0 }}人</p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- 従業員追加/編集モーダル -->
      <div v-if="showEmployeeModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg max-w-md w-full mx-4">
          <h3 class="text-lg font-semibold mb-4">{{ editingEmployee.id ? '従業員編集' : '従業員追加' }}</h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">名前</label>
              <input type="text" v-model="editingEmployee.name" class="w-full border rounded px-3 py-2">
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-1">時間単価 (円)</label>
              <input type="number" v-model.number="editingEmployee.hourly_rate" class="w-full border rounded px-3 py-2">
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-1">担当店舗</label>
              <div class="space-y-2">
                <label v-for="store in stores" :key="store.id" class="flex items-center">
                  <input type="checkbox" :value="store.id" v-model="editingEmployee.store_ids" class="mr-2">
                  {{ store.name }}
                </label>
              </div>
            </div>
          </div>
          
          <div class="flex space-x-2 mt-6">
            <button @click="saveEmployee()" class="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700">
              {{ editingEmployee.id ? '更新' : '追加' }}
            </button>
            <button @click="showEmployeeModal = false" class="px-4 py-2 border rounded hover:bg-gray-50">
              キャンセル
            </button>
          </div>
        </div>
      </div>

      <!-- シフト追加/編集モーダル -->
      <div v-if="showShiftModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg max-w-md w-full mx-4">
          <h3 class="text-lg font-semibold mb-4">{{ editingShift.id ? 'シフト編集' : 'シフト追加' }}</h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">従業員</label>
              <select v-model="editingShift.employee_id" class="w-full border rounded px-3 py-2">
                <option value="">選択してください</option>
                <option v-for="employee in storeEmployees" :key="employee.id" :value="employee.id">
                  {{ employee.name }} (¥{{ employee.hourly_rate }}/h)
                </option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-1">日付</label>
              <input type="date" v-model="editingShift.date" class="w-full border rounded px-3 py-2">
            </div>
            
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">開始時刻</label>
                <select v-model="editingShift.start_time" class="w-full border rounded px-3 py-2">
                  <option v-for="time in timeSlots" :key="time" :value="time">{{ time }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">終了時刻</label>
                <select v-model="editingShift.end_time" class="w-full border rounded px-3 py-2">
                  <option v-for="time in timeSlots" :key="time" :value="time">{{ time }}</option>
                </select>
              </div>
            </div>
            
            <div v-if="editingShift.employee_id && editingShift.start_time && editingShift.end_time" class="p-3 bg-gray-50 rounded">
              <p class="text-sm">予想給与: <span class="font-bold">¥{{ calculateEstimatedWage() }}</span></p>
            </div>
          </div>
          
          <div class="flex space-x-2 mt-6">
            <button @click="saveShift()" class="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
              {{ editingShift.id ? '更新' : '追加' }}
            </button>
            <button @click="showShiftModal = false" class="px-4 py-2 border rounded hover:bg-gray-50">
              キャンセル
            </button>
            <button v-if="editingShift.id" @click="deleteShift(editingShift.id)" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
              削除
            </button>
          </div>
        </div>
      </div>
    </div>

    <script>
      ${getMainAppScript()}
    </script>`

  return new Response(createHtmlTemplate('シフト管理システム', bodyContent), {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  })
})

// メインアプリのJavaScript
const getMainAppScript = () => `
const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    // データ
    const stores = ref([])
    const employees = ref([])
    const shifts = ref([])
    const selectedStore = ref(null)
    const selectedDate = ref(new Date().toISOString().split('T')[0])
    const currentView = ref('gantt')
    
    // モーダル制御
    const showEmployeeModal = ref(false)
    const showShiftModal = ref(false)
    const editingEmployee = ref({})
    const editingShift = ref({})
    const monthlyReport = ref(null)

    // 時間スロット（30分間隔、4:00-23:00）
    const timeSlots = computed(() => {
      const slots = []
      for (let hour = 4; hour <= 23; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const time = hour.toString().padStart(2, '0') + ':' + minute.toString().padStart(2, '0')
          slots.push(time)
        }
      }
      return slots
    })

    // 選択店舗の従業員
    const storeEmployees = computed(() => {
      if (!selectedStore.value) return []
      return employees.value.filter(emp => 
        emp.store_ids && emp.store_ids.includes(selectedStore.value.id)
      )
    })

    const currentDate = computed(() => {
      return new Date().toLocaleDateString('ja-JP')
    })

    // API関数
    const api = {
      async get(url) {
        const response = await fetch('/api' + url)
        return response.json()
      },
      
      async post(url, data) {
        const response = await fetch('/api' + url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        return response.json()
      },
      
      async put(url, data) {
        const response = await fetch('/api' + url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        return response.json()
      },
      
      async delete(url) {
        const response = await fetch('/api' + url, { method: 'DELETE' })
        return response.json()
      }
    }

    // データ読み込み
    const loadStores = async () => {
      stores.value = await api.get('/stores')
      if (stores.value.length > 0 && !selectedStore.value) {
        selectedStore.value = stores.value[0]
      }
    }

    const loadEmployees = async () => {
      employees.value = await api.get('/employees')
    }

    const loadShifts = async () => {
      if (!selectedStore.value) return
      shifts.value = await api.get('/shifts?store_id=' + selectedStore.value.id + '&date=' + selectedDate.value)
    }

    const loadMonthlyReport = async () => {
      if (!selectedStore.value) return
      const month = selectedDate.value.substring(0, 7)
      monthlyReport.value = await api.get('/labor-cost/' + selectedStore.value.id + '/' + month)
    }

    // 店舗選択
    const selectStore = async (store) => {
      selectedStore.value = store
      await loadShifts()
      await loadMonthlyReport()
    }

    // 従業員管理
    const openEmployeeModal = (employee = null) => {
      if (employee) {
        editingEmployee.value = { ...employee }
      } else {
        editingEmployee.value = {
          name: '',
          hourly_rate: 1000,
          store_ids: selectedStore.value ? [selectedStore.value.id] : []
        }
      }
      showEmployeeModal.value = true
    }

    const saveEmployee = async () => {
      try {
        if (editingEmployee.value.id) {
          await api.put('/employees/' + editingEmployee.value.id, editingEmployee.value)
        } else {
          await api.post('/employees', editingEmployee.value)
        }
        await loadEmployees()
        showEmployeeModal.value = false
      } catch (error) {
        alert('従業員の保存に失敗しました')
      }
    }

    const deleteEmployee = async (employeeId) => {
      if (!confirm('この従業員を削除しますか？')) return
      
      try {
        await api.delete('/employees/' + employeeId)
        await loadEmployees()
        await loadShifts()
      } catch (error) {
        alert('従業員の削除に失敗しました')
      }
    }

    // シフト管理
    const openShiftModal = (shift = null) => {
      if (shift) {
        editingShift.value = { ...shift }
      } else {
        editingShift.value = {
          employee_id: '',
          store_id: selectedStore.value ? selectedStore.value.id : '',
          date: selectedDate.value,
          start_time: '09:00',
          end_time: '17:00'
        }
      }
      showShiftModal.value = true
    }

    const saveShift = async () => {
      try {
        if (editingShift.value.id) {
          await api.put('/shifts/' + editingShift.value.id, editingShift.value)
        } else {
          const result = await api.post('/shifts', editingShift.value)
          if (result.error) {
            alert(result.error)
            return
          }
        }
        await loadShifts()
        showShiftModal.value = false
      } catch (error) {
        alert('シフトの保存に失敗しました')
      }
    }

    const deleteShift = async (shiftId) => {
      if (!confirm('このシフトを削除しますか？')) return
      
      try {
        await api.delete('/shifts/' + shiftId)
        await loadShifts()
        showShiftModal.value = false
      } catch (error) {
        alert('シフトの削除に失敗しました')
      }
    }

    // 給与計算
    const calculateShiftWage = (shift) => {
      const employee = employees.value.find(emp => emp.id === shift.employee_id)
      if (!employee) return 0

      const startTime = new Date('2000-01-01 ' + shift.start_time)
      const endTime = new Date('2000-01-01 ' + shift.end_time)
      const hours = (endTime - startTime) / (1000 * 60 * 60)
      
      return Math.round(hours * employee.hourly_rate)
    }

    const calculateEstimatedWage = () => {
      if (!editingShift.value.employee_id || !editingShift.value.start_time || !editingShift.value.end_time) return 0
      
      const employee = employees.value.find(emp => emp.id == editingShift.value.employee_id)
      if (!employee) return 0

      const startTime = new Date('2000-01-01 ' + editingShift.value.start_time)
      const endTime = new Date('2000-01-01 ' + editingShift.value.end_time)
      const hours = (endTime - startTime) / (1000 * 60 * 60)
      
      return Math.round(hours * employee.hourly_rate)
    }

    // ガントチャート表示用
    const getShiftsForEmployeeAtSlot = (employeeId, timeSlot) => {
      return shifts.value.filter(shift => {
        if (shift.employee_id !== employeeId) return false
        if (shift.date !== selectedDate.value) return false
        if (shift.store_id !== selectedStore.value.id) return false
        
        return timeSlot >= shift.start_time && timeSlot < shift.end_time
      })
    }

    const getTimeColorClass = (startTime) => {
      const hour = parseInt(startTime.split(':')[0])
      if (hour >= 4 && hour < 11) return 'time-morning'
      if (hour >= 11 && hour < 14) return 'time-lunch'
      if (hour >= 14 && hour < 18) return 'time-evening'
      return 'time-night'
    }

    const getStoreName = (storeId) => {
      const store = stores.value.find(s => s.id === storeId)
      return store ? store.name : ''
    }

    // 初期化
    onMounted(async () => {
      await loadStores()
      await loadEmployees()
      await loadShifts()
      await loadMonthlyReport()
    })

    return {
      stores,
      employees,
      shifts,
      selectedStore,
      selectedDate,
      currentView,
      showEmployeeModal,
      showShiftModal,
      editingEmployee,
      editingShift,
      monthlyReport,
      timeSlots,
      storeEmployees,
      currentDate,
      selectStore,
      openEmployeeModal,
      saveEmployee,
      deleteEmployee,
      openShiftModal,
      saveShift,
      deleteShift,
      calculateShiftWage,
      calculateEstimatedWage,
      getShiftsForEmployeeAtSlot,
      getTimeColorClass,
      getStoreName,
      loadShifts,
      loadMonthlyReport
    }
  }
}).mount('#app')`

// 従業員閲覧ページ（金額非表示）
app.get('/employee', (c) => {
  const bodyContent = `
    <div id="employee-app" v-cloak>
      <header class="bg-green-600 text-white p-4 shadow-lg">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold">
              <i class="fas fa-calendar-check mr-2"></i>
              シフト閲覧 - 従業員用
            </h1>
            <p class="text-green-200">自分のシフトスケジュールを確認できます</p>
          </div>
          <div class="text-right">
            <p class="text-sm">{{ currentDate }}</p>
            <div class="flex space-x-2 mt-2">
              <a href="/" class="text-green-200 hover:text-white text-sm">
                <i class="fas fa-cog mr-1"></i>管理画面
              </a>
              <a href="/request" class="text-green-200 hover:text-white text-sm">
                <i class="fas fa-paper-plane mr-1"></i>シフト希望
              </a>
            </div>
          </div>
        </div>
      </header>

      <div class="container mx-auto p-6">
        <div class="bg-white rounded-lg shadow-lg">
          <div class="p-6">
            <div class="mb-6">
              <h2 class="text-xl font-semibold mb-4">従業員選択</h2>
              <select v-model="selectedEmployeeId" @change="loadEmployeeShifts" class="w-full max-w-md border rounded px-3 py-2">
                <option value="">従業員を選択してください</option>
                <option v-for="employee in employees" :key="employee.id" :value="employee.id">
                  {{ employee.name }}
                </option>
              </select>
            </div>

            <div v-if="selectedEmployee" class="mb-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold">{{ selectedEmployee.name }}さんのシフト - {{ selectedMonth }}</h3>
                <input 
                  type="month" 
                  v-model="selectedMonth"
                  @change="loadEmployeeShifts"
                  class="border rounded px-3 py-2"
                >
              </div>

              <div v-if="employeeShifts.length > 0" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div v-for="shift in employeeShifts" :key="shift.id" class="border rounded-lg p-4">
                    <div class="flex items-center justify-between mb-2">
                      <span class="font-semibold text-lg">{{ formatDate(shift.date) }}</span>
                      <span class="text-sm px-2 py-1 rounded" :class="getTimeColorClass(shift.start_time)">
                        {{ getTimeCategory(shift.start_time) }}
                      </span>
                    </div>
                    <div class="text-gray-600">
                      <div class="flex items-center mb-1">
                        <i class="fas fa-clock mr-2"></i>
                        {{ shift.start_time.substr(0,5) }} - {{ shift.end_time.substr(0,5) }}
                      </div>
                      <div class="flex items-center mb-1">
                        <i class="fas fa-store mr-2"></i>
                        {{ getStoreName(shift.store_id) }}
                      </div>
                      <div class="flex items-center text-sm text-gray-500">
                        <i class="fas fa-hourglass-half mr-2"></i>
                        {{ calculateWorkHours(shift) }}時間
                      </div>
                    </div>
                  </div>
                </div>

                <div class="mt-8 p-4 bg-gray-50 rounded-lg">
                  <h4 class="font-semibold mb-2">月間サマリー</h4>
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div class="text-2xl font-bold text-blue-600">{{ totalWorkDays }}</div>
                      <div class="text-sm text-gray-500">勤務日数</div>
                    </div>
                    <div>
                      <div class="text-2xl font-bold text-green-600">{{ totalWorkHours }}</div>
                      <div class="text-sm text-gray-500">総労働時間</div>
                    </div>
                    <div>
                      <div class="text-2xl font-bold text-purple-600">{{ averageHoursPerDay }}</div>
                      <div class="text-sm text-gray-500">平均時間/日</div>
                    </div>
                    <div>
                      <div class="text-2xl font-bold text-orange-600">{{ storeCount }}</div>
                      <div class="text-sm text-gray-500">勤務店舗数</div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="text-center py-8 text-gray-500">
                <i class="fas fa-calendar-times text-4xl mb-4"></i>
                <p>この月のシフトはありません</p>
              </div>
            </div>

            <div v-if="!selectedEmployeeId" class="text-center py-12 text-gray-500">
              <i class="fas fa-user-circle text-6xl mb-4"></i>
              <p class="text-lg">従業員を選択してシフトを確認してください</p>
            </div>
          </div>
        </div>
      </div>

      <script>
        ${getEmployeeAppScript()}
      </script>
    </div>`

  return new Response(createHtmlTemplate('シフト閲覧 - 従業員用', bodyContent), {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  })
})

// 従業員アプリのJavaScript
const getEmployeeAppScript = () => `
const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    const employees = ref([])
    const employeeShifts = ref([])
    const stores = ref([])
    const selectedEmployeeId = ref('')
    const selectedMonth = ref(new Date().toISOString().substr(0, 7))
    
    const selectedEmployee = computed(() => {
      return employees.value.find(emp => emp.id == selectedEmployeeId.value)
    })

    const currentDate = computed(() => {
      return new Date().toLocaleDateString('ja-JP')
    })

    const totalWorkDays = computed(() => {
      return employeeShifts.value.length
    })

    const totalWorkHours = computed(() => {
      return employeeShifts.value.reduce((total, shift) => {
        return total + calculateWorkHours(shift)
      }, 0).toFixed(1)
    })

    const averageHoursPerDay = computed(() => {
      if (employeeShifts.value.length === 0) return 0
      return (totalWorkHours.value / employeeShifts.value.length).toFixed(1)
    })

    const storeCount = computed(() => {
      const uniqueStores = new Set(employeeShifts.value.map(shift => shift.store_id))
      return uniqueStores.size
    })

    const api = {
      async get(url) {
        const response = await fetch('/api' + url)
        return response.json()
      }
    }

    const loadEmployees = async () => {
      employees.value = await api.get('/employees')
    }

    const loadStores = async () => {
      stores.value = await api.get('/stores')
    }

    const loadEmployeeShifts = async () => {
      if (!selectedEmployeeId.value) {
        employeeShifts.value = []
        return
      }
      
      employeeShifts.value = await api.get('/shifts?employee_id=' + selectedEmployeeId.value + '&month=' + selectedMonth.value)
      employeeShifts.value.sort((a, b) => new Date(a.date) - new Date(b.date))
    }

    const calculateWorkHours = (shift) => {
      const startTime = new Date('2000-01-01 ' + shift.start_time)
      const endTime = new Date('2000-01-01 ' + shift.end_time)
      const hours = (endTime - startTime) / (1000 * 60 * 60)
      return hours.toFixed(1)
    }

    const formatDate = (dateString) => {
      const date = new Date(dateString)
      return date.toLocaleDateString('ja-JP', { 
        month: 'short', 
        day: 'numeric',
        weekday: 'short'
      })
    }

    const getTimeCategory = (startTime) => {
      const hour = parseInt(startTime.split(':')[0])
      if (hour >= 4 && hour < 11) return '朝'
      if (hour >= 11 && hour < 14) return '昼'
      if (hour >= 14 && hour < 18) return '夕方'
      return '夜'
    }

    const getTimeColorClass = (startTime) => {
      const hour = parseInt(startTime.split(':')[0])
      if (hour >= 4 && hour < 11) return 'bg-orange-100 text-orange-800'
      if (hour >= 11 && hour < 14) return 'bg-green-100 text-green-800'
      if (hour >= 14 && hour < 18) return 'bg-blue-100 text-blue-800'
      return 'bg-purple-100 text-purple-800'
    }

    const getStoreName = (storeId) => {
      const store = stores.value.find(s => s.id === storeId)
      return store ? store.name : ''
    }

    onMounted(async () => {
      await loadStores()
      await loadEmployees()
    })

    return {
      employees,
      employeeShifts,
      stores,
      selectedEmployeeId,
      selectedMonth,
      selectedEmployee,
      currentDate,
      totalWorkDays,
      totalWorkHours,
      averageHoursPerDay,
      storeCount,
      loadEmployeeShifts,
      calculateWorkHours,
      formatDate,
      getTimeCategory,
      getTimeColorClass,
      getStoreName
    }
  }
}).mount('#employee-app')`

// シフト希望提出ページ
app.get('/request', (c) => {
  const bodyContent = `
    <div id="request-app" v-cloak>
      <header class="bg-purple-600 text-white p-4 shadow-lg">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-2xl font-bold">
              <i class="fas fa-paper-plane mr-2"></i>
              シフト希望提出
            </h1>
            <p class="text-purple-200">勤務希望・休み希望を提出してください</p>
          </div>
          <div class="text-right">
            <p class="text-sm">{{ currentDate }}</p>
            <div class="flex space-x-2 mt-2">
              <a href="/" class="text-purple-200 hover:text-white text-sm">
                <i class="fas fa-cog mr-1"></i>管理画面
              </a>
              <a href="/employee" class="text-purple-200 hover:text-white text-sm">
                <i class="fas fa-calendar-check mr-1"></i>シフト確認
              </a>
            </div>
          </div>
        </div>
      </header>

      <div class="container mx-auto p-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- 希望提出フォーム -->
          <div class="bg-white rounded-lg shadow-lg p-6">
            <h2 class="text-xl font-semibold mb-4">
              <i class="fas fa-plus-circle mr-2 text-purple-600"></i>
              新しい希望を提出
            </h2>
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">従業員名</label>
                <select v-model="newRequest.employee_id" class="w-full border rounded px-3 py-2">
                  <option value="">選択してください</option>
                  <option v-for="employee in employees" :key="employee.id" :value="employee.id">
                    {{ employee.name }}
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">店舗</label>
                <select v-model="newRequest.store_id" class="w-full border rounded px-3 py-2">
                  <option value="">選択してください</option>
                  <option v-for="store in stores" :key="store.id" :value="store.id">
                    {{ store.name }}
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">日付</label>
                <input type="date" v-model="newRequest.date" class="w-full border rounded px-3 py-2">
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">時間帯</label>
                <select v-model="newRequest.time_period" class="w-full border rounded px-3 py-2">
                  <option value="">選択してください</option>
                  <option value="morning">午前 (4:00-11:00)</option>
                  <option value="afternoon">午後 (11:00-14:00)</option>
                  <option value="evening">夕方 (14:00-18:00)</option>
                  <option value="night">夜 (18:00-23:00)</option>
                  <option value="allday">終日 (4:00-23:00)</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">希望種別</label>
                <div class="space-y-2">
                  <label class="flex items-center">
                    <input type="radio" v-model="newRequest.request_type" value="work" class="mr-2">
                    <span class="text-green-700">
                      <i class="fas fa-check-circle mr-1"></i>勤務希望
                    </span>
                  </label>
                  <label class="flex items-center">
                    <input type="radio" v-model="newRequest.request_type" value="off" class="mr-2">
                    <span class="text-red-700">
                      <i class="fas fa-times-circle mr-1"></i>休み希望
                    </span>
                  </label>
                </div>
              </div>

              <button 
                @click="submitRequest"
                class="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700"
                :disabled="!isFormValid"
                :class="!isFormValid ? 'opacity-50 cursor-not-allowed' : ''"
              >
                <i class="fas fa-paper-plane mr-2"></i>
                希望を提出
              </button>
            </div>
          </div>

          <!-- 提出済み希望一覧 -->
          <div class="bg-white rounded-lg shadow-lg p-6">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-semibold">
                <i class="fas fa-list mr-2 text-purple-600"></i>
                提出済み希望
              </h2>
              <div class="flex space-x-2">
                <select v-model="filterEmployee" @change="loadRequests" class="border rounded px-2 py-1 text-sm">
                  <option value="">全従業員</option>
                  <option v-for="employee in employees" :key="employee.id" :value="employee.id">
                    {{ employee.name }}
                  </option>
                </select>
                <select v-model="filterStatus" @change="loadRequests" class="border rounded px-2 py-1 text-sm">
                  <option value="">全ステータス</option>
                  <option value="pending">審査中</option>
                  <option value="approved">承認</option>
                  <option value="rejected">却下</option>
                </select>
              </div>
            </div>

            <div class="space-y-3 max-h-96 overflow-y-auto">
              <div v-for="request in shiftRequests" :key="request.id" class="border rounded-lg p-3">
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <span class="font-semibold">{{ getEmployeeName(request.employee_id) }}</span>
                    <span class="text-sm text-gray-500 ml-2">{{ getStoreName(request.store_id) }}</span>
                  </div>
                  <span 
                    class="text-xs px-2 py-1 rounded"
                    :class="getStatusClass(request.status)"
                  >
                    {{ getStatusText(request.status) }}
                  </span>
                </div>
                
                <div class="text-sm text-gray-600">
                  <div class="flex items-center mb-1">
                    <i class="fas fa-calendar mr-2"></i>
                    {{ formatDate(request.date) }}
                  </div>
                  <div class="flex items-center mb-1">
                    <i class="fas fa-clock mr-2"></i>
                    {{ getTimePeriodText(request.time_period) }}
                  </div>
                  <div class="flex items-center">
                    <i :class="request.request_type === 'work' ? 'fas fa-check-circle text-green-500' : 'fas fa-times-circle text-red-500'" class="mr-2"></i>
                    {{ request.request_type === 'work' ? '勤務希望' : '休み希望' }}
                  </div>
                </div>

                <div v-if="request.status === 'pending'" class="flex space-x-2 mt-3">
                  <button 
                    @click="updateRequestStatus(request.id, 'approved')"
                    class="flex-1 bg-green-500 text-white text-xs py-1 rounded hover:bg-green-600"
                  >
                    承認
                  </button>
                  <button 
                    @click="updateRequestStatus(request.id, 'rejected')"
                    class="flex-1 bg-red-500 text-white text-xs py-1 rounded hover:bg-red-600"
                  >
                    却下
                  </button>
                </div>
              </div>

              <div v-if="shiftRequests.length === 0" class="text-center py-8 text-gray-500">
                <i class="fas fa-inbox text-3xl mb-2"></i>
                <p>提出された希望はありません</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script>
        ${getRequestAppScript()}
      </script>
    </div>`

  return new Response(createHtmlTemplate('シフト希望提出', bodyContent), {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  })
})

// 希望提出アプリのJavaScript
const getRequestAppScript = () => `
const { createApp, ref, computed, onMounted } = Vue;

createApp({
  setup() {
    const employees = ref([])
    const stores = ref([])
    const shiftRequests = ref([])
    const filterEmployee = ref('')
    const filterStatus = ref('')
    
    const newRequest = ref({
      employee_id: '',
      store_id: '',
      date: '',
      time_period: '',
      request_type: ''
    })

    const currentDate = computed(() => {
      return new Date().toLocaleDateString('ja-JP')
    })

    const isFormValid = computed(() => {
      return newRequest.value.employee_id && 
             newRequest.value.store_id && 
             newRequest.value.date && 
             newRequest.value.time_period && 
             newRequest.value.request_type
    })

    const api = {
      async get(url) {
        const response = await fetch('/api' + url)
        return response.json()
      },
      
      async post(url, data) {
        const response = await fetch('/api' + url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        return response.json()
      },
      
      async put(url, data) {
        const response = await fetch('/api' + url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        return response.json()
      }
    }

    const loadEmployees = async () => {
      employees.value = await api.get('/employees')
    }

    const loadStores = async () => {
      stores.value = await api.get('/stores')
    }

    const loadRequests = async () => {
      let url = '/shift-requests'
      const params = []
      
      if (filterEmployee.value) {
        params.push('employee_id=' + filterEmployee.value)
      }
      if (filterStatus.value) {
        params.push('status=' + filterStatus.value)
      }
      
      if (params.length > 0) {
        url += '?' + params.join('&')
      }
      
      shiftRequests.value = await api.get(url)
      shiftRequests.value.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    const submitRequest = async () => {
      try {
        await api.post('/shift-requests', newRequest.value)
        
        newRequest.value = {
          employee_id: '',
          store_id: '',
          date: '',
          time_period: '',
          request_type: ''
        }
        
        await loadRequests()
        alert('希望を提出しました')
      } catch (error) {
        alert('希望の提出に失敗しました')
      }
    }

    const updateRequestStatus = async (requestId, status) => {
      try {
        await api.put('/shift-requests/' + requestId, { status })
        await loadRequests()
      } catch (error) {
        alert('ステータスの更新に失敗しました')
      }
    }

    const getEmployeeName = (employeeId) => {
      const employee = employees.value.find(emp => emp.id === employeeId)
      return employee ? employee.name : ''
    }

    const getStoreName = (storeId) => {
      const store = stores.value.find(s => s.id === storeId)
      return store ? store.name : ''
    }

    const formatDate = (dateString) => {
      const date = new Date(dateString)
      return date.toLocaleDateString('ja-JP', { 
        month: 'short', 
        day: 'numeric',
        weekday: 'short'
      })
    }

    const getTimePeriodText = (period) => {
      const periods = {
        'morning': '午前 (4:00-11:00)',
        'afternoon': '午後 (11:00-14:00)',
        'evening': '夕方 (14:00-18:00)',
        'night': '夜 (18:00-23:00)',
        'allday': '終日 (4:00-23:00)'
      }
      return periods[period] || period
    }

    const getStatusText = (status) => {
      const statuses = {
        'pending': '審査中',
        'approved': '承認',
        'rejected': '却下'
      }
      return statuses[status] || status
    }

    const getStatusClass = (status) => {
      const classes = {
        'pending': 'bg-yellow-100 text-yellow-800',
        'approved': 'bg-green-100 text-green-800',
        'rejected': 'bg-red-100 text-red-800'
      }
      return classes[status] || ''
    }

    onMounted(async () => {
      await loadEmployees()
      await loadStores()
      await loadRequests()
    })

    return {
      employees,
      stores,
      shiftRequests,
      filterEmployee,
      filterStatus,
      newRequest,
      currentDate,
      isFormValid,
      submitRequest,
      updateRequestStatus,
      getEmployeeName,
      getStoreName,
      formatDate,
      getTimePeriodText,
      getStatusText,
      getStatusClass,
      loadRequests
    }
  }
}).mount('#request-app')`

// === API Routes ===

// 店舗関連API
app.get('/api/stores', (c) => {
  return c.json(stores)
})

app.post('/api/stores', async (c) => {
  const data = await c.req.json()
  const newStore: Store = {
    id: Date.now(),
    name: data.name,
    address: data.address,
    created_at: new Date().toISOString()
  }
  stores.push(newStore)
  return c.json(newStore, 201)
})

// 従業員関連API
app.get('/api/employees', (c) => {
  const store_id = c.req.query('store_id')
  if (store_id) {
    const storeEmployees = employees.filter(emp => 
      emp.store_ids.includes(parseInt(store_id))
    )
    return c.json(storeEmployees)
  }
  return c.json(employees)
})

app.post('/api/employees', async (c) => {
  const data = await c.req.json()
  const newEmployee: Employee = {
    id: Date.now(),
    name: data.name,
    hourly_rate: data.hourly_rate,
    store_ids: data.store_ids || [],
    created_at: new Date().toISOString()
  }
  employees.push(newEmployee)
  return c.json(newEmployee, 201)
})

app.put('/api/employees/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const data = await c.req.json()
  const index = employees.findIndex(emp => emp.id === id)
  
  if (index === -1) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  employees[index] = { ...employees[index], ...data }
  return c.json(employees[index])
})

app.delete('/api/employees/:id', (c) => {
  const id = parseInt(c.req.param('id'))
  const index = employees.findIndex(emp => emp.id === id)
  
  if (index === -1) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  employees.splice(index, 1)
  shifts = shifts.filter(shift => shift.employee_id !== id)
  return c.json({ success: true })
})

// シフト関連API
app.get('/api/shifts', (c) => {
  const store_id = c.req.query('store_id')
  const date = c.req.query('date')
  const month = c.req.query('month')
  const employee_id = c.req.query('employee_id')

  let filteredShifts = shifts

  if (store_id) {
    filteredShifts = filteredShifts.filter(shift => 
      shift.store_id === parseInt(store_id)
    )
  }

  if (date) {
    filteredShifts = filteredShifts.filter(shift => shift.date === date)
  }

  if (month) {
    filteredShifts = filteredShifts.filter(shift => 
      shift.date.startsWith(month)
    )
  }

  if (employee_id) {
    filteredShifts = filteredShifts.filter(shift => 
      shift.employee_id === parseInt(employee_id)
    )
  }

  return c.json(filteredShifts)
})

app.post('/api/shifts', async (c) => {
  const data = await c.req.json()
  
  // 同じ日に10人以上のシフトがないかチェック
  const sameDayShifts = shifts.filter(shift => 
    shift.date === data.date && shift.store_id === data.store_id
  )
  
  const uniqueEmployees = new Set(sameDayShifts.map(s => s.employee_id))
  if (uniqueEmployees.size >= 10 && !uniqueEmployees.has(data.employee_id)) {
    return c.json({ error: '同じ日に働ける従業員は最大10人までです' }, 400)
  }

  const newShift: Shift = {
    id: Date.now(),
    employee_id: data.employee_id,
    store_id: data.store_id,
    date: data.date,
    start_time: data.start_time,
    end_time: data.end_time,
    created_at: new Date().toISOString()
  }
  
  shifts.push(newShift)
  return c.json(newShift, 201)
})

app.put('/api/shifts/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const data = await c.req.json()
  const index = shifts.findIndex(shift => shift.id === id)
  
  if (index === -1) {
    return c.json({ error: 'Shift not found' }, 404)
  }

  shifts[index] = { ...shifts[index], ...data }
  return c.json(shifts[index])
})

app.delete('/api/shifts/:id', (c) => {
  const id = parseInt(c.req.param('id'))
  const index = shifts.findIndex(shift => shift.id === id)
  
  if (index === -1) {
    return c.json({ error: 'Shift not found' }, 404)
  }

  shifts.splice(index, 1)
  return c.json({ success: true })
})

// 給与計算API
app.get('/api/salary/:employee_id/:month', (c) => {
  const employee_id = parseInt(c.req.param('employee_id'))
  const month = c.req.param('month')
  
  const employee = employees.find(emp => emp.id === employee_id)
  if (!employee) {
    return c.json({ error: 'Employee not found' }, 404)
  }

  const monthlyShifts = shifts.filter(shift => 
    shift.employee_id === employee_id && shift.date.startsWith(month)
  )

  let totalHours = 0
  let totalWage = 0
  const dailyDetails: any[] = []

  monthlyShifts.forEach(shift => {
    const startTime = new Date(`2000-01-01 ${shift.start_time}`)
    const endTime = new Date(`2000-01-01 ${shift.end_time}`)
    const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
    const wage = hours * employee.hourly_rate

    totalHours += hours
    totalWage += wage

    dailyDetails.push({
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      hours: hours,
      wage: Math.round(wage)
    })
  })

  return c.json({
    employee_id,
    employee_name: employee.name,
    month,
    total_hours: totalHours,
    total_wage: Math.round(totalWage),
    hourly_rate: employee.hourly_rate,
    daily_details: dailyDetails
  })
})

// 月間人件費API
app.get('/api/labor-cost/:store_id/:month', (c) => {
  const store_id = parseInt(c.req.param('store_id'))
  const month = c.req.param('month')

  const monthlyShifts = shifts.filter(shift => 
    shift.store_id === store_id && shift.date.startsWith(month)
  )

  let totalLaborCost = 0
  let totalHours = 0
  const employeeDetails: any[] = []

  const employeeStats: { [key: number]: { hours: number, wage: number } } = {}

  monthlyShifts.forEach(shift => {
    const employee = employees.find(emp => emp.id === shift.employee_id)
    if (!employee) return

    const startTime = new Date(`2000-01-01 ${shift.start_time}`)
    const endTime = new Date(`2000-01-01 ${shift.end_time}`)
    const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)
    const wage = hours * employee.hourly_rate

    totalHours += hours
    totalLaborCost += wage

    if (!employeeStats[employee.id]) {
      employeeStats[employee.id] = { hours: 0, wage: 0 }
    }
    employeeStats[employee.id].hours += hours
    employeeStats[employee.id].wage += wage
  })

  Object.keys(employeeStats).forEach(empId => {
    const employee = employees.find(emp => emp.id === parseInt(empId))
    if (employee) {
      employeeDetails.push({
        employee_id: employee.id,
        employee_name: employee.name,
        hours: employeeStats[employee.id].hours,
        wage: Math.round(employeeStats[employee.id].wage),
        hourly_rate: employee.hourly_rate
      })
    }
  })

  return c.json({
    store_id,
    month,
    total_labor_cost: Math.round(totalLaborCost),
    total_hours: totalHours,
    employee_count: Object.keys(employeeStats).length,
    employee_details: employeeDetails
  })
})

// シフト希望関連API
app.get('/api/shift-requests', (c) => {
  const store_id = c.req.query('store_id')
  const employee_id = c.req.query('employee_id')
  const status = c.req.query('status')

  let filteredRequests = shiftRequests

  if (store_id) {
    filteredRequests = filteredRequests.filter(req => 
      req.store_id === parseInt(store_id)
    )
  }

  if (employee_id) {
    filteredRequests = filteredRequests.filter(req => 
      req.employee_id === parseInt(employee_id)
    )
  }

  if (status) {
    filteredRequests = filteredRequests.filter(req => req.status === status)
  }

  return c.json(filteredRequests)
})

app.post('/api/shift-requests', async (c) => {
  const data = await c.req.json()
  
  const newRequest: ShiftRequest = {
    id: Date.now(),
    employee_id: data.employee_id,
    store_id: data.store_id,
    date: data.date,
    time_period: data.time_period,
    request_type: data.request_type,
    status: 'pending',
    created_at: new Date().toISOString()
  }
  
  shiftRequests.push(newRequest)
  return c.json(newRequest, 201)
})

app.put('/api/shift-requests/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const data = await c.req.json()
  const index = shiftRequests.findIndex(req => req.id === id)
  
  if (index === -1) {
    return c.json({ error: 'Request not found' }, 404)
  }

  shiftRequests[index] = { ...shiftRequests[index], ...data }
  return c.json(shiftRequests[index])
})

export default app