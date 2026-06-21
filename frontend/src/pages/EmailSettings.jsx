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
      setShowForm(false); setEditId(null); setForm(EMPTY_FORM)
    }
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/email-accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-accounts'] })
  })

  const sendMut = useMutation({
    mutationFn: data => api.post('/email-accounts/send', data),
    onSuccess: () => { setShowCompose(null); setCompose({ to: '', subject: '', body: '', cc: '' }); alert('발송 완료') },
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

  function openEdit(acc) { setForm({ ...acc, password: '' }); setEditId(acc.id); setShowForm(true) }
  function F(key) {
    return e => setForm(p => ({ ...p, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  }

  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">이메일 계정 설정</h1>
          <p className="text-sm text-slate-400 mt-0.5">POP3 수신 / SMTP 발신 계정 관리</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(EMPTY_FORM) }}
          className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
          + 내 계정 추가
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-5 mb-6 border border-slate-200 shadow-card">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">{editId ? '계정 수정' : '새 계정 추가'}</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="계정 이름" value={form.name} onChange={F('name')} placeholder="회사 메일" cls={inputCls} />
            <Field label="이메일 주소" value={form.email} onChange={F('email')} placeholder="user@company.com" cls={inputCls} />
            <Field label="사용자명 (로그인 ID)" value={form.username} onChange={F('username')} placeholder="user@company.com" cls={inputCls} />
            <Field label={editId ? '비밀번호 (변경시만)' : '비밀번호'} value={form.password}
              onChange={F('password')} type="password" placeholder="••••••••" cls={inputCls} />
          </div>

          <div className="border-t border-slate-100 pt-4 mb-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">POP3 수신 설정</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="POP3 서버" value={form.pop3_host} onChange={F('pop3_host')} placeholder="pop.gmail.com" cls={inputCls} />
              <Field label="포트" value={form.pop3_port} onChange={F('pop3_port')} type="number" cls={inputCls} />
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer font-medium">
                  <input type="checkbox" checked={form.pop3_ssl} onChange={F('pop3_ssl')} className="accent-slate-900 w-4 h-4" />
                  SSL 사용
                </label>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mb-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">SMTP 발신 설정</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="SMTP 서버" value={form.smtp_host} onChange={F('smtp_host')} placeholder="smtp.gmail.com" cls={inputCls} />
              <Field label="포트" value={form.smtp_port} onChange={F('smtp_port')} type="number" cls={inputCls} />
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer font-medium">
                  <input type="checkbox" checked={form.smtp_tls} onChange={F('smtp_tls')} className="accent-slate-900 w-4 h-4" />
                  STARTTLS 사용
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null) }}
              className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 transition-colors">취소</button>
            <button onClick={() => { const d = { ...form }; if (!d.password) delete d.password; saveMut.mutate(d) }}
              disabled={saveMut.isPending}
              className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              {saveMut.isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">📭</div>
          <div className="font-medium">등록된 이메일 계정이 없습니다.</div>
          <div className="text-xs mt-1 text-slate-400">+ 내 계정 추가 버튼으로 POP3/SMTP 계정을 등록하세요.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{acc.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      acc.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {acc.is_active ? '활성' : '비활성'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">{acc.email}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(acc)}
                    className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors font-medium">
                    수정
                  </button>
                  <button onClick={() => confirm('삭제할까요?') && deleteMut.mutate(acc.id)}
                    className="text-xs text-slate-400 hover:text-red-500 border border-slate-200 px-2.5 py-1 rounded-lg transition-colors font-medium">
                    삭제
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 mb-4 bg-slate-50 rounded-xl p-3">
                <div>
                  <span className="text-slate-400 font-medium">POP3 </span>
                  {acc.pop3_host ? `${acc.pop3_host}:${acc.pop3_port}${acc.pop3_ssl ? ' (SSL)' : ''}` : '미설정'}
                </div>
                <div>
                  <span className="text-slate-400 font-medium">SMTP </span>
                  {acc.smtp_host ? `${acc.smtp_host}:${acc.smtp_port}${acc.smtp_tls ? ' (TLS)' : ' (SSL)'}` : '미설정'}
                </div>
              </div>

              <div className="flex gap-2 items-center">
                {acc.pop3_host && (
                  <button onClick={() => handleFetch(acc.id)} disabled={fetchStatus[acc.id] === 'loading'}
                    className="text-xs bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-lg transition-colors font-medium">
                    {fetchStatus[acc.id] === 'loading' ? '수신 중...' : '메일 수신'}
                  </button>
                )}
                {acc.smtp_host && (
                  <button onClick={() => setShowCompose(acc.id)}
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors font-medium">
                    메일 작성
                  </button>
                )}
                {fetchStatus[acc.id] && fetchStatus[acc.id] !== 'loading' && (
                  <span className="text-xs text-slate-500">{fetchStatus[acc.id]}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCompose && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg border border-slate-200 shadow-xl">
            <h2 className="font-bold text-slate-900 mb-5">메일 작성</h2>
            <div className="space-y-3">
              <Field label="받는사람 (,로 구분)" value={compose.to}
                onChange={e => setCompose(p => ({ ...p, to: e.target.value }))} placeholder="to@company.com" cls={inputCls} />
              <Field label="참조" value={compose.cc}
                onChange={e => setCompose(p => ({ ...p, cc: e.target.value }))} placeholder="cc@company.com" cls={inputCls} />
              <Field label="제목" value={compose.subject}
                onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))} cls={inputCls} />
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">본문</label>
                <textarea value={compose.body} onChange={e => setCompose(p => ({ ...p, body: e.target.value }))}
                  rows={8}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowCompose(null)}
                className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 transition-colors">취소</button>
              <button onClick={() => compose.to && compose.subject && sendMut.mutate({ account_id: showCompose, ...compose })}
                disabled={sendMut.isPending}
                className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
                {sendMut.isPending ? '발송 중...' : '발송'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', cls }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} className={cls} />
    </div>
  )
}
