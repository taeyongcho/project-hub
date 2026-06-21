import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useQuery } from '@tanstack/react-query'

const STATUS_COLORS = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
}
const STATUS_LABEL = { todo: '할 일', in_progress: '진행 중', review: '검토', done: '완료' }

export default function SearchModal({ onClose, onSelectTask }) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const { data, isFetching } = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => api.get(`/search?q=${encodeURIComponent(debouncedQ)}`).then(r => r.data),
    enabled: debouncedQ.length >= 1,
  })

  const tasks = data?.tasks || []
  const projects = data?.projects || []
  const hasResults = tasks.length > 0 || projects.length > 0

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* 검색 입력 */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
            <span className="text-slate-400 text-lg flex-shrink-0">⌕</span>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="태스크, 프로젝트 검색..."
              className="flex-1 text-sm text-slate-800 outline-none placeholder-slate-400 bg-transparent"
            />
            {isFetching && <span className="text-xs text-slate-400">검색 중...</span>}
            <kbd className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
          </div>

          {/* 결과 */}
          {debouncedQ && (
            <div className="max-h-80 overflow-y-auto py-2">
              {!hasResults && !isFetching && (
                <div className="text-center text-slate-400 text-sm py-8">
                  "<span className="font-medium text-slate-600">{debouncedQ}</span>" 검색 결과 없음
                </div>
              )}

              {projects.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">프로젝트</div>
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { navigate(`/projects/${p.id}`); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color || '#6366f1' }} />
                      <span className="text-sm font-medium text-slate-800">{p.name}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>{p.status === 'active' ? '진행 중' : p.status}</span>
                    </button>
                  ))}
                </div>
              )}

              {tasks.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">태스크</div>
                  {tasks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { onSelectTask(t.id); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className="text-slate-400 text-sm flex-shrink-0">✓</span>
                      <span className={`text-sm font-medium text-slate-800 flex-1 truncate ${
                        t.status === 'done' ? 'line-through text-slate-400' : ''
                      }`}>{t.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 빈 상태 힌트 */}
          {!debouncedQ && (
            <div className="px-4 py-6 text-center text-slate-400 text-sm">
              태스크 제목, 설명, 프로젝트 이름으로 검색하세요
            </div>
          )}
        </div>
      </div>
    </>
  )
}
