import { useState } from 'react'
import { toast } from 'sonner'
import api from '../api/client'
import useAuth from '../store/auth'

export default function ForcePasswordChange() {
  const { user, updateUser, logout } = useAuth()
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (newPw.length < 4) return toast.error('새 비밀번호는 4자 이상이어야 합니다')
    if (newPw !== newPw2) return toast.error('새 비밀번호가 일치하지 않습니다')
    if (newPw === curPw) return toast.error('기존(사번)과 다른 비밀번호로 설정하세요')
    setBusy(true)
    try {
      await api.patch('/users/me/password', { current_password: curPw, new_password: newPw })
      updateUser({ must_change_password: false })
      toast.success('비밀번호가 변경되었습니다')
    } catch (err) {
      toast.error(err.response?.data?.detail || '비밀번호 변경 실패')
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg text-white text-xl">🔑</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">비밀번호 변경 필요</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {user?.name}님, 처음 로그인하셨습니다.<br />보안을 위해 초기 비밀번호(사번)를 변경해주세요.
          </div>
        </div>
        <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-card border border-slate-200 dark:border-slate-700 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">현재 비밀번호 (사번)</label>
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)}
              className={inputCls} placeholder="사번" autoComplete="current-password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">새 비밀번호</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              className={inputCls} placeholder="새 비밀번호" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">새 비밀번호 확인</label>
            <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)}
              className={inputCls} placeholder="새 비밀번호 확인" autoComplete="new-password" />
          </div>
          <button type="submit" disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors shadow-sm">
            {busy ? '변경 중...' : '비밀번호 변경'}
          </button>
          <button type="button" onClick={logout}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            로그아웃
          </button>
        </form>
      </div>
    </div>
  )
}
