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
// 기간 바 색상 팔레트 (태스크별로 순환)
const BAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6']

const DATE_ROW_H = 30   // 날짜 숫자 영역 높이(px)
const LANE_H = 22       // 바 한 줄 높이(px)

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

  const weeks = useMemo(() => {
    const arr = []
    let d = gridStart
    while (d.isBefore(gridEnd) || d.isSame(gridEnd, 'day')) {
      arr.push(d)
      d = d.add(1, 'day')
    }
    const w = []
    for (let i = 0; i < arr.length; i += 7) w.push(arr.slice(i, i + 7))
    return w
  }, [gridStart, gridEnd])

  const tasks = useMemo(() =>
    (data?.tasks || []).filter(t => !mineOnly || t.assigned_to_id === user?.id),
    [data, mineOnly, user])

  // 기간 태스크 (바로 그림) / 단일 날짜 태스크 (칩)
  const periodTasks = useMemo(() =>
    tasks.filter(t => t.start_date && t.due_date && t.start_date !== t.due_date),
    [tasks])

  const byDate = useMemo(() => {
    const map = {}
    const push = (key, item) => { (map[key] = map[key] || []).push(item) }
    for (const t of tasks) {
      if (t.start_date && t.due_date && t.start_date !== t.due_date) continue // 바로 처리됨
      if (t.due_date) push(t.due_date, { kind: 'task', ...t })
      else if (t.start_date) push(t.start_date, { kind: 'task', ...t })
    }
    for (const m of data?.milestones || []) {
      push(m.due_date, { kind: 'milestone', ...m })
    }
    return map
  }, [tasks, data])

  // 주별 바 세그먼트 + 레인 배정 (겹치면 아랫줄로)
  const weekBars = useMemo(() => {
    return weeks.map(week => {
      const wStart = week[0], wEnd = week[6]
      const segs = []
      for (const t of periodTasks) {
        const s = dayjs(t.start_date), e = dayjs(t.due_date)
        if (e.isBefore(wStart, 'day') || s.isAfter(wEnd, 'day')) continue
        const segStart = s.isBefore(wStart, 'day') ? wStart : s
        const segEnd = e.isAfter(wEnd, 'day') ? wEnd : e
        segs.push({
          task: t,
          startIdx: segStart.diff(wStart, 'day'),
          len: segEnd.diff(segStart, 'day') + 1,
          contLeft: s.isBefore(wStart, 'day'),
          contRight: e.isAfter(wEnd, 'day'),
        })
      }
      // 긴 바 우선 배치 → 레인 배정
      segs.sort((a, b) => a.startIdx - b.startIdx || b.len - a.len)
      const laneEnds = [] // 각 레인의 마지막 점유 인덱스
      for (const seg of segs) {
        let lane = 0
        while (laneEnds[lane] !== undefined && laneEnds[lane] >= seg.startIdx) lane++
        seg.lane = lane
        laneEnds[lane] = seg.startIdx + seg.len - 1
      }
      return { segs, laneCount: laneEnds.length }
    })
  }, [weeks, periodTasks])

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

        {/* 주 단위 렌더링 (기간 바 오버레이) */}
        {weeks.map((week, wi) => {
          const { segs, laneCount } = weekBars[wi]
          const barsHeight = laneCount * LANE_H
          return (
            <div key={wi} className="relative">
              {/* 날짜 셀 */}
              <div className="grid grid-cols-7">
                {week.map((d, di) => {
                  const key = d.format('YYYY-MM-DD')
                  const items = byDate[key] || []
                  const inMonth = d.month() === monthNum
                  const isToday = key === today
                  const dow = d.day()
                  return (
                    <div key={key}
                      className={`min-h-[104px] p-1.5 border-b border-r border-slate-100 dark:border-slate-800 ${
                        di === 6 ? 'border-r-0' : ''
                      } ${inMonth ? '' : 'bg-slate-50/60 dark:bg-slate-950/40'}`}>
                      <div className={`text-xs mb-1 px-1 inline-flex items-center justify-center rounded-full min-w-[20px] h-5 ${
                        isToday ? 'bg-blue-600 text-white font-bold'
                        : !inMonth ? 'text-slate-300 dark:text-slate-600'
                        : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'
                      }`}>{d.date()}</div>
                      {/* 바 영역만큼 칩을 아래로 */}
                      {barsHeight > 0 && <div style={{ height: barsHeight }} />}
                      <div className="space-y-1">
                        {items.slice(0, 3).map((it, i) => it.kind === 'milestone' ? (
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
                            className={`w-full flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded truncate text-left bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors ${
                              it.status === 'done' ? 'line-through opacity-50' : ''}`}
                            title={it.title}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[it.priority] || 'bg-slate-400'}`} />
                            <span className="truncate">{it.title}</span>
                          </button>
                        ))}
                        {items.length > 3 && (
                          <div className="text-[10px] text-slate-400 px-1.5">+{items.length - 3}개 더</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 기간 바 오버레이 */}
              {segs.map((seg, si) => {
                const color = BAR_COLORS[seg.task.id % BAR_COLORS.length]
                const isDone = seg.task.status === 'done'
                return (
                  <button key={si}
                    onClick={() => ctx.onSelectTask && ctx.onSelectTask(seg.task.id)}
                    className={`absolute flex items-center text-[11px] font-medium text-white truncate px-1.5 shadow-sm hover:brightness-110 transition-all ${
                      seg.contLeft ? '' : 'rounded-l-md'} ${seg.contRight ? '' : 'rounded-r-md'} ${isDone ? 'line-through opacity-50' : ''}`}
                    style={{
                      top: DATE_ROW_H + seg.lane * LANE_H,
                      left: `calc(${seg.startIdx} * 100% / 7 + ${seg.contLeft ? 0 : 3}px)`,
                      width: `calc(${seg.len} * 100% / 7 - ${(seg.contLeft ? 0 : 3) + (seg.contRight ? 0 : 3)}px)`,
                      height: LANE_H - 4,
                      background: isDone ? '#94a3b8' : color,
                    }}
                    title={`${seg.task.title} (${seg.task.start_date} ~ ${seg.task.due_date})`}>
                    {(!seg.contLeft || seg.startIdx === 0) && <span className="truncate">{seg.task.title}</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-6 h-2.5 rounded bg-blue-500 inline-block" /> 기간 태스크 (시작~마감)</span>
        <span className="flex items-center gap-1"><Flag size={11} /> 마일스톤</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 긴급</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> 높음</span>
        {isLoading && <span className="ml-auto">불러오는 중...</span>}
      </div>
    </div>
  )
}
