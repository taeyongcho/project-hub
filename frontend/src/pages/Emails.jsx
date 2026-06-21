import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import dayjs from 'dayjs'

const STATUS_LABELS = {
  unread:  { label: '미확인',  color: 'bg-slate-100 text-slate-600' },
  pending: { label: '답장필요', color: 'bg-red-100 text-red-600' },
  replied: { label: '답장완료', color: 'bg-blue-100 text-blue-600' },
  done:    { label: '처리완료', color: 'bg-emerald-100 text-emerald-700' },
  waiting: { label: '대기중',  color: 'bg-amber-100 text-amber-700' },
}

export default function Emails() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [memo, setMemo] = useState('')
  const fileRef = useRef()

  const { data: emails = [] } = useQuery({
    queryKey: ['emails', filter, search],
    queryFn: () => api.get('/emails', {
      params: { status: filter === 'all' ? undefined : filter, q: search || undefined, limit: 200 }
    }).then(r => r.data)
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
    }
  })

  const memoMut = useMutation({
    mutationFn: ({ id, content }) => api.post(`/emails/${id}/memos`, { content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-memos', selected?.id] }); setMemo('') }
  })

  const importMut = useMutation({
    mutationFn: (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/emails/import', fd) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] })
  })

  const taskMut = useMutation({
    mutationFn: ({ title, email_id }) => api.post('/tasks', { title, email_id, priority: 'normal' }),
    onSuccess: () => alert('할일이 생성되었습니다.')
  })

  return (
    <div className="flex h-full">
      {/* 목록 패널 */}
      <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
        <div className="p-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="검색..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <button onClick={() => fileRef.current.click()}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              EML 가져오기
            </button>
            <input ref={fileRef} type="file" accept=".eml" className="hidden"
              onChange={e => e.target.files[0] && importMut.mutate(e.target.files[0])} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[['all','전체'],['pending','답장필요'],['unread','미확인'],['done','완료'],['waiting','대기']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  filter === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {emails.length === 0
            ? <div className="p-6 text-center text-slate-400 text-sm">메일이 없습니다</div>
            : emails.map(e => (
              <div key={e.id} onClick={() => setSelected(e)}
                className={`p-3 border-b border-slate-100 cursor-pointer transition-colors ${
                  selected?.id === e.id
                    ? 'bg-blue-50 border-l-2 border-l-blue-500'
                    : 'hover:bg-slate-50'
                }`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-600 truncate flex-1 font-medium">{e.from_ || '(발신자 없음)'}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {e.date_ts ? dayjs(e.date_ts * 1000).format('MM/DD') : ''}
                  </span>
                </div>
                <div className="text-sm text-slate-800 truncate mb-1.5 font-medium">{e.subject}</div>
                <StatusBadge status={e.status} />
              </div>
            ))
          }
        </div>
      </div>

      {/* 상세 패널 */}
      {selected ? (
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3">{detail?.subject || selected.subject}</h2>
          <div className="text-sm text-slate-500 space-y-1 mb-5 pb-5 border-b border-slate-100">
            <div><span className="text-slate-400 w-16 inline-block">보낸 이</span>{detail?.from_ || selected.from_}</div>
            <div>
              <span className="text-slate-400 w-16 inline-block">날짜</span>
              {selected.date_ts ? dayjs(selected.date_ts * 1000).format('YYYY-MM-DD HH:mm') : '-'}
            </div>
            {selected.status === 'pending' && (
              <div className="text-red-500 font-semibold mt-1">⚠ 답장 대기 중</div>
            )}
          </div>

          {/* 상태 변경 버튼 */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {Object.entries(STATUS_LABELS).map(([s, { label }]) => (
              <button key={s} onClick={() => statusMut.mutate({ id: selected.id, status: s })}
                disabled={selected.status === s}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  selected.status === s
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
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

          {/* 본문 placeholder */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 text-sm text-slate-500 min-h-32">
            <p className="text-slate-400 text-xs">(이메일 본문은 EML 파일에서 직접 읽습니다)</p>
          </div>

          {/* 메모 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">메모</h3>
            <div className="space-y-2 mb-3">
              {memos.map(m => (
                <div key={m.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-sm text-slate-700">{m.content}</p>
                  <p className="text-xs text-slate-400 mt-1">{dayjs(m.created_at).format('YYYY-MM-DD HH:mm')}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={memo} onChange={e => setMemo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && memo && memoMut.mutate({ id: selected.id, content: memo })}
                placeholder="메모 입력 후 Enter..."
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <button onClick={() => memo && memoMut.mutate({ id: selected.id, content: memo })}
                className="text-sm px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors">
                저장
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <div className="text-4xl mb-3">✉</div>
            <div>메일을 선택하세요</div>
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
