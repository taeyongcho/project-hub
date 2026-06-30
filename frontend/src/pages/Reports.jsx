import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
    mutationFn: type => api.post(`/reports/${type}`),
    onSuccess: data => { qc.invalidateQueries({ queryKey: ['reports'] }); setSelected(data.data) }
  })

  const exportFile = async (id, fmt) => {
    const res = await api.get(`/reports/${id}/export/${fmt}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = `report_${id}.${fmt}`; a.click()
    URL.revokeObjectURL(url)
  }

  const displayReport = selected || reports[0]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">보고서</h1>
        {user?.role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={() => genMut.mutate('weekly')} disabled={genMut.isPending}
              className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              주간보고 생성
            </button>
            <button onClick={() => genMut.mutate('monthly')} disabled={genMut.isPending}
              className="text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              월간보고 생성
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-5">
        {[['weekly','주간보고'],['monthly','월간보고']].map(([v, l]) => (
          <button key={v} onClick={() => { setTab(v); setSelected(null) }}
            className={`text-sm px-4 py-1.5 rounded-full font-medium transition-colors ${
              tab === v ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1 space-y-1">
          {reports.length === 0
            ? <p className="text-slate-400 text-sm px-2 py-4">보고서가 없습니다</p>
            : reports.map(r => (
              <button key={r.id} onClick={() => setSelected(r)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                  displayReport?.id === r.id
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                }`}>
                <div className="text-sm font-semibold">{r.period}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {dayjs(r.generated_at).format('MM/DD HH:mm')} 생성
                </div>
              </button>
            ))
          }
        </div>

        <div className="col-span-3">
          {displayReport ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-card">
              <div className="flex items-center justify-between mb-5 pb-5 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {displayReport.type === 'weekly' ? '주간' : '월간'}업무보고
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">{displayReport.period}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => exportFile(displayReport.id, 'pdf')}
                    className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg transition-colors font-medium">
                    PDF 저장
                  </button>
                  <button onClick={() => exportFile(displayReport.id, 'docx')}
                    className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg transition-colors font-medium">
                    Word 저장
                  </button>
                </div>
              </div>

              {displayReport.type === 'weekly'
                ? <WeeklyContent content={displayReport.content} />
                : <MonthlyContent content={displayReport.content} />
              }
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 flex items-center justify-center h-64 text-slate-400">
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <div>보고서를 선택하거나 새로 생성하세요</div>
              </div>
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
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="완료 태스크" value={content.done_tasks} color="text-emerald-600" bg="bg-emerald-50" />
        <StatBox label="지연 태스크" value={content.overdue_tasks}
          color={content.overdue_tasks > 0 ? 'text-red-600' : 'text-slate-400'}
          bg={content.overdue_tasks > 0 ? 'bg-red-50' : 'bg-slate-50'} />
        <StatBox label="처리 이메일" value={content.emails_processed} color="text-blue-600" bg="bg-blue-50" />
      </div>
      <Section title="완료 업무" items={content.completed_work} emptyText="기록된 완료 업무 없음" />
      <Section title="이슈 / 리스크" items={content.issues} emptyText="이슈 없음" />
      <Section title="다음 업무 계획" items={content.next_plans} emptyText="기록된 계획 없음" />
      <div className="text-xs text-slate-400 pt-3 border-t border-slate-100">
        생성: {dayjs(content.generated_at).format('YYYY-MM-DD HH:mm')} · 기간: {content.period_start} ~ {content.period_end}
      </div>
    </div>
  )
}

function MonthlyContent({ content }) {
  if (!content) return null
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="완료 태스크" value={content.total_done_tasks} color="text-emerald-600" bg="bg-emerald-50" />
        <StatBox label="전체 태스크" value={content.total_tasks} color="text-blue-600" bg="bg-blue-50" />
        <StatBox label="마감 준수율" value={`${content.deadline_rate}%`}
          color={content.deadline_rate >= 80 ? 'text-emerald-600' : 'text-amber-600'}
          bg={content.deadline_rate >= 80 ? 'bg-emerald-50' : 'bg-amber-50'} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">팀원별 현황</h3>
        <div className="space-y-3">
          {content.user_stats?.map((u, i) => {
            const total = u.done + u.in_progress || 1
            const pct = Math.round(u.done / total * 100)
            return (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium text-slate-700">{u.name}</span>
                  <span className="text-slate-400">완료 {u.done} / 진행 {u.in_progress}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="text-xs text-slate-400 pt-3 border-t border-slate-100">
        기간: {content.period} · 생성: {dayjs(content.generated_at).format('YYYY-MM-DD HH:mm')}
      </div>
    </div>
  )
}

function StatBox({ label, value, color, bg }) {
  return (
    <div className={`${bg} rounded-xl p-4 text-center`}>
      <div className={`text-3xl font-bold ${color}`}>{value ?? '-'}</div>
      <div className="text-xs text-slate-500 mt-1 font-medium">{label}</div>
    </div>
  )
}

function Section({ title, items, emptyText }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>
      {!items?.length
        ? <p className="text-slate-400 text-sm">{emptyText}</p>
        : <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="markdown-body text-sm text-slate-700 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item}</ReactMarkdown>
            </div>
          ))}
        </div>
      }
    </div>
  )
}
