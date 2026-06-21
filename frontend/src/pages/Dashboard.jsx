import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuth from '../store/auth'
import dayjs from 'dayjs'

function StatCard({ label, value, sub, color = 'text-blue-400' }) {
  return (
    <div className="bg-[#1e293b] rounded-xl p-5">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-slate-300 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: tasks } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api.get(`/tasks?assigned_to_id=${user?.id}&status=in_progress`).then(r => r.data)
  })

  const { data: overdue } = useQuery({
    queryKey: ['overdue-reply'],
    queryFn: () => api.get('/emails/overdue-reply?days=2').then(r => r.data)
  })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const { data: todoDue } = useQuery({
    queryKey: ['due-tasks'],
    queryFn: () => api.get('/tasks?status=todo').then(r => r.data)
  })

  const dueSoon = todoDue?.filter(t => {
    if (!t.due_date) return false
    return dayjs(t.due_date).diff(dayjs(), 'day') <= 3
  }) || []

  const activeProjects = projects?.filter(p => p.status === 'active') || []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">안녕하세요, {user?.name}님 👋</h1>
        <p className="text-slate-400 text-sm mt-1">{dayjs().format('YYYY년 MM월 DD일 dddd')}</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="진행 중 태스크" value={tasks?.length || 0} color="text-blue-400" />
        <StatCard label="답장 미처리 메일" value={overdue?.length || 0}
          sub="2일 이상 미답장" color={overdue?.length > 0 ? 'text-red-400' : 'text-slate-400'} />
        <StatCard label="활성 프로젝트" value={activeProjects.length} color="text-emerald-400" />
        <StatCard label="마감 임박 태스크" value={dueSoon.length}
          sub="3일 이내" color={dueSoon.length > 0 ? 'text-amber-400' : 'text-slate-400'} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 답장 필요 메일 */}
        <div className="bg-[#1e293b] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">⚠️ 답장 미처리 메일</h2>
            <button onClick={() => navigate('/emails?status=pending')}
              className="text-xs text-blue-400 hover:text-blue-300">전체 보기</button>
          </div>
          {overdue?.length === 0
            ? <p className="text-slate-500 text-sm">미처리 메일 없음</p>
            : overdue?.slice(0, 5).map(e => (
              <div key={e.id} onClick={() => navigate('/emails')}
                className="py-2 border-b border-slate-700 last:border-0 cursor-pointer hover:bg-slate-800/50 -mx-2 px-2 rounded transition-colors">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-red-400 font-semibold">D+{e.days_waiting}</div>
                  <div className="text-xs text-slate-500">{dayjs(e.date_ts * 1000).format('MM/DD')}</div>
                </div>
                <div className="text-sm text-slate-300 truncate mt-0.5">{e.subject}</div>
                <div className="text-xs text-slate-500 truncate">{e.from_}</div>
              </div>
            ))
          }
        </div>

        {/* 내 진행 중 태스크 */}
        <div className="bg-[#1e293b] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">✅ 내 진행 중 태스크</h2>
            <button onClick={() => navigate('/tasks')}
              className="text-xs text-blue-400 hover:text-blue-300">전체 보기</button>
          </div>
          {tasks?.length === 0
            ? <p className="text-slate-500 text-sm">진행 중인 태스크 없음</p>
            : tasks?.slice(0, 6).map(t => (
              <div key={t.id} onClick={() => navigate('/tasks')}
                className="py-2 border-b border-slate-700 last:border-0 cursor-pointer hover:bg-slate-800/50 -mx-2 px-2 rounded transition-colors">
                <div className="flex items-center gap-2">
                  <PriorityDot priority={t.priority} />
                  <span className="text-sm text-slate-300 truncate">{t.title}</span>
                </div>
                {t.due_date && (
                  <div className={`text-xs mt-0.5 ml-4 ${
                    dayjs(t.due_date).diff(dayjs(), 'day') < 0 ? 'text-red-400' :
                    dayjs(t.due_date).diff(dayjs(), 'day') <= 3 ? 'text-amber-400' : 'text-slate-500'
                  }`}>
                    {dayjs(t.due_date).format('~MM/DD')}
                  </div>
                )}
              </div>
            ))
          }
        </div>

        {/* 프로젝트 현황 */}
        <div className="bg-[#1e293b] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">📁 프로젝트 현황</h2>
            <button onClick={() => navigate('/projects')}
              className="text-xs text-blue-400 hover:text-blue-300">전체 보기</button>
          </div>
          {activeProjects.length === 0
            ? <p className="text-slate-500 text-sm">활성 프로젝트 없음</p>
            : activeProjects.slice(0, 5).map(p => (
              <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className="py-2 border-b border-slate-700 last:border-0 cursor-pointer hover:bg-slate-800/50 -mx-2 px-2 rounded transition-colors">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  <span className="text-sm text-slate-300 truncate">{p.name}</span>
                  <span className="ml-auto text-xs text-slate-500">{p.progress}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1">
                  <div className="h-1 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${p.progress}%` }} />
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function PriorityDot({ priority }) {
  const colors = { urgent: 'bg-red-500', high: 'bg-amber-500', normal: 'bg-blue-500', low: 'bg-slate-500' }
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[priority] || 'bg-slate-500'}`} />
}
