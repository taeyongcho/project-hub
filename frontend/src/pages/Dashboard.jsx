import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import { PenTool } from 'lucide-react'
import api from '../api/client'
import useAuth from '../store/auth'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/ko'

dayjs.extend(relativeTime)
dayjs.locale('ko')

const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: '완료' }
const STATUS_COLOR = { todo: '#6366f1', in_progress: '#f59e0b', review: '#3b82f6', done: '#10b981' }
const PRIORITY_LABEL = { urgent: '긴급', high: '높음', normal: '보통', low: '낮음' }
const PRIORITY_COLOR = { urgent: '#ef4444', high: '#f97316', normal: '#6366f1', low: '#94a3b8' }

function DonutChart({ data, total }) {
  const size = 160
  const r = 58
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r

  let offset = 0
  const slices = data.map(d => {
    const pct = total > 0 ? d.value / total : 0
    const dash = pct * circumference
    const slice = { ...d, dash, offset, pct }
    offset += dash
    return slice
  })

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={20} />
        {slices.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={20}
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt" />
        ))}
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold text-slate-800">{total.toLocaleString()}</div>
        <div className="text-xs text-slate-400 mt-0.5">총 태스크</div>
      </div>
    </div>
  )
}

function ActivityIcon({ status }) {
  if (status === 'done') return (
    <span className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600 text-sm">✓</span>
  )
  if (status === 'in_progress') return (
    <span className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-600 text-sm">▶</span>
  )
  if (status === 'review') return (
    <span className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 text-sm">⊙</span>
  )
  return (
    <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-500 text-sm">+</span>
  )
}

function StatCard({ icon, value, label, sub, accent }) {
  const accents = {
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    violet: 'text-violet-600 bg-violet-50',
  }
  const cls = accents[accent] || accents.blue
  return (
    <div className="bg-white rounded-2xl px-5 py-4 border border-slate-200 shadow-card flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${cls}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-800 leading-none">{value}</div>
        <div className="text-sm font-medium text-slate-600 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { onSelectTask } = useOutletContext()

  const createWhiteboardMut = useMutation({
    mutationFn: () => api.post('/whiteboards', { name: `${user?.name}의 화이트보드` }).then(r => r.data),
    onSuccess: (data) => {
      toast.success('화이트보드가 생성되었습니다')
      navigate(`/whiteboard/${data.id}`)
    },
    onError: () => toast.error('화이트보드 생성 실패')
  })

  const { data: myTasks } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api.get(`/tasks?assigned_to_id=${user?.id}&status=in_progress`).then(r => r.data)
  })

  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get('/dashboard/summary').then(r => r.data)
  })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const activeProjects = projects?.filter(p => p.status === 'active') || []

  const statusCounts = summary?.status_counts || {}
  const totalTasks = Object.values(statusCounts).reduce((a, b) => a + b, 0)
  const donutData = ['in_progress', 'todo', 'review', 'done']
    .filter(s => statusCounts[s])
    .map(s => ({ label: STATUS_LABEL[s], value: statusCounts[s], color: STATUS_COLOR[s] }))

  const priorityCounts = summary?.priority_counts || {}
  const maxPriority = Math.max(...Object.values(priorityCounts), 1)

  const activities = summary?.activities || []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">안녕하세요, {user?.name}님 👋</h1>
          <p className="text-slate-400 text-sm mt-1">{dayjs().format('YYYY년 MM월 DD일 dddd')}</p>
        </div>
        <button
          onClick={() => navigate('/whiteboards')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
        >
          <PenTool size={18} />
          화이트보드
        </button>
      </div>

      {/* 상단 통계 4개 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard icon="✓" value={summary?.stats?.done_week ?? '-'} label="완료함" sub="지난 7일간" accent="emerald" />
        <StatCard icon="✎" value={summary?.stats?.created_week ?? '-'} label="새 태스크" sub="지난 7일간" accent="blue" />
        <StatCard icon="⊡" value={myTasks?.length ?? '-'} label="내 진행 중" sub="현재" accent="amber" />
        <StatCard icon="⏰" value={summary?.stats?.due_soon ?? '-'} label="마감 예정" sub="다음 7일 이내" accent="violet" />
      </div>

      {/* 메인 2분할 */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* 상태 개요 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">상태 개요</h2>
              <p className="text-xs text-slate-400 mt-0.5">태스크 상태 분포</p>
            </div>
            <button onClick={() => navigate('/tasks')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium">모든 태스크 보기 →</button>
          </div>
          <div className="flex items-center gap-8">
            {totalTasks > 0
              ? <DonutChart data={donutData} total={totalTasks} />
              : <div className="w-40 h-40 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-sm">데이터 없음</div>
            }
            <div className="space-y-2.5 flex-1">
              {donutData.map(d => (
                <div key={d.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-sm text-slate-600">{d.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">{d.value.toLocaleString()}</span>
                </div>
              ))}
              {donutData.length === 0 && (
                <p className="text-slate-400 text-sm">태스크가 없습니다</p>
              )}
            </div>
          </div>
        </div>

        {/* 최근 활동 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">최근 활동</h2>
              <p className="text-xs text-slate-400 mt-0.5">최근 생성된 태스크</p>
            </div>
          </div>
          <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
            {activities.length === 0
              ? <p className="text-slate-400 text-sm">활동 없음</p>
              : activities.slice(0, 10).map((a, i) => (
                <div key={i} className="flex items-start gap-3 group cursor-pointer"
                  onClick={() => onSelectTask(a.id)}>
                  <ActivityIcon status={a.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-700 truncate font-medium group-hover:text-blue-600 transition-colors">
                        {a.title}
                      </span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{dayjs(a.ts).fromNow()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-slate-400">{a.actor}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{ background: STATUS_COLOR[a.status] + '20', color: STATUS_COLOR[a.status] }}>
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* 하단 2분할 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 우선순위 분포 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-800">우선순위 분포</h2>
            <p className="text-xs text-slate-400 mt-0.5">태스크 우선순위별 현황</p>
          </div>
          <div className="space-y-3">
            {['urgent', 'high', 'normal', 'low'].map(p => {
              const count = priorityCounts[p] || 0
              const pct = Math.round(count / (totalTasks || 1) * 100)
              return (
                <div key={p}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLOR[p] }} />
                      <span className="text-slate-600 font-medium">{PRIORITY_LABEL[p]}</span>
                    </div>
                    <span className="text-slate-800 font-semibold">{count}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: PRIORITY_COLOR[p] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 프로젝트 현황 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">프로젝트 현황</h2>
              <p className="text-xs text-slate-400 mt-0.5">활성 프로젝트 {activeProjects.length}개</p>
            </div>
            <button onClick={() => navigate('/projects')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium">전체 보기 →</button>
          </div>
          {activeProjects.length === 0
            ? <p className="text-slate-400 text-sm">활성 프로젝트 없음</p>
            : activeProjects.slice(0, 5).map(p => (
              <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className="py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors group">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color || '#6366f1' }} />
                  <span className="text-sm text-slate-700 font-medium truncate group-hover:text-blue-600 transition-colors">{p.name}</span>
                  <span className="ml-auto text-xs font-semibold text-slate-500">{p.progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${p.progress}%`, background: p.color || '#6366f1' }} />
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}
