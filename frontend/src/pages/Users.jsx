import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import useAuth from '../store/auth'

const ROLE_LABELS = { admin: '관리자', member: '팀원', viewer: '열람자' }
const ROLE_COLORS = {
  admin: 'bg-purple-900/50 text-purple-300',
  member: 'bg-blue-900/50 text-blue-300',
  viewer: 'bg-slate-800 text-slate-400'
}

export default function Users() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data)
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowForm(false)
      setForm({ name: '', email: '', password: '', role: 'member' })
    }
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }) => api.patch(`/users/${id}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] })
  })

  const deactivateMut = useMutation({
    mutationFn: id => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] })
  })

  if (me?.role !== 'admin') {
    return <div className="p-6 text-slate-500">접근 권한이 없습니다.</div>
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">사용자 관리</h1>
          <p className="text-sm text-slate-500 mt-0.5">총 {users.length}명</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">
          + 사용자 초대
        </button>
      </div>

      {/* 초대 폼 */}
      {showForm && (
        <div className="bg-[#1e293b] rounded-xl p-5 mb-6 border border-slate-700">
          <h2 className="text-sm font-semibold text-white mb-4">새 사용자 초대</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">이름 *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="홍길동" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">이메일 *</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="user@company.com" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">초기 비밀번호 *</label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">역할</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="member">팀원</option>
                <option value="admin">관리자</option>
                <option value="viewer">열람자</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm text-slate-400 hover:text-slate-200 px-4 py-2">취소</button>
            <button onClick={() => form.name && form.email && form.password && createMut.mutate(form)}
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">초대</button>
          </div>
        </div>
      )}

      {/* 사용자 목록 */}
      <div className="bg-[#1e293b] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
              <th className="text-left py-3 px-4">이름</th>
              <th className="text-left py-3 px-4">이메일</th>
              <th className="text-left py-3 px-4">역할</th>
              <th className="text-left py-3 px-4">상태</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center text-xs text-blue-300 font-semibold flex-shrink-0">
                      {u.name[0]}
                    </div>
                    <span className="text-slate-200">{u.name}</span>
                    {u.id === me?.id && <span className="text-xs text-slate-600">(나)</span>}
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-400">{u.email}</td>
                <td className="py-3 px-4">
                  {u.id === me?.id ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  ) : (
                    <select value={u.role}
                      onChange={e => roleMut.mutate({ id: u.id, role: e.target.value })}
                      className="bg-[#0f172a] border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none">
                      <option value="member">팀원</option>
                      <option value="admin">관리자</option>
                      <option value="viewer">열람자</option>
                    </select>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    u.is_active ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {u.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  {u.id !== me?.id && u.is_active && (
                    <button
                      onClick={() => confirm(`'${u.name}' 계정을 비활성화할까요?`) && deactivateMut.mutate(u.id)}
                      className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                    >
                      비활성화
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
