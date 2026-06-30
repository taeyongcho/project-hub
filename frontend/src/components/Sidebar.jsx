import { useState, useEffect, memo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Folder, CheckCircle, BarChart3, Mail, Clock, Users, Settings, Bell, Search, Sun, Moon, LogOut, PenTool, Server, MessageSquare } from 'lucide-react'
import useAuth from '../store/auth'
import { useTheme } from '../store/theme'
import api from '../api/client'
import SearchModal from './SearchModal'
import NotificationPanel from './NotificationPanel'

const TEAM_NAV = [
  { to: '/dashboard', icon: LayoutGrid, label: '대시보드' },
  { to: '/projects',  icon: Folder, label: '프로젝트' },
  { to: '/tasks',     icon: CheckCircle, label: '할 일'   },
  { to: '/reports',   icon: BarChart3, label: '보고서'  },
  { to: '/whiteboards', icon: PenTool, label: '화이트보드' },
]

// 채팅은 별도 팝업 창으로 (메인 화면을 가리지 않음)
const CHAT_W = 460, CHAT_H = 680
function openChatPopup() {
  const left = Math.max(0, Math.round((window.screen.width - CHAT_W) / 2))
  const top = Math.max(0, Math.round((window.screen.height - CHAT_H) / 2))
  window.open('/chat-popup', 'projecthub_chat',
    `width=${CHAT_W},height=${CHAT_H},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`)
}

const MY_NAV = [
  { to: '/emails',  icon: Mail, label: '내 이메일' },
  { to: '/worklog', icon: Clock, label: '업무일지'  },
  { to: '/system-links', icon: Server, label: '시스템 바로가기' },
]

export default memo(function Sidebar({ onSelectTask, onNavigate }) {
  const { user, logout } = useAuth()
  const { isDark, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [showSearch, setShowSearch] = useState(false)
  const [showNotif, setShowNotif] = useState(false)

  const { data: overdue } = useQuery({
    queryKey: ['overdue-reply'],
    queryFn: () => api.get('/emails/overdue-reply?days=2').then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: chatUnread } = useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => api.get('/chat/unread').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  })

  useEffect(() => {
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(s => !s)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const notifCount = notifData?.count || 0

  const navLinkCls = ({ isActive }) =>
    `flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
    }`

  return (
    <>
      <aside className="w-56 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full flex-shrink-0 relative">
        {/* 로고 */}
        <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Project Hub</div>
          <div className="text-xs text-slate-400 mt-0.5 font-medium">{user?.name}</div>
        </div>

        {/* 검색 */}
        <div className="px-3 pt-3 pb-1">
          <button
            onClick={() => setShowSearch(true)}
            className="w-full flex items-center gap-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-400 transition-colors group"
          >
            <Search size={18} className="text-slate-400" />
            <span className="flex-1 text-left">검색...</span>
            <kbd className="text-[10px] bg-white border border-slate-200 text-slate-400 px-1.5 py-0.5 rounded font-mono hidden group-hover:block">
              Ctrl K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-1.5" onClick={onNavigate}>
          {/* 팀 영역 */}
          <div className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
            팀 공유
          </div>
          {TEAM_NAV.map(item => (
            <NavLink key={item.to} to={item.to} className={navLinkCls}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          {/* 채팅: 클릭 시 별도 팝업 창 */}
          <button onClick={openChatPopup}
            className="w-full flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            style={{ width: 'calc(100% - 1rem)' }}>
            <MessageSquare size={18} />
            <span>채팅</span>
            {chatUnread?.total > 0 && (
              <span className="ml-auto text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                {chatUnread.total}
              </span>
            )}
          </button>

          {/* 프로젝트 목록 */}
          {projects?.length > 0 && (
            <>
              <div className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                프로젝트
              </div>
              {projects.filter(p => p.status === 'active').slice(0, 8).map(p => (
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

          {/* 개인 영역 */}
          <div className="px-5 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
            개인
          </div>
          {MY_NAV.map(item => (
            <NavLink key={item.to} to={item.to} className={navLinkCls}>
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.to === '/emails' && overdue?.length > 0 && (
                <span className="ml-auto text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                  {overdue.length}
                </span>
              )}
            </NavLink>
          ))}

          {/* 관리자 */}
          {user?.role === 'admin' && (
            <>
              <div className="px-5 pt-4 pb-1 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                관리
              </div>
              <NavLink
                to="/users"
                className={navLinkCls}
              >
                <Users size={18} />
                <span>사용자 관리</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* 하단 */}
        <div className="border-t border-slate-100 dark:border-slate-800">
          <div className="relative mx-2 my-1">
            <button
              onClick={() => setShowNotif(s => !s)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                showNotif ? 'bg-blue-50 text-blue-700' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bell size={18} />
              <span>알림</span>
              {notifCount > 0 && (
                <span className="ml-auto text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                  {notifCount}
                </span>
              )}
            </button>
            {showNotif && (
              <NotificationPanel
                onClose={() => setShowNotif(false)}
                onSelectTask={id => { onSelectTask(id); setShowNotif(false) }}
              />
            )}
          </div>

          <NavLink
            to="/email-settings"
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 mb-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`
            }
          >
            <Settings size={18} />
            <span>이메일 계정 설정</span>
          </NavLink>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 mx-2 mb-1 px-3 py-2 rounded-lg text-sm font-medium transition-all text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
            <span>{isDark ? '라이트 모드' : '다크 모드'}</span>
          </button>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="w-full flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <LogOut size={18} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSelectTask={id => { onSelectTask(id); setShowSearch(false) }}
        />
      )}
    </>
  )
})
