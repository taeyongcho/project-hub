import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { io } from 'socket.io-client'
import Sidebar from './Sidebar'
import TaskDetailPanel from './TaskDetailPanel'
import useAuth from '../store/auth'
import usePresence from '../store/presence'

export default function Layout() {
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user } = useAuth()
  const setOnline = usePresence(s => s.setOnline)

  // 앱 로그인 상태면 전역으로 접속 신호 전송 (채팅 안 켜도 온라인)
  useEffect(() => {
    if (!user?.id) return
    const socket = io(window.location.origin, { path: '/socket.io', transports: ['websocket', 'polling'] })
    const join = () => socket.emit('presence_join', { userId: user.id })
    socket.on('connect', join)
    join()
    socket.on('presence', (d) => setOnline(d.online || []))
    return () => socket.disconnect()
  }, [user?.id, setOnline])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* 사이드바: 데스크탑 고정 / 모바일 드로어 */}
      <div className={`
        fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onSelectTask={(id) => { setSelectedTaskId(id); setMobileOpen(false) }} onNavigate={() => setMobileOpen(false)} />
      </div>

      {/* 모바일 백드롭 */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* 모바일 상단바 */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="text-slate-600 dark:text-slate-300">
            <Menu size={22} />
          </button>
          <span className="font-bold text-slate-900 dark:text-white">어센틱웍스</span>
        </div>

        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <Outlet context={{ onSelectTask: setSelectedTaskId }} />
        </main>
      </div>

      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  )
}
