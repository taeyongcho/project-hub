import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import { toast } from 'sonner'
import dayjs from 'dayjs'

const STATUS_LABELS = {
  unread:  { label: '미확인',  color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  pending: { label: '답장필요', color: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
  replied: { label: '답장완료', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' },
  done:    { label: '처리완료', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  waiting: { label: '대기중',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
}

export default function Emails() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)   // 상세 보기 대상
  const [checkedIds, setCheckedIds] = useState(new Set())  // 체크된 항목들
  const [lastCheckedIdx, setLastCheckedIdx] = useState(null)
  const [memo, setMemo] = useState('')
  const [importAccountId, setImportAccountId] = useState('')
  const [showHtml, setShowHtml] = useState(false)
  const [reply, setReply] = useState(null)  // {to, cc, subject, body} 답장 작성
  const fileRef = useRef()

  const { data: emails = [] } = useQuery({
    queryKey: ['emails', filter, search],
    queryFn: () => api.get('/emails', {
      params: { status: filter === 'all' ? undefined : filter, q: search || undefined, limit: 200 }
    }).then(r => r.data)
  })

  const { data: myAccounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: () => api.get('/email-accounts').then(r => r.data)
  })

  const { data: detail } = useQuery({
    queryKey: ['email', selected?.id],
    queryFn: () => api.get(`/emails/${selected.id}`).then(r => r.data),
    enabled: !!selected?.id
  })

  const { data: memos = [] } = useQuery({
    queryKey: ['email-memos', selected?.id],
    queryFn: () => api.get(`/emails/${selected.id}/memos`).then(r => r.data),
    enabled: !!selected?.id
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/emails/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
      qc.invalidateQueries({ queryKey: ['email', selected?.id] })
      qc.invalidateQueries({ queryKey: ['overdue-reply'] })
    },
    onError: (e) => toast.error(e.response?.data?.detail || '상태 변경 실패')
  })

  const memoMut = useMutation({
    mutationFn: ({ id, content }) => api.post(`/emails/${id}/memos`, { content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-memos', selected?.id] }); setMemo('') },
    onError: (e) => toast.error(e.response?.data?.detail || '메모 저장 실패')
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/emails/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
      setSelected(null)
    },
    onError: (e) => toast.error(e.response?.data?.detail || '삭제 실패')
  })

  const bulkDeleteMut = useMutation({
    mutationFn: ids => Promise.all(ids.map(id => api.delete(`/emails/${id}`))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
      setCheckedIds(new Set())
      if (selected && checkedIds.has(selected.id)) setSelected(null)
    },
    onError: (e) => toast.error(e.response?.data?.detail || '일괄 삭제 실패')
  })

  const syncMut = useMutation({
    mutationFn: () => api.post('/email-accounts/sync-all'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['emails'] })
      const data = res.data
      const msg = data.accounts?.length
        ? data.accounts.map(a => `${a.account_name}: ${a.imported ?? 0}건${a.error ? ' (' + a.error + ')' : ''}`).join('\n')
        : data.message || '완료'
      alert(`동기화 완료\n총 ${data.total_imported}건 수신\n\n${msg}`)
    },
    onError: (e) => alert('동기화 실패: ' + (e.response?.data?.detail || e.message))
  })

  const importMut = useMutation({
    mutationFn: ({ file, accountId }) => {
      const fd = new FormData()
      fd.append('file', file)
      const params = accountId ? `?account_id=${accountId}` : ''
      return api.post(`/emails/import${params}`, fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] })
  })

  const taskMut = useMutation({
    mutationFn: ({ title, email_id }) => api.post('/tasks', { title, email_id, priority: 'normal' }),
    onSuccess: () => toast.success('할일이 생성되었습니다.'),
    onError: (e) => toast.error(e.response?.data?.detail || '할일 생성 실패')
  })

  const sendMut = useMutation({
    mutationFn: data => api.post('/email-accounts/send', data),
    onSuccess: () => {
      toast.success('답장을 보냈습니다')
      if (selected) statusMut.mutate({ id: selected.id, status: 'replied' })
      setReply(null)
    },
    onError: (e) => toast.error(e.response?.data?.detail || '발송 실패 — SMTP 설정을 확인하세요')
  })

  const openReply = () => {
    const d = detail || selected
    if (!d) return
    if (!d.account_id) return toast.error('수신 계정 정보가 없어 답장할 수 없습니다 (EML 수동등록 메일)')
    const fromAddr = (d.from_ || '').match(/<([^>]+)>/)?.[1] || d.from_ || ''
    const quoted = (d.body_text || '').split('\n').slice(0, 30).map(l => '> ' + l).join('\n')
    setReply({
      account_id: d.account_id,
      to: fromAddr,
      cc: '',
      subject: (d.subject || '').startsWith('Re:') ? d.subject : `Re: ${d.subject || ''}`,
      body: `\n\n----- 원본 메시지 -----\n${quoted}`,
    })
  }

  const handleFileChange = e => {
    const file = e.target.files[0]
    if (file) importMut.mutate({ file, accountId: importAccountId || null })
    e.target.value = ''
  }

  // 체크박스 토글 (Shift+클릭 범위 선택 지원)
  const handleCheck = (e, emailId, idx) => {
    e.stopPropagation()
    const next = new Set(checkedIds)

    if (e.shiftKey && lastCheckedIdx !== null) {
      const from = Math.min(lastCheckedIdx, idx)
      const to = Math.max(lastCheckedIdx, idx)
      const wasChecked = checkedIds.has(emailId)
      for (let i = from; i <= to; i++) {
        if (wasChecked) next.delete(emails[i].id)
        else next.add(emails[i].id)
      }
    } else {
      if (next.has(emailId)) next.delete(emailId)
      else next.add(emailId)
    }

    setCheckedIds(next)
    setLastCheckedIdx(idx)
  }

  const allChecked = emails.length > 0 && emails.every(e => checkedIds.has(e.id))
  const someChecked = checkedIds.size > 0

  const toggleAll = () => {
    if (allChecked) setCheckedIds(new Set())
    else setCheckedIds(new Set(emails.map(e => e.id)))
  }

  const handleBulkDelete = () => {
    if (!confirm(`선택한 ${checkedIds.size}개 메일을 삭제할까요?`)) return
    bulkDeleteMut.mutate([...checkedIds])
  }

  const bodyHtml = detail?.body_html
  const bodyText = detail?.body_text

  return (
    <div className="flex h-full">
      {/* 목록 패널 (모바일: 상세 선택 시 숨김) */}
      <div className={`w-full md:w-[450px] flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex-col bg-white dark:bg-slate-900 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="검색..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>

          {/* 동기화 + EML 가져오기 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending || myAccounts.length === 0}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap font-medium"
              title={myAccounts.length === 0 ? '이메일 계정을 먼저 등록하세요' : '등록된 계정에서 새 메일 가져오기'}
            >
              {syncMut.isPending
                ? <><span className="animate-spin inline-block">↻</span> 동기화 중...</>
                : <>↻ 메일 동기화</>
              }
            </button>
            <div className="flex items-center gap-1 ml-auto">
              <select value={importAccountId} onChange={e => setImportAccountId(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[130px]">
                <option value="">계정 선택</option>
                {myAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button onClick={() => fileRef.current.click()}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                EML
              </button>
              <input ref={fileRef} type="file" accept=".eml" className="hidden" onChange={handleFileChange} />
            </div>
          </div>

          <div className="flex gap-1 flex-wrap">
            {[['all','전체'],['pending','답장필요'],['unread','미확인'],['done','완료'],['waiting','대기']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  filter === v ? 'bg-slate-900 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 전체선택 / 선택 삭제 툴바 */}
        <div className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 transition-colors ${someChecked ? 'bg-red-50' : 'bg-slate-50 dark:bg-slate-800'}`}>
          <input type="checkbox"
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
            onChange={toggleAll}
            className="w-4 h-4 rounded accent-slate-700 cursor-pointer"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 flex-1">
            {someChecked ? `${checkedIds.size}개 선택됨` : `전체 ${emails.length}개`}
          </span>
          {someChecked && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleteMut.isPending}
              className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-3 py-1 rounded-lg font-medium transition-colors"
            >
              {bulkDeleteMut.isPending ? '삭제 중...' : `${checkedIds.size}개 삭제`}
            </button>
          )}
          {someChecked && (
            <button onClick={() => setCheckedIds(new Set())}
              className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg transition-colors">
              취소
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {emails.length === 0
            ? <div className="p-6 text-center text-slate-400 text-sm">메일이 없습니다</div>
            : emails.map((e, idx) => {
              const isChecked = checkedIds.has(e.id)
              return (
                <div key={e.id}
                  onClick={() => { setSelected(e); setShowHtml(false) }}
                  className={`flex items-start gap-2 p-3 border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-red-50'
                      : selected?.id === e.id
                        ? 'bg-blue-50 border-l-2 border-l-blue-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}>
                  {/* 체크박스 */}
                  <div className="pt-0.5 flex-shrink-0" onClick={ev => handleCheck(ev, e.id, idx)}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 rounded accent-slate-700 cursor-pointer"
                    />
                  </div>
                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 font-medium">{e.from_ || '(발신자 없음)'}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {e.date_ts ? dayjs(e.date_ts * 1000).format('MM/DD') : ''}
                      </span>
                    </div>
                    <div className="text-sm text-slate-800 dark:text-slate-100 truncate mb-1.5 font-medium">{e.subject}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge status={e.status} />
                      {e.account_name && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium">
                          {e.account_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          }
          {someChecked && (
            <div className="p-3 text-center text-xs text-slate-400">
              Shift+클릭으로 범위 선택
            </div>
          )}
        </div>
      </div>

      {/* 상세 패널 */}
      {selected ? (
        <div className="flex-1 overflow-y-auto p-6 w-full">
          <button onClick={() => setSelected(null)}
            className="md:hidden flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-3 -ml-1">
            ← 목록으로
          </button>
          <div className="flex items-start justify-between gap-4 mb-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight flex-1">
              {detail?.subject || selected.subject}
            </h2>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={openReply}
                className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors font-medium">
                ↩ 답장
              </button>
              <button
                onClick={() => confirm('이 이메일을 삭제할까요? 파일도 함께 삭제됩니다.') && deleteMut.mutate(selected.id)}
                className="text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
              >
                삭제
              </button>
            </div>
          </div>

          <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex gap-2">
              <span className="text-slate-400 w-14 flex-shrink-0">보낸이</span>
              <span>{detail?.from_ || selected.from_}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-14 flex-shrink-0">받는이</span>
              <span className="text-slate-600 dark:text-slate-300">{detail?.to_ || selected.to_ || '-'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-14 flex-shrink-0">날짜</span>
              <span>{selected.date_ts ? dayjs(selected.date_ts * 1000).format('YYYY-MM-DD HH:mm') : '-'}</span>
            </div>
            {(detail?.account_name || selected.account_name) && (
              <div className="flex gap-2 items-center">
                <span className="text-slate-400 w-14 flex-shrink-0">계정</span>
                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium">
                  ✉ {detail?.account_name || selected.account_name}
                  {detail?.account_email && <span className="text-violet-500">({detail.account_email})</span>}
                </span>
              </div>
            )}
            {selected.status === 'pending' && (
              <div className="text-red-500 font-semibold mt-1">⚠ 답장 대기 중</div>
            )}
          </div>

          <div className="flex gap-2 mb-5 flex-wrap">
            {Object.entries(STATUS_LABELS).map(([s, { label }]) => (
              <button key={s} onClick={() => statusMut.mutate({ id: selected.id, status: s })}
                disabled={selected.status === s}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  selected.status === s
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}>
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                const title = prompt('할일 제목:', `[메일] ${selected.subject}`)
                if (title) taskMut.mutate({ title, email_id: selected.id })
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors">
              + 할일 생성
            </button>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">본문</h3>
              {bodyHtml && bodyText && (
                <button onClick={() => setShowHtml(h => !h)}
                  className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  {showHtml ? '텍스트 보기' : 'HTML 보기'}
                </button>
              )}
            </div>
            {bodyHtml || bodyText ? (
              showHtml && bodyHtml ? (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <iframe
                    srcDoc={bodyHtml}
                    title="email-body"
                    className="w-full min-h-[600px] bg-white dark:bg-slate-800"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[700px] overflow-y-auto font-mono">
                  {bodyText || '(텍스트 본문 없음 — HTML 보기로 전환하세요)'}
                </div>
              )
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-400 min-h-24 flex items-center justify-center">
                {detail ? '본문이 없습니다.' : '불러오는 중...'}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">메모</h3>
            <div className="space-y-2 mb-3">
              {memos.map(m => (
                <div key={m.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-sm text-slate-700 dark:text-slate-200">{m.content}</p>
                  <p className="text-xs text-slate-400 mt-1">{dayjs(m.created_at).format('YYYY-MM-DD HH:mm')}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={memo} onChange={e => setMemo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && memo && memoMut.mutate({ id: selected.id, content: memo })}
                placeholder="메모 입력 후 Enter..."
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <button onClick={() => memo && memoMut.mutate({ id: selected.id, content: memo })}
                className="text-sm px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors">
                저장
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-slate-400">
          <div className="text-center">
            <div className="text-4xl mb-3">✉</div>
            <div>메일을 선택하세요</div>
          </div>
        </div>
      )}

      {/* 답장 작성 모달 */}
      {reply && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={() => setReply(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-5 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">↩ 답장</span>
              <button onClick={() => setReply(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto">
              <input value={reply.to} onChange={e => setReply(p => ({ ...p, to: e.target.value }))}
                placeholder="받는사람" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={reply.cc} onChange={e => setReply(p => ({ ...p, cc: e.target.value }))}
                placeholder="참조 (선택)" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={reply.subject} onChange={e => setReply(p => ({ ...p, subject: e.target.value }))}
                placeholder="제목" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea value={reply.body} onChange={e => setReply(p => ({ ...p, body: e.target.value }))}
                rows={12} autoFocus placeholder="내용을 입력하세요..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setReply(null)}
                className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">취소</button>
              <button onClick={() => reply.to.trim() && sendMut.mutate(reply)} disabled={sendMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium">
                {sendMut.isPending ? '발송 중...' : '보내기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.unread
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${s.color}`}>{s.label}</span>
}
