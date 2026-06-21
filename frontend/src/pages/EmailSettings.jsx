import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import useAuth from '../store/auth'

const EMPTY_FORM = {
  name: '', email: '', username: '', password: '',
  pop3_host: '', pop3_port: 995, pop3_ssl: true,
  smtp_host: '', smtp_port: 587, smtp_tls: true,
}

export default function EmailSettings() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fetchStatus, setFetchStatus] = useState({})
  const [showCompose, setShowCompose] = useState(null)
  const [compose, setCompose] = useState({ to: '', subject: '', body: '', cc: '' })

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: () => api.get('/email-accounts').then(r => r.data)
  })

  const saveMut = useMutation({
    mutationFn: data => editId
      ? api.patch(`/email-accounts/${editId}`, data)
      : api.post('/email-accounts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-accounts'] })
      setShowForm(false)
      setEditId(null)
      setForm(EMPTY_FORM)
    }
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/email-accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-accounts'] })
  })

  const sendMut = useMutation({
    mutationFn: data => api.post('/email-accounts/send', data),
    onSuccess: () => {
      setShowCompose(null)
      setCompose({ to: '', subject: '', body: '', cc: '' })
      alert('발송 완료')
    },
    onError: err => alert('발송 실패: ' + (err.response?.data?.detail || err.message))
  })

  async function handleFetch(accountId) {
    setFetchStatus(p => ({ ...p, [accountId]: 'loading' }))
    try {
      const { data } = await api.post(`/email-accounts/${accountId}/fetch`)
      setFetchStatus(p => ({ ...p, [accountId]: `${data.imported}건 수신` }))
      qc.invalidateQueries({ queryKey: ['emails'] })
    } catch (e) {
      setFetchStatus(p => ({ ...p, [accountId]: '실패: ' + (e.response?.data?.detail || e.message) }))
    }
  }

  function openEdit(acc) {
    setForm({ ...acc, password: '' })
    setEditId(acc.id)
    setShowForm(true)
  }

  function F(key) {
    return e => setForm(p => ({ ...p, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">이메일 계정 설정</h1>
          <p className="text-sm text-slate-500 mt-0.5">POP3 수신 / SMTP 발신 계정 관리</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM) }}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">
            + 계정 추가
          </button>
        )}
      </div>

      {/* 계정 추가/수정 폼 */}
      {showForm && (
        <div className="bg-[#1e293b] rounded-xl p-5 mb-6 border border-slate-700">
          <h2 className="text-sm font-semibold text-white mb-4">
            {editId ? '계정 수정' : '새 계정 추가'}
          </h2>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="계정 이름" value={form.name} onChange={F('name')} placeholder="회사 메일" />
            <Field label="이메일 주소" value={form.email} onChange={F('email')} placeholder="user@company.com" />
            <Field label="사용자명 (로그인 ID)" value={form.username} onChange={F('username')} placeholder="user@company.com" />
            <Field label={editId ? '비밀번호 (변경시만)' : '비밀번호'} value={form.password}
              onChange={F('password')} type="password" placeholder="••••••••" />
          </div>

          <div className="border-t border-slate-700 pt-4 mb-4">
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">POP3 수신 설정</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="POP3 서버" value={form.pop3_host} onChange={F('pop3_host')} placeholder="pop.gmail.com" className="col-span-1" />
              <Field label="포트" value={form.pop3_port} onChange={F('pop3_port')} type="number" />
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.pop3_ssl} onChange={F('pop3_ssl')} className="accent-blue-500" />
                  SSL 사용
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4 mb-4">
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">SMTP 발신 설정</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="SMTP 서버" value={form.smtp_host} onChange={F('smtp_host')} placeholder="smtp.gmail.com" />
              <Field label="포트" value={form.smtp_port} onChange={F('smtp_port')} type="number" />
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.smtp_tls} onChange={F('smtp_tls')} className="accent-blue-500" />
                  STARTTLS 사용
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null) }}
              className="text-sm text-slate-400 hover:text-slate-200 px-4 py-2">취소</button>
            <button onClick={() => {
              const data = { ...form }
              if (!data.password) delete data.password
              saveMut.mutate(data)
            }}
              disabled={saveMut.isPending}
              className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors">
              {saveMut.isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* 계정 목록 */}
      {accounts.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <div className="text-4xl mb-3">📭</div>
          <div>등록된 이메일 계정이 없습니다.</div>
          {isAdmin && <div className="text-xs mt-1">+ 계정 추가 버튼으로 POP3/SMTP 계정을 등록하세요.</div>}
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-[#1e293b] rounded-xl p-4 border border-slate-700">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{acc.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${acc.is_active ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {acc.is_active ? '활성' : '비활성'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400 mt-0.5">{acc.email}</div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(acc)}
                      className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 px-2 py-1 rounded transition-colors">
                      수정
                    </button>
                    <button onClick={() => confirm('삭제할까요?') && deleteMut.mutate(acc.id)}
                      className="text-xs text-slate-500 hover:text-red-400 border border-slate-700 px-2 py-1 rounded transition-colors">
                      삭제
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 mb-3">
                <div>
                  <span className="text-slate-600">POP3</span>{' '}
                  {acc.pop3_host ? `${acc.pop3_host}:${acc.pop3_port} ${acc.pop3_ssl ? '(SSL)' : ''}` : '미설정'}
                </div>
                <div>
                  <span className="text-slate-600">SMTP</span>{' '}
                  {acc.smtp_host ? `${acc.smtp_host}:${acc.smtp_port} ${acc.smtp_tls ? '(TLS)' : '(SSL)'}` : '미설정'}
                </div>
              </div>

              <div className="flex gap-2 items-center">
                {acc.pop3_host && (
                  <button onClick={() => handleFetch(acc.id)}
                    disabled={fetchStatus[acc.id] === 'loading'}
                    className="text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                    {fetchStatus[acc.id] === 'loading' ? '수신 중...' : '📥 메일 수신'}
                  </button>
                )}
                {acc.smtp_host && (
                  <button onClick={() => setShowCompose(acc.id)}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                    ✉️ 메일 작성
                  </button>
                )}
                {fetchStatus[acc.id] && fetchStatus[acc.id] !== 'loading' && (
                  <span className="text-xs text-slate-400">{fetchStatus[acc.id]}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 메일 작성 모달 */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] rounded-xl p-6 w-full max-w-lg border border-slate-700">
            <h2 className="text-white font-semibold mb-4">메일 작성</h2>
            <div className="space-y-3">
              <Field label="받는사람 (,로 구분)" value={compose.to} onChange={e => setCompose(p => ({ ...p, to: e.target.value }))} placeholder="to@company.com" />
              <Field label="참조" value={compose.cc} onChange={e => setCompose(p => ({ ...p, cc: e.target.value }))} placeholder="cc@company.com" />
              <Field label="제목" value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))} />
              <div>
                <label className="text-xs text-slate-400 mb-1 block">본문</label>
                <textarea value={compose.body} onChange={e => setCompose(p => ({ ...p, body: e.target.value }))}
                  rows={8}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowCompose(null)}
                className="text-sm text-slate-400 hover:text-slate-200 px-4 py-2">취소</button>
              <button onClick={() => compose.to && compose.subject && sendMut.mutate({
                account_id: showCompose, ...compose
              })}
                disabled={sendMut.isPending}
                className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors">
                {sendMut.isPending ? '발송 중...' : '발송'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', className = '' }) {
  return (
    <div className={className}>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
    </div>
  )
}
