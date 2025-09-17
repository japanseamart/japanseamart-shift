// 管理者用メインアプリケーション
import { createApp, ref, computed, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'

const { createApp: createVueApp } = Vue

createVueApp({
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

    // 時間スロット（30分間隔）
    const timeSlots = computed(() => {
      const slots = []
      for (let hour = 4; hour <= 23; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
          slots.push(time)
        }
      }
      return slots
    })

    // 選択店舗の従業員
    const storeEmployees = computed(() => {
      if (!selectedStore.value) return []
      return employees.value.filter(emp => 
        emp.store_ids.includes(selectedStore.value.id)
      )
    })

    // 当日のシフト
    const dailyShifts = computed(() => {
      if (!selectedStore.value) return []
      return shifts.value.filter(shift => 
        shift.store_id === selectedStore.value.id && 
        shift.date === selectedDate.value
      )
    })

    // API関数
    const api = {
      async get(url) {
        const response = await fetch(`/api${url}`)
        return response.json()
      },
      
      async post(url, data) {
        const response = await fetch(`/api${url}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        return response.json()
      },
      
      async put(url, data) {
        const response = await fetch(`/api${url}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        return response.json()
      },
      
      async delete(url) {
        const response = await fetch(`/api${url}`, { method: 'DELETE' })
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
      shifts.value = await api.get(`/shifts?store_id=${selectedStore.value.id}&date=${selectedDate.value}`)
    }

    // 店舗選択
    const selectStore = async (store) => {
      selectedStore.value = store
      await loadShifts()
    }

    // 日付変更
    const changeDate = async (date) => {
      selectedDate.value = date
      await loadShifts()
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
          await api.put(`/employees/${editingEmployee.value.id}`, editingEmployee.value)
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
        await api.delete(`/employees/${employeeId}`)
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
          store_id: selectedStore.value?.id || '',
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
          await api.put(`/shifts/${editingShift.value.id}`, editingShift.value)
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
        await api.delete(`/shifts/${shiftId}`)
        await loadShifts()
      } catch (error) {
        alert('シフトの削除に失敗しました')
      }
    }

    // 給与計算
    const calculateShiftWage = (shift) => {
      const employee = employees.value.find(emp => emp.id === shift.employee_id)
      if (!employee) return 0

      const startTime = new Date(`2000-01-01 ${shift.start_time}`)
      const endTime = new Date(`2000-01-01 ${shift.end_time}`)
      const hours = (endTime - startTime) / (1000 * 60 * 60)
      
      return Math.round(hours * employee.hourly_rate)
    }

    // シフトバー表示用
    const getShiftBarStyle = (shift) => {
      const startIndex = timeSlots.value.indexOf(shift.start_time)
      const endIndex = timeSlots.value.indexOf(shift.end_time)
      const duration = endIndex - startIndex
      
      return {
        gridColumn: `${startIndex + 2} / span ${Math.max(1, duration)}`,
        backgroundColor: getTimeColor(shift.start_time),
        gridRow: 1
      }
    }

    const getTimeColor = (startTime) => {
      const hour = parseInt(startTime.split(':')[0])
      if (hour >= 4 && hour < 11) return '#f59e0b' // 朝 - オレンジ
      if (hour >= 11 && hour < 14) return '#10b981' // 昼 - 緑
      if (hour >= 14 && hour < 18) return '#3b82f6' // 夕方 - 青
      return '#8b5cf6' // 夜 - 紫
    }

    // 時間カテゴリー取得
    const getTimeCategory = (startTime) => {
      const hour = parseInt(startTime.split(':')[0])
      if (hour >= 4 && hour < 11) return '朝'
      if (hour >= 11 && hour < 14) return '昼'
      if (hour >= 14 && hour < 18) return '夕方'
      return '夜'
    }

    // 店舗名取得
    const getStoreName = (storeId) => {
      const store = stores.value.find(s => s.id === storeId)
      return store ? store.name : ''
    }

    // レポートデータ
    const monthlyReport = ref(null)
    
    const loadMonthlyReport = async () => {
      if (!selectedStore.value) return
      const month = selectedDate.value.substring(0, 7) // YYYY-MM
      monthlyReport.value = await api.get(`/labor-cost/${selectedStore.value.id}/${month}`)
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
      timeSlots,
      storeEmployees,
      dailyShifts,
      monthlyReport,
      selectStore,
      changeDate,
      openEmployeeModal,
      saveEmployee,
      deleteEmployee,
      openShiftModal,
      saveShift,
      deleteShift,
      calculateShiftWage,
      getShiftBarStyle,
      getTimeColor,
      getTimeCategory,
      getStoreName,
      loadMonthlyReport
    }
  }
}).mount('#app')