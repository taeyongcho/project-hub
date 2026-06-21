import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import useAuth from '../store/auth'
import dayjs from 'dayjs'

export default function WorkLog() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [form, setForm] = useState({ content: '', issues: '', next_plan: '' })
  const [saved, setSaved] = useState(false)

  const { data: log } = useQuery({
    queryKey: ['worklog', date],
    queryFn: () => api.get(`/work-logs?from_date=${date}&to_date=${date}`).then(r => r.data[0] || null),
    onSuccess: data => {
      if (data) setForm({ content: data.content, issues: data.issues, next_plan: data.next_plan })
      else setForm({ content: '', issues: '', next_plan: '' })
    }
  })

  const { data: recentLogs = [] } = useQuery({
    queryKey: ['recent-logs'],
    queryFn: () => {
      const from = dayjs().subtract(14, 'day').format('YYYY-MM-DD')
      return api.get(`/work-logs?from_date=${from}`).then(r => r.data)
    }
  })

  const saveMut = useMutation({
    mutationFn: data => api.post('/work-logs', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worklog'] })
      qc.invalidateQueries({ queryKey: ['recent-logs'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  })

  function handleSave() {
    saveMut.mutate({ log_date: date, ...form })
  }

  // 날짜 변경 시 해당 일지 로드
  function handleDateChange(d) {
    setDate(d)
    const existing = recentLogs.find(l => l.log_date === d)
    if (existing) setForm({ content: existing.content, issues: existing.issues, next_plan: existing.next_plan })
    else setForm({ content: '', issues: '', next_plan: '' })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">업무일지</h1>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => handleDateChange(e.target.value)}
            className="bg-[#1e293b] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* 작성 영역 */}
        <div className="col-span-2 space-y-4">
          <div className="bg-[#1e293b] rounded-xl p-5">
            <label className="block text-sm font-semibold text-white mb-2">
              ✅ 오늘 완료한 업무
            </label>
            <textarea
              value={form.content}
              onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              rows={6}
              placeholder="오늘 완료하거나 진행한 업무를 입력하세요..."
              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="bg-[#1e293b] rounded-xl p-5">
            <label className="block text-sm font-semibold text-white mb-2">
              ⚠️ 이슈 / 리스크
            </label>
            <textarea
              value={form.issues}
              onChange={e => setForm(p => ({ ...p, issues: e.target.value }))}
              rows={4}
              placeholder="오늘 발생한 이슈나 리스크를 기록하세요..."
              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="bg-[#1e293b] rounded-xl p-5">
            <label className="block text-sm font-semibold text-white mb-2">
              📋 다음 업무 계획
            </label>
            <textarea
              value={form.next_plan}
              onChange={e => setForm(p => ({ ...p, next_plan: e.target.value }))}
              rows={4}
              placeholder="내일 또는 다음에 처리할 업무 계획..."
              className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-sm transition-opacity ${saved ? 'text-emerald-400 opacity-100' : 'opacity-0'}`}>
              ✓ 저장되었습니다
            </span>
            <button onClick={handleSave}
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg transition-colors font-semibold">
              저장
            </button>
          </div>
        </div>

        {/* 최근 일지 목록 */}
        <div className="bg-[#1e293b] rounded-xl p-4 h-fit">
          <h2 className="text-sm font-semibold text-white mb-3">최근 14일</h2>
          <div className="space-y-1">
            {recentLogs.length === 0
              ? <p className="text-slate-500 text-xs">작성된 일지가 없습니다</p>
              : recentLogs.map(l => (
                <button key={l.id}
                  onClick={() => {
                    setDate(l.log_date)
                    setForm({ content: l.content, issues: l.issues, next_plan: l.next_plan })
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    date === l.log_date
                      ? 'bg-blue-600/20 text-blue-300'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}>
                  <div className="font-medium">{dayjs(l.log_date).format('MM월 DD일 (ddd)')}</div>
                  {l.content && (
                    <div className="text-xs text-slate-600 truncate mt-0.5">{l.content.slice(0, 40)}</div>
                  )}
                  {l.issues && <div className="text-xs text-amber-700 mt-0.5">⚠ 이슈 있음</div>}
                </button>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
