import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import dayjs from 'dayjs'

const STATUS_LABELS = {
  unread: { label: '미확인', color: 'bg-slate-700 text-slate-300' },
  pending: { label: '답장필요', color: 'bg-red-900/60 text-red-300' },
  replied: { label: '답장완료', color: 'bg-blue-900/60 text-blue-300' },
  done: { label: '처리완료', color: 'bg-emerald-900/60 text-emerald-300' },
  waiting: { label: '대기중', color: 'bg-amber-900/60 text-amber-300' },
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
      params: {
        status: filter === 'all' ? undefined : filter,
        q: search || undefined,
        limit: 200
      }
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-memos', selected?.id] })
      setMemo('')
    }
  })

  const importMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/emails/import', fd)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] })
  })

  const taskMut = useMutation({
    mutationFn: ({ title, email_id }) => api.post('/tasks', { title, email_id, priority: 'normal' }),
    onSuccess: () => alert('할일이 생성되었습니다.')
  })

  return (
    <div className="flex h-full">
      {/* 목록 패널 */}
      <div className="w-80 flex-shrink-0 border-r border-slate-800 flex flex-col">
        {/* 상단 */}
        <div className="p-3 border-b border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="검색..."
              className="flex-1 bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => fileRef.current.click()}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              EML 가져오기
            </button>
            <input ref={fileRef} type="file" accept=".eml" className="hidden"
              onChange={e => e.target.files[0] && importMut.mutate(e.target.files[0])} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[['all', '전체'], ['pending', '답장필요'], ['unread', '미확인'], ['done', '완료'], ['waiting', '대기']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                  filter === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 메일 목록 */}
        <div className="flex-1 overflow-y-auto">
          {emails.length === 0
            ? <div className="p-6 text-center text-slate-500 text-sm">메일이 없습니다</div>
            : emails.map(e => (
              <div key={e.id}
                onClick={() => setSelected(e)}
                className={`p-3 border-b border-slate-800 cursor-pointer transition-colors ${
                  selected?.id === e.id ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-400 truncate flex-1">{e.from_ || '(발신자 없음)'}</span>
                  <span className="text-xs text-slate-600 flex-shrink-0">
                    {e.date_ts ? dayjs(e.date_ts * 1000).format('MM/DD') : ''}
                  </span>
                </div>
                <div className="text-sm text-slate-200 truncate mb-1.5">{e.subject}</div>
                <StatusBadge status={e.status} />
              </div>
            ))
          }
        </div>
      </div>

      {/* 상세 패널 */}
      {selected ? (
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-lg font-semibold text-white mb-2">{detail?.subject || selected.subject}</h2>
          <div className="text-sm text-slate-400 space-y-1 mb-4">
            <div><span className="text-slate-600">보낸 이:</span> {detail?.from_ || selected.from_}</div>
            <div><span className="text-slate-600">날짜:</span> {
              selected.date_ts ? dayjs(selected.date_ts * 1000).format('YYYY-MM-DD HH:mm') : '-'
            }</div>
            {selected.status === 'pending' && (
              <div className="text-red-400 font-semibold">⚠️ 답장 대기 중</div>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {Object.entries(STATUS_LABELS).map(([s, { label }]) => (
              <button key={s}
                onClick={() => statusMut.mutate({ id: selected.id, status: s })}
                disabled={selected.status === s}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  selected.status === s
                    ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}>
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                const title = prompt('할일 제목:', `[메일] ${selected.subject}`)
                if (title) taskMut.mutate({ title, email_id: selected.id })
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
            >
              ✓ 할일 생성
            </button>
          </div>

          {/* 본문 placeholder */}
          <div className="bg-[#0f172a] rounded-xl p-4 mb-5 text-sm text-slate-400 min-h-32">
            <p className="text-slate-600 text-xs mb-2">본문은 EML 파일에서 직접 읽습니다</p>
            <p>(상세 본문 뷰어는 백엔드 연동 후 표시)</p>
          </div>

          {/* 메모 */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">📝 메모</h3>
            <div className="space-y-2 mb-3">
              {memos.map(m => (
                <div key={m.id} className="bg-[#1e293b] rounded-lg p-3">
                  <p className="text-sm text-slate-300">{m.content}</p>
                  <p className="text-xs text-slate-600 mt-1">{dayjs(m.created_at).format('YYYY-MM-DD HH:mm')}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={memo}
                onChange={e => setMemo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && memo && memoMut.mutate({ id: selected.id, content: memo })}
                placeholder="메모 입력 후 Enter..."
                className="flex-1 bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => memo && memoMut.mutate({ id: selected.id, content: memo })}
                className="text-xs px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-600">
          메일을 선택하세요
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.unread
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
}
