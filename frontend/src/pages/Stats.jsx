import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

const STATUS_LABEL = { todo: '할 일', in_progress: '진행 중', review: '검토', done: '완료' }
const STATUS_COLOR = { todo: '#94a3b8', in_progress: '#3b82f6', review: '#f59e0b', done: '#10b981' }
const PRIORITY_LABEL = { urgent: '긴급', high: '높음', normal: '보통', low: '낮음' }
const PRIORITY_COLOR = { urgent: '#ef4444', high: '#f59e0b', normal: '#3b82f6', low: '#94a3b8' }

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-card ${className}`}>
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">{title}</h2>
      {children}
    </div>
  )
}

export default function Stats() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/dashboard/stats').then(r => r.data),
  })

  if (isLoading) return <div className="p-6 text-slate-400">통계를 불러오는 중...</div>

  const weekly = data?.weekly_completed || []
  const byUser = data?.by_user || []
  const byProject = data?.by_project || []
  const statusCounts = data?.status_counts || {}
  const priorityCounts = data?.priority_counts || {}

  const maxWeek = Math.max(...weekly.map(w => w.count), 1)
  const maxUser = Math.max(...byUser.map(u => u.total), 1)
  const totalStatus = Object.values(statusCounts).reduce((a, b) => a + b, 0) || 1
  const totalPriority = Object.values(priorityCounts).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">통계</h1>

      {/* 완료 추이 */}
      <Card title="주간 완료 추이 (최근 8주)">
        {weekly.length === 0 ? (
          <div className="text-sm text-slate-400 py-8 text-center">완료된 태스크가 없습니다</div>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {weekly.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-xs text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">{w.count}</div>
                <div className="w-full bg-blue-500 dark:bg-blue-600 rounded-t-md transition-all hover:bg-blue-600"
                  style={{ height: `${Math.max((w.count / maxWeek) * 100, 3)}%` }} title={`${w.week}: ${w.count}건`} />
                <div className="text-[10px] text-slate-400">{w.week}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 팀원별 생산성 */}
        <Card title="팀원별 담당 태스크">
          {byUser.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">데이터 없음</div>
          ) : (
            <div className="space-y-3">
              {byUser.map(u => (
                <div key={u.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{u.name}</span>
                    <span className="text-slate-400">완료 {u.done} / 전체 {u.total}</span>
                  </div>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <div className="bg-emerald-500" style={{ width: `${(u.done / maxUser) * 100}%` }} title={`완료 ${u.done}`} />
                    <div className="bg-blue-500" style={{ width: `${(u.in_progress / maxUser) * 100}%` }} title={`진행 ${u.in_progress}`} />
                    <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${(u.todo / maxUser) * 100}%` }} title={`할일 ${u.todo}`} />
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> 완료</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> 진행</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" /> 할일</span>
              </div>
            </div>
          )}
        </Card>

        {/* 프로젝트별 진행률 */}
        <Card title="프로젝트별 진행률">
          {byProject.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">진행 중인 프로젝트 없음</div>
          ) : (
            <div className="space-y-3">
              {byProject.map(p => (
                <div key={p.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color || '#6366f1' }} />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="text-slate-400 flex-shrink-0">{p.done}/{p.total} · {p.progress}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${p.progress}%`, background: p.color || '#6366f1' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 상태 분포 */}
        <Card title="상태 분포">
          <div className="space-y-2.5">
            {['todo', 'in_progress', 'review', 'done'].map(s => {
              const c = statusCounts[s] || 0
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-xs w-14 text-slate-500 dark:text-slate-400 flex-shrink-0">{STATUS_LABEL[s]}</span>
                  <div className="flex-1 h-4 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-md" style={{ width: `${(c / totalStatus) * 100}%`, background: STATUS_COLOR[s] }} />
                  </div>
                  <span className="text-xs w-8 text-right text-slate-600 dark:text-slate-300 font-medium">{c}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 우선순위 분포 */}
        <Card title="우선순위 분포">
          <div className="space-y-2.5">
            {['urgent', 'high', 'normal', 'low'].map(p => {
              const c = priorityCounts[p] || 0
              return (
                <div key={p} className="flex items-center gap-2">
                  <span className="text-xs w-14 text-slate-500 dark:text-slate-400 flex-shrink-0">{PRIORITY_LABEL[p]}</span>
                  <div className="flex-1 h-4 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-md" style={{ width: `${(c / totalPriority) * 100}%`, background: PRIORITY_COLOR[p] }} />
                  </div>
                  <span className="text-xs w-8 text-right text-slate-600 dark:text-slate-300 font-medium">{c}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
