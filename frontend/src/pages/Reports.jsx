import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import useAuth from '../store/auth'
import dayjs from 'dayjs'

export default function Reports() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [tab, setTab] = useState('weekly')
  const [selected, setSelected] = useState(null)

  const { data: reports = [] } = useQuery({
    queryKey: ['reports', tab],
    queryFn: () => api.get(`/reports?type=${tab}`).then(r => r.data)
  })

  const genMut = useMutation({
    mutationFn: (type) => api.post(`/reports/${type}`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['reports'] })
      setSelected(data.data)
    }
  })

  const exportDocx = async (id) => {
    const res = await api.get(`/reports/${id}/export/docx`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_${id}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const displayReport = selected || reports[0]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">보고서</h1>
        {user?.role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={() => genMut.mutate('weekly')}
              disabled={genMut.isPending}
              className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors">
              주간보고 생성
            </button>
            <button onClick={() => genMut.mutate('monthly')}
              disabled={genMut.isPending}
              className="text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors">
              월간보고 생성
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-5">
        {[['weekly', '주간보고'], ['monthly', '월간보고']].map(([v, l]) => (
          <button key={v} onClick={() => { setTab(v); setSelected(null) }}
            className={`text-sm px-4 py-1.5 rounded-full transition-colors ${
              tab === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* 목록 */}
        <div className="col-span-1 space-y-1">
          {reports.length === 0
            ? <p className="text-slate-500 text-sm px-2">보고서가 없습니다</p>
            : reports.map(r => (
              <button key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                  displayReport?.id === r.id
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}>
                <div className="text-sm font-medium">{r.period}</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {dayjs(r.generated_at).format('MM/DD HH:mm')} 생성
                </div>
              </button>
            ))
          }
        </div>

        {/* 상세 */}
        <div className="col-span-3">
          {displayReport ? (
            <div className="bg-[#1e293b] rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {displayReport.type === 'weekly' ? '주간' : '월간'}업무보고
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">{displayReport.period}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => exportDocx(displayReport.id)}
                    className="text-xs border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                    📄 Word 저장
                  </button>
                </div>
              </div>

              {displayReport.type === 'weekly' ? (
                <WeeklyContent content={displayReport.content} />
              ) : (
                <MonthlyContent content={displayReport.content} />
              )}
            </div>
          ) : (
            <div className="bg-[#1e293b] rounded-xl p-6 flex items-center justify-center h-64 text-slate-500">
              보고서를 선택하거나 새로 생성하세요
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WeeklyContent({ content }) {
  if (!content) return null
  return (
    <div className="space-y-5">
      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4">
        <StatBox label="완료 태스크" value={content.done_tasks} color="text-emerald-400" />
        <StatBox label="지연 태스크" value={content.overdue_tasks} color={content.overdue_tasks > 0 ? 'text-red-400' : 'text-slate-400'} />
        <StatBox label="처리 이메일" value={content.emails_processed} color="text-blue-400" />
      </div>

      <Section title="✅ 완료 업무" items={content.completed_work} emptyText="기록된 완료 업무 없음" />
      <Section title="⚠️ 이슈 / 리스크" items={content.issues} emptyText="이슈 없음" itemColor="text-amber-300" />

      <div className="text-xs text-slate-600 pt-2 border-t border-slate-700">
        생성: {dayjs(content.generated_at).format('YYYY-MM-DD HH:mm')} ·
        기간: {content.period_start} ~ {content.period_end}
      </div>
    </div>
  )
}

function MonthlyContent({ content }) {
  if (!content) return null
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <StatBox label="완료 태스크" value={content.total_done_tasks} color="text-emerald-400" />
        <StatBox label="전체 태스크" value={content.total_tasks} color="text-blue-400" />
        <StatBox label="마감 준수율" value={`${content.deadline_rate}%`} color={content.deadline_rate >= 80 ? 'text-emerald-400' : 'text-amber-400'} />
      </div>

      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">팀원별 현황</h3>
        <div className="space-y-2">
          {content.user_stats?.map((u, i) => {
            const total = u.done + u.in_progress || 1
            const pct = Math.round(u.done / total * 100)
            return (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300">{u.name}</span>
                  <span className="text-slate-500">완료 {u.done} / 진행 {u.in_progress}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="text-xs text-slate-600 pt-2 border-t border-slate-700">
        기간: {content.period} · 생성: {dayjs(content.generated_at).format('YYYY-MM-DD HH:mm')}
      </div>
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-[#0f172a] rounded-xl p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value ?? '-'}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  )
}

function Section({ title, items, emptyText, itemColor = 'text-slate-300' }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
      {!items?.length
        ? <p className="text-slate-600 text-sm">{emptyText}</p>
        : <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className={`text-sm ${itemColor} flex gap-2`}>
              <span className="text-slate-600 flex-shrink-0">·</span>
              <span className="whitespace-pre-wrap">{item}</span>
            </li>
          ))}
        </ul>
      }
    </div>
  )
}
