import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react'
import dayjs from 'dayjs'
import api from '../api/client'
import useAuth from '../store/auth'

const PRIORITY_DOT = {
  urgent: 'bg-red-500', high: 'bg-amber-500', normal: 'bg-blue-500', low: 'bg-slate-400',
}
const STATUS_STYLE = {
  done: 'line-through opacity-50',
}

export default function Calendar() {
  const { user } = useAuth()
  const ctx = useOutletContext() || {}
  const [cursor, setCursor] = useState(dayjs())
  const [mineOnly, setMineOnly] = useState(false)

  const gridStart = cursor.startOf('month').startOf('week')
  const gridEnd = cursor.endOf('month').endOf('week')

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', gridStart.format('YYYY-MM-DD'), gridEnd.format('YYYY-MM-DD')],
    queryFn: () => api.get('/dashboard/calendar', {
      params: { start: gridStart.format('YYYY-MM-DD'), end: gridEnd.format('YYYY-MM-DD') }
    }).then(r => r.data),
  })

  const days = useMemo(() => {
    const arr = []
    let d = gridStart
    while (d.isBefore(gridEnd) || d.isSame(gridEnd, 'day')) {
      arr.push(d)
      d = d.add(1, 'day')
    }
    return arr
  }, [gridStart, gridEnd])

  // 날짜별 항목 매핑
  const byDate = useMemo(() => {
    const map = {}
    const push = (key, item) => { (map[key] = map[key] || []).push(item) }
    for (const t of data?.tasks || []) {
      if (mineOnly && t.assigned_to_id !== user?.id) continue
      if (t.start_date && t.due_date && t.start_date !== t.due_date) {
        // 기간 태스크: 시작~마감 전 기간에 표시 (그리드 범위로 클램프)
        let d = dayjs(t.start_date).isBefore(gridStart) ? gridStart : dayjs(t.start_date)
        const last = dayjs(t.due_date).isAfter(gridEnd) ? gridEnd : dayjs(t.due_date)
        while (d.isBefore(last) || d.isSame(last, 'day')) {
          const key = d.format('YYYY-MM-DD')
          const pos = key === t.start_date ? 'start' : key === t.due_date ? 'end' : 'mid'
          push(key, { kind: 'task', span: pos, ...t })
          d = d.add(1, 'day')
        }
      } else if (t.due_date) {
        push(t.due_date, { kind: 'task', ...t })
      } else if (t.start_date) {
        push(t.start_date, { kind: 'task', span: 'start', ...t })
      }
    }
    for (const m of data?.milestones || []) {
      push(m.due_date, { kind: 'milestone', ...m })
    }
    return map
  }, [data, mineOnly, user, gridStart, gridEnd])

  const today = dayjs().format('YYYY-MM-DD')
  const monthNum = cursor.month()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {cursor.format('YYYY년 M월')}
          </h1>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => setCursor(cursor.subtract(1, 'month'))}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setCursor(dayjs())}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              오늘
            </button>
            <button onClick={() => setCursor(cursor.add(1, 'month'))}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[['all', '전체'], ['mine', '내 일정']].map(([v, l]) => (
            <button key={v} onClick={() => setMineOnly(v === 'mine')}
              className={`text-sm px-4 py-1.5 rounded-full font-medium transition-colors ${
                (v === 'mine') === mineOnly
                  ? 'bg-slate-900 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card overflow-hidden">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={`py-2 text-center text-xs font-semibold ${
              i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'
            }`}>{d}</div>
          ))}
        </div>
        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7">
          {days.map((d, idx) => {
            const key = d.format('YYYY-MM-DD')
            const items = byDate[key] || []
            const inMonth = d.month() === monthNum
            const isToday = key === today
            const dow = d.day()
            return (
              <div key={key}
                className={`min-h-[104px] p-1.5 border-b border-r border-slate-100 dark:border-slate-800 ${
                  idx % 7 === 6 ? 'border-r-0' : ''
                } ${inMonth ? '' : 'bg-slate-50/60 dark:bg-slate-950/40'}`}>
                <div className={`text-xs mb-1 px-1 inline-flex items-center justify-center rounded-full min-w-[20px] h-5 ${
                  isToday ? 'bg-blue-600 text-white font-bold'
                  : !inMonth ? 'text-slate-300 dark:text-slate-600'
                  : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'
                }`}>{d.date()}</div>
                <div className="space-y-1">
                  {items.slice(0, 4).map((it, i) => it.kind === 'milestone' ? (
                    <div key={`m${it.id}`}
                      className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded truncate font-medium"
                      style={{ background: (it.project_color || '#8b5cf6') + '22', color: it.project_color || '#8b5cf6' }}
                      title={`${it.title}${it.project_name ? ' · ' + it.project_name : ''}`}>
                      <Flag size={10} className="flex-shrink-0" />
                      <span className="truncate">{it.title}</span>
                    </div>
                  ) : (
                    <button key={`t${it.id}-${i}`}
                      onClick={() => ctx.onSelectTask && ctx.onSelectTask(it.id)}
                      className={`w-full flex items-center gap-1 text-[11px] px-1.5 py-0.5 truncate text-left bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors ${STATUS_STYLE[it.status] || ''} ${
                        it.span === 'mid' ? 'opacity-60 rounded-none' : it.span === 'start' ? 'rounded-l rounded-r-none' : it.span === 'end' ? 'rounded-r rounded-l-none font-medium' : 'rounded'
                      }`}
                      title={`${it.title}${it.span ? ` (${it.start_date || ''}~${it.due_date || ''})` : ''}`}>
                      {it.span !== 'mid' && it.span !== 'end' && (
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[it.priority] || 'bg-slate-400'}`} />
                      )}
                      {it.span === 'end' && <span className="flex-shrink-0">🏁</span>}
                      <span className="truncate">{it.span === 'mid' ? '│ ' + it.title : it.title}</span>
                    </button>
                  ))}
                  {items.length > 4 && (
                    <div className="text-[10px] text-slate-400 px-1.5">+{items.length - 4}개 더</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 flex-wrap">
        <span className="flex items-center gap-1"><Flag size={11} /> 마일스톤</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 긴급</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> 높음</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> 보통</span>
        {isLoading && <span className="ml-auto">불러오는 중...</span>}
      </div>
    </div>
  )
}
