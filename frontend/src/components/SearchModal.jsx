import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useQuery } from '@tanstack/react-query'

const STATUS_COLORS = {
  todo: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}
const STATUS_LABEL = { todo: '할 일', in_progress: '진행 중', review: '검토', done: '완료' }

const TYPE_FILTERS = [
  ['all', '전체'], ['task', '태스크'], ['project', '프로젝트'],
  ['email', '이메일'], ['work_log', '업무일지'], ['whiteboard', '화이트보드'], ['system_link', '시스템'],
]

export default function SearchModal({ onClose, onSelectTask }) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const show = (t) => typeFilter === 'all' || typeFilter === t

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
  const whiteboards = data?.whiteboards || []
  const systemLinks = data?.system_links || []
  const emails = data?.emails || []
  const workLogs = data?.work_logs || []
  const hasResults = tasks.length > 0 || projects.length > 0 || whiteboards.length > 0 ||
    systemLinks.length > 0 || emails.length > 0 || workLogs.length > 0

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg z-50 px-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* 검색 입력 */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-400 text-lg flex-shrink-0">⌕</span>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="태스크, 프로젝트, 이메일, 업무일지, 시스템 검색..."
              className="flex-1 text-sm text-slate-800 dark:text-slate-100 outline-none placeholder-slate-400 bg-transparent"
            />
            {isFetching && <span className="text-xs text-slate-400">검색 중...</span>}
            <kbd className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
          </div>

          {/* 타입 필터 */}
          {debouncedQ && hasResults && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
              {TYPE_FILTERS.map(([v, l]) => (
                <button key={v} onClick={() => setTypeFilter(v)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors ${
                    typeFilter === v
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* 결과 */}
          {debouncedQ && (
            <div className="max-h-80 overflow-y-auto py-2">
              {!hasResults && !isFetching && (
                <div className="text-center text-slate-400 text-sm py-8">
                  "<span className="font-medium text-slate-600 dark:text-slate-300">{debouncedQ}</span>" 검색 결과 없음
                </div>
              )}

              {show('project') && projects.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">프로젝트</div>
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { navigate(`/projects/${p.id}`); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color || '#6366f1' }} />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>{p.status === 'active' ? '진행 중' : p.status}</span>
                    </button>
                  ))}
                </div>
              )}

              {show('task') && tasks.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">태스크</div>
                  {tasks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { onSelectTask(t.id); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <span className="text-slate-400 text-sm flex-shrink-0">✓</span>
                      <span className={`text-sm font-medium text-slate-800 dark:text-slate-100 flex-1 truncate ${
                        t.status === 'done' ? 'line-through text-slate-400' : ''
                      }`}>{t.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {show('email') && emails.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">이메일</div>
                  {emails.map(em => (
                    <button key={em.id} onClick={() => { navigate('/emails'); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
                      <span className="text-slate-400 text-sm flex-shrink-0">✉</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{em.subject}</div>
                        <div className="text-xs text-slate-400 truncate">{em.from_}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {show('work_log') && workLogs.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">업무일지</div>
                  {workLogs.map(w => (
                    <button key={w.id} onClick={() => { navigate('/worklog'); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
                      <span className="text-slate-400 text-sm flex-shrink-0">📝</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{w.log_date}</div>
                        <div className="text-xs text-slate-400 truncate">{w.snippet}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {show('whiteboard') && whiteboards.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">화이트보드</div>
                  {whiteboards.map(w => (
                    <button key={w.id} onClick={() => { navigate(`/whiteboard/${w.id}`); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
                      <span className="text-slate-400 text-sm flex-shrink-0">🖊️</span>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100 flex-1 truncate">{w.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {show('system_link') && systemLinks.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">시스템 바로가기</div>
                  {systemLinks.map(s => (
                    <button key={s.id} onClick={() => { window.open(s.url, '_blank'); onClose() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
                      <span className="text-slate-400 text-sm flex-shrink-0">🖥️</span>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100 flex-shrink-0">{s.name}</span>
                      <span className="text-xs text-blue-600 font-mono truncate ml-auto">{s.url}</span>
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
