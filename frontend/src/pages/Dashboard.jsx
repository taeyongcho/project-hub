import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import useAuth from '../store/auth'
import dayjs from 'dayjs'

function StatCard({ label, value, sub, color = 'text-blue-600', bg = 'bg-blue-50' }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${bg} mb-3`}>
        <span className={`text-xl font-bold ${color}`}>{value}</span>
      </div>
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
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
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-slate-900">안녕하세요, {user?.name}님</h1>
        <p className="text-slate-400 text-sm mt-1">{dayjs().format('YYYY년 MM월 DD일 dddd')}</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-7">
        <StatCard label="진행 중 태스크" value={tasks?.length || 0}
          color="text-blue-600" bg="bg-blue-50" />
        <StatCard label="답장 미처리 메일" value={overdue?.length || 0}
          sub="2일 이상 미답장"
          color={overdue?.length > 0 ? 'text-red-600' : 'text-slate-400'}
          bg={overdue?.length > 0 ? 'bg-red-50' : 'bg-slate-50'} />
        <StatCard label="활성 프로젝트" value={activeProjects.length}
          color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard label="마감 임박 태스크" value={dueSoon.length}
          sub="3일 이내"
          color={dueSoon.length > 0 ? 'text-amber-600' : 'text-slate-400'}
          bg={dueSoon.length > 0 ? 'bg-amber-50' : 'bg-slate-50'} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 답장 필요 메일 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">답장 미처리 메일</h2>
            <button onClick={() => navigate('/emails?status=pending')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium">전체 보기</button>
          </div>
          {overdue?.length === 0
            ? <p className="text-slate-400 text-sm">미처리 메일 없음 ✓</p>
            : overdue?.slice(0, 5).map(e => (
              <div key={e.id} onClick={() => navigate('/emails')}
                className="py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">D+{e.days_waiting}</span>
                  <span className="text-xs text-slate-400">{dayjs(e.date_ts * 1000).format('MM/DD')}</span>
                </div>
                <div className="text-sm text-slate-700 truncate mt-1 font-medium">{e.subject}</div>
                <div className="text-xs text-slate-400 truncate">{e.from_}</div>
              </div>
            ))
          }
        </div>

        {/* 내 진행 중 태스크 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">내 진행 중 태스크</h2>
            <button onClick={() => navigate('/tasks')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium">전체 보기</button>
          </div>
          {tasks?.length === 0
            ? <p className="text-slate-400 text-sm">진행 중인 태스크 없음</p>
            : tasks?.slice(0, 6).map(t => (
              <div key={t.id} onClick={() => navigate('/tasks')}
                className="py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
                <div className="flex items-center gap-2">
                  <PriorityDot priority={t.priority} />
                  <span className="text-sm text-slate-700 truncate">{t.title}</span>
                </div>
                {t.due_date && (
                  <div className={`text-xs mt-1 ml-4 font-medium ${
                    dayjs(t.due_date).diff(dayjs(), 'day') < 0 ? 'text-red-500' :
                    dayjs(t.due_date).diff(dayjs(), 'day') <= 3 ? 'text-amber-500' : 'text-slate-400'
                  }`}>
                    {dayjs(t.due_date).format('~MM/DD')}
                  </div>
                )}
              </div>
            ))
          }
        </div>

        {/* 프로젝트 현황 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">프로젝트 현황</h2>
            <button onClick={() => navigate('/projects')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium">전체 보기</button>
          </div>
          {activeProjects.length === 0
            ? <p className="text-slate-400 text-sm">활성 프로젝트 없음</p>
            : activeProjects.slice(0, 5).map(p => (
              <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className="py-2.5 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  <span className="text-sm text-slate-700 truncate font-medium">{p.name}</span>
                  <span className="ml-auto text-xs text-slate-400 font-medium">{p.progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${p.progress}%`, background: p.color }} />
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
  const colors = { urgent: 'bg-red-400', high: 'bg-amber-400', normal: 'bg-blue-400', low: 'bg-slate-300' }
  return <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[priority] || 'bg-slate-300'}`} />
}
