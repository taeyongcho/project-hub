import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import api from '../api/client'
import useAuth from '../store/auth'
import Avatar from './Avatar'

const CHARACTERS = [
  '🙂','😎','🤓','🥳','😺','🐶','🐱','🦊','🐻','🐼','🐨','🐯','🦁','🐸','🐵','🐧',
  '🦄','🐲','🦉','🦅','🐢','🐙','🦖','🤖','👻','👽','🎃','🦸','🦹','🧙','🧑‍💻','🧑‍🚀',
  '🌟','🔥','🌈','🍀','🌸','⚡','💎','🎯',
]
const COLORS = ['#3b82f6','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#8b5cf6','#ec4899','#64748b','#0ea5e9']

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuth()
  const [emoji, setEmoji] = useState(user?.avatar_emoji || '🙂')
  const [color, setColor] = useState(user?.avatar_color || '#3b82f6')
  const [name, setName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const changePw = async () => {
    if (!curPw || !newPw) { toast.error('비밀번호를 입력하세요'); return }
    if (newPw !== newPw2) { toast.error('새 비밀번호가 일치하지 않습니다'); return }
    setPwSaving(true)
    try {
      await api.patch('/users/me/password', { current_password: curPw, new_password: newPw })
      toast.success('비밀번호가 변경되었습니다')
      setCurPw(''); setNewPw(''); setNewPw2(''); setShowPw(false)
    } catch (e) {
      toast.error(e?.response?.data?.detail || '변경 실패')
    } finally { setPwSaving(false) }
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.patch('/users/me/profile', { name, avatar_emoji: emoji, avatar_color: color }).then(r => r.data)
      updateUser({ name: updated.name, avatar_emoji: updated.avatar_emoji, avatar_color: updated.avatar_color })
      toast.success('프로필이 저장되었습니다')
      onClose()
    } catch {
      toast.error('저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">내 캐릭터</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        {/* 미리보기 */}
        <div className="flex flex-col items-center mb-4">
          <Avatar emoji={emoji} color={color} size={72} />
          <input value={name} onChange={e => setName(e.target.value)}
            className="mt-3 text-center font-semibold text-slate-900 dark:text-white bg-transparent border-b border-slate-200 dark:border-slate-700 outline-none focus:border-blue-500 px-2 py-1" />
        </div>

        {/* 색상 */}
        <div className="mb-3">
          <div className="text-xs font-medium text-slate-500 mb-1.5">배경 색</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>

        {/* 캐릭터 */}
        <div className="mb-4">
          <div className="text-xs font-medium text-slate-500 mb-1.5">캐릭터</div>
          <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
            {CHARACTERS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`text-2xl p-1 rounded-lg transition-colors ${emoji === e ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 비밀번호 변경 */}
        <div className="border-t border-slate-100 dark:border-slate-800 mt-4 pt-3">
          <button onClick={() => setShowPw(v => !v)}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium">
            🔒 비밀번호 변경 {showPw ? '▲' : '▼'}
          </button>
          {showPw && (
            <div className="space-y-2 mt-2">
              <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="현재 비밀번호"
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="새 비밀번호"
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} placeholder="새 비밀번호 확인"
                onKeyDown={e => { if (e.key === 'Enter') changePw() }}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={changePw} disabled={pwSaving}
                className="w-full py-2 text-sm bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg font-medium">
                비밀번호 변경
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">닫기</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium">프로필 저장</button>
        </div>
      </div>
    </div>
  )
}
