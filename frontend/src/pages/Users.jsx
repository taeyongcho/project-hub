import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../api/client'
import useAuth from '../store/auth'

const ROLE_LABELS = { admin: '관리자', member: '팀원', viewer: '열람자' }
const ROLE_COLORS = {
  admin: 'bg-violet-100 text-violet-700',
  member: 'bg-blue-100 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600'
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
      toast.success('사용자가 생성되었습니다')
    },
    onError: (err) => toast.error(err.response?.data?.detail || '사용자 생성 실패')
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }) => api.patch(`/users/${id}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('역할이 변경되었습니다')
    },
    onError: (err) => toast.error(err.response?.data?.detail || '역할 변경 실패')
  })

  const deactivateMut = useMutation({
    mutationFn: id => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('사용자가 비활성화되었습니다')
    },
    onError: (err) => toast.error(err.response?.data?.detail || '비활성화 실패')
  })

  if (me?.role !== 'admin') {
    return <div className="p-6 text-slate-400">접근 권한이 없습니다.</div>
  }

  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">사용자 관리</h1>
          <p className="text-sm text-slate-400 mt-0.5">총 {users.length}명</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
          + 사용자 초대
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-5 mb-6 border border-slate-200 shadow-card">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">새 사용자 초대</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">이름 *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className={inputCls} placeholder="홍길동" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">이메일 *</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className={inputCls} placeholder="user@company.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">초기 비밀번호 *</label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className={inputCls} placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">역할</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={inputCls}>
                <option value="member">팀원</option>
                <option value="admin">관리자</option>
                <option value="viewer">열람자</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 transition-colors">취소</button>
            <button onClick={() => form.name && form.email && form.password && createMut.mutate(form)}
              className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              초대
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
              <th className="text-left py-3 px-4">이름</th>
              <th className="text-left py-3 px-4">이메일</th>
              <th className="text-left py-3 px-4">역할</th>
              <th className="text-left py-3 px-4">상태</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm text-blue-700 font-bold flex-shrink-0">
                      {u.name[0]}
                    </div>
                    <span className="font-medium text-slate-800">{u.name}</span>
                    {u.id === me?.id && <span className="text-xs text-slate-400">(나)</span>}
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-500">{u.email}</td>
                <td className="py-3 px-4">
                  {u.id === me?.id ? (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  ) : (
                    <select value={u.role} onChange={e => roleMut.mutate({ id: u.id, role: e.target.value })}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="member">팀원</option>
                      <option value="admin">관리자</option>
                      <option value="viewer">열람자</option>
                    </select>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {u.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  {u.id !== me?.id && u.is_active && (
                    <button
                      onClick={() => confirm(`'${u.name}' 계정을 비활성화할까요?`) && deactivateMut.mutate(u.id)}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors font-medium">
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
