import { NavLink, useNavigate } from 'react-router-dom'
import useAuth from '../store/auth'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

const nav = [
  { to: '/dashboard', icon: '▦', label: '대시보드' },
  { to: '/emails', icon: '✉', label: '이메일' },
  { to: '/projects', icon: '◈', label: '프로젝트' },
  { to: '/tasks', icon: '✓', label: '할 일' },
  { to: '/worklog', icon: '◷', label: '업무일지' },
  { to: '/reports', icon: '▤', label: '보고서' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const { data: overdue } = useQuery({
    queryKey: ['overdue-reply'],
    queryFn: () => api.get('/emails/overdue-reply?days=2').then(r => r.data),
    refetchInterval: 60000
  })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex flex-col h-full flex-shrink-0">
      {/* 로고 */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="text-base font-bold text-slate-900 tracking-tight">Project Hub</div>
        <div className="text-xs text-slate-400 mt-0.5 font-medium">{user?.name}</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {nav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span>{item.label}</span>
            {item.to === '/emails' && overdue?.length > 0 && (
              <span className="ml-auto text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                {overdue.length}
              </span>
            )}
          </NavLink>
        ))}

        {projects?.length > 0 && (
          <>
            <div className="px-5 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              프로젝트
            </div>
            {projects.slice(0, 8).map(p => (
              <NavLink
                key={p.id}
                to={`/projects/${p.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 mx-2 px-3 py-1.5 rounded-lg text-sm truncate transition-all ${
                    isActive ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`
                }
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <span className="truncate">{p.name}</span>
              </NavLink>
            ))}
          </>
        )}

        {user?.role === 'admin' && (
          <>
            <div className="px-5 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
              관리
            </div>
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`
              }
            >
              <span>◎</span><span>사용자 관리</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* 하단 */}
      <div className="border-t border-slate-100">
        <NavLink
          to="/email-settings"
          className={({ isActive }) =>
            `flex items-center gap-3 mx-2 my-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`
          }
        >
          <span>⚙</span><span>이메일 계정 설정</span>
        </NavLink>
        <button
          onClick={handleLogout}
          className="w-full text-left text-sm text-slate-400 hover:text-slate-700 px-5 py-2.5 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
