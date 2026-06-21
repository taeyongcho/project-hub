import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import dayjs from 'dayjs'

export default function WorkLog() {
  const qc = useQueryClient()
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [form, setForm] = useState({ content: '', issues: '', next_plan: '' })
  const [saved, setSaved] = useState(false)

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

  function handleDateChange(d) {
    setDate(d)
    const existing = recentLogs.find(l => l.log_date === d)
    if (existing) setForm({ content: existing.content, issues: existing.issues, next_plan: existing.next_plan })
    else setForm({ content: '', issues: '', next_plan: '' })
  }

  const TA = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">업무일지</h1>
          <p className="text-sm text-slate-400 mt-0.5">{dayjs(date).format('YYYY년 MM월 DD일 dddd')}</p>
        </div>
        <input type="date" value={date} onChange={e => handleDateChange(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          {[
            { label: '오늘 완료한 업무', key: 'content', rows: 6, ph: '오늘 완료하거나 진행한 업무를 입력하세요...' },
            { label: '이슈 / 리스크', key: 'issues', rows: 4, ph: '오늘 발생한 이슈나 리스크를 기록하세요...' },
            { label: '다음 업무 계획', key: 'next_plan', rows: 4, ph: '내일 또는 다음에 처리할 업무 계획...' },
          ].map(({ label, key, rows, ph }) => (
            <div key={key} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
              <label className="block text-sm font-semibold text-slate-700 mb-3">{label}</label>
              <textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                rows={rows} placeholder={ph} className={TA} />
            </div>
          ))}

          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium text-emerald-600 transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`}>
              저장되었습니다 ✓
            </span>
            <button onClick={() => saveMut.mutate({ log_date: date, ...form })}
              disabled={saveMut.isPending}
              className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors">
              저장
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card h-fit">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">최근 14일</h2>
          <div className="space-y-1">
            {recentLogs.length === 0
              ? <p className="text-slate-400 text-xs py-2">작성된 일지가 없습니다</p>
              : recentLogs.map(l => (
                <button key={l.id}
                  onClick={() => { setDate(l.log_date); setForm({ content: l.content, issues: l.issues, next_plan: l.next_plan }) }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    date === l.log_date
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}>
                  <div className="font-medium">{dayjs(l.log_date).format('MM월 DD일 (ddd)')}</div>
                  {l.content && <div className="text-xs text-slate-400 truncate mt-0.5">{l.content.slice(0, 35)}</div>}
                  {l.issues && <div className="text-xs text-amber-500 font-medium mt-0.5">⚠ 이슈 있음</div>}
                </button>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
