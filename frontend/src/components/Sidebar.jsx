import { NavLink, useNavigate } from 'react-router-dom'
import useAuth from '../store/auth'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

const nav = [
  { to: '/dashboard', icon: '⚡', label: '대시보드' },
  { to: '/emails', icon: '📧', label: '이메일' },
  { to: '/projects', icon: '📁', label: '프로젝트' },
  { to: '/tasks', icon: '✅', label: '할일' },
  { to: '/worklog', icon: '📓', label: '업무일지' },
  { to: '/reports', icon: '📊', label: '보고서' },
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
    <aside className="w-56 bg-[#0a0f1a] border-r border-slate-800 flex flex-col h-full flex-shrink-0">
      <div className="p-4 border-b border-slate-800">
        <div className="text-lg font-bold text-white">Project Hub</div>
        <div className="text-xs text-slate-500 mt-0.5">{user?.name}</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {nav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.to === '/emails' && overdue?.length > 0 && (
              <span className="ml-auto text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full">
                {overdue.length}
              </span>
            )}
          </NavLink>
        ))}

        {projects?.length > 0 && (
          <>
            <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
              프로젝트
            </div>
            {projects.slice(0, 8).map(p => (
              <NavLink
                key={p.id}
                to={`/projects/${p.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 text-sm truncate transition-colors ${
                    isActive ? 'text-white bg-slate-800' : 'text-slate-500 hover:text-slate-300'
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
            <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
              관리
            </div>
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <span>👥</span><span>사용자 관리</span>
            </NavLink>
          </>
        )}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded transition-colors"
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
