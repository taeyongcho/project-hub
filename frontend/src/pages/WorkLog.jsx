import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CheckSquare, Bold, List, Heading, Quote, Eye, Pencil, Calendar, PenSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../api/client'
import dayjs from 'dayjs'

// 월간 달력 뷰
function CalendarView({ onPickDate }) {
  const [month, setMonth] = useState(dayjs().startOf('month'))
  const start = month.startOf('month')
  const end = month.endOf('month')

  const { data: logs = [] } = useQuery({
    queryKey: ['worklog-month', month.format('YYYY-MM')],
    queryFn: () => api.get(`/work-logs?from_date=${start.format('YYYY-MM-DD')}&to_date=${end.format('YYYY-MM-DD')}`).then(r => r.data)
  })
  const logMap = Object.fromEntries(logs.map(l => [l.log_date, l]))

  const firstDow = start.day() // 0=일
  const daysInMonth = end.date()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(start.date(d))

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setMonth(m => m.subtract(1, 'month'))} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18} /></button>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{month.format('YYYY년 M월')}</h2>
        <button onClick={() => setMonth(m => m.add(1, 'month'))} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} className={`text-center text-xs font-semibold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const ds = day.format('YYYY-MM-DD')
          const log = logMap[ds]
          const isToday = ds === dayjs().format('YYYY-MM-DD')
          return (
            <button key={i} onClick={() => onPickDate(ds)}
              className={`aspect-square rounded-xl border p-1.5 flex flex-col items-start transition-colors text-left ${
                log ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50'
              } ${isToday ? 'ring-2 ring-blue-400' : ''}`}>
              <span className={`text-xs font-medium ${log ? 'text-blue-700' : 'text-slate-500'}`}>{day.date()}</span>
              {log && (
                <div className="mt-auto w-full">
                  {log.content && <div className="text-[9px] text-slate-500 truncate leading-tight">{log.content.replace(/[#*>\-\[\]]/g, '').slice(0, 12)}</div>}
                  <div className="flex gap-0.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    {log.issues && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex gap-4 mt-4 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> 작성됨</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> 이슈 있음</span>
      </div>
    </div>
  )
}

// 마크다운 입력 필드 (편집/미리보기 토글 + 빠른 삽입)
function MarkdownField({ label, value, onChange, rows, placeholder }) {
  const [preview, setPreview] = useState(false)
  const ref = useRef(null)

  // 커서 위치에 텍스트 삽입
  const insert = (before, after = '', placeholder = '') => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end) || placeholder
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(next)
    setTimeout(() => {
      ta.focus()
      ta.selectionStart = start + before.length
      ta.selectionEnd = start + before.length + selected.length
    }, 0)
  }

  // 줄 시작에 접두어 삽입 (체크박스, 목록, 제목, 인용)
  const insertLinePrefix = (prefix) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(next)
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + prefix.length }, 0)
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        <div className="flex items-center gap-1">
          {/* 빠른 삽입 도구 */}
          {!preview && (
            <div className="flex items-center gap-0.5 mr-2">
              <button type="button" onClick={() => insertLinePrefix('- [ ] ')} title="체크박스" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded"><CheckSquare size={15} /></button>
              <button type="button" onClick={() => insert('**', '**', '굵게')} title="굵게" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded"><Bold size={15} /></button>
              <button type="button" onClick={() => insertLinePrefix('- ')} title="목록" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded"><List size={15} /></button>
              <button type="button" onClick={() => insertLinePrefix('## ')} title="제목" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded"><Heading size={15} /></button>
              <button type="button" onClick={() => insertLinePrefix('> ')} title="인용" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded"><Quote size={15} /></button>
            </div>
          )}
          <button type="button" onClick={() => setPreview(p => !p)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            {preview ? <><Pencil size={13} /> 편집</> : <><Eye size={13} /> 미리보기</>}
          </button>
        </div>
      </div>

      {preview ? (
        <div className="markdown-body min-h-[80px] text-sm text-slate-800 dark:text-slate-100 px-1 py-2">
          {value?.trim()
            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            : <span className="text-slate-300">미리볼 내용이 없습니다</span>}
        </div>
      ) : (
        <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
          rows={rows} placeholder={placeholder}
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono leading-relaxed" />
      )}
    </div>
  )
}

export default function WorkLog() {
  const qc = useQueryClient()
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [form, setForm] = useState({ content: '', issues: '', next_plan: '' })
  const [saved, setSaved] = useState(false)
  const [view, setView] = useState('edit') // 'edit' | 'calendar'

  const { data: recentLogs = [] } = useQuery({
    queryKey: ['recent-logs'],
    queryFn: () => {
      const from = dayjs().subtract(14, 'day').format('YYYY-MM-DD')
      return api.get(`/work-logs?from_date=${from}`).then(r => r.data)
    }
  })

  const saveMut = useMutation({
    mutationFn: data => api.post('/work-logs', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worklog'] })
      qc.invalidateQueries({ queryKey: ['recent-logs'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  })

  function handleDateChange(d) {
    setDate(d)
    const existing = recentLogs.find(l => l.log_date === d)
    if (existing) setForm({ content: existing.content || '', issues: existing.issues || '', next_plan: existing.next_plan || '' })
    else setForm({ content: '', issues: '', next_plan: '' })
  }

  const setField = (key) => (val) => setForm(p => ({ ...p, [key]: val }))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">업무일지</h1>
          <p className="text-sm text-slate-400 mt-0.5">{dayjs(date).format('YYYY년 MM월 DD일 dddd')} · 마크다운 지원</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 뷰 전환 */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView('edit')} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${view === 'edit' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}><PenSquare size={14} /> 작성</button>
            <button onClick={() => setView('calendar')} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${view === 'calendar' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}><Calendar size={14} /> 달력</button>
          </div>
          {view === 'edit' && (
            <input type="date" value={date} onChange={e => handleDateChange(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          )}
        </div>
      </div>

      {view === 'calendar' ? (
        <CalendarView onPickDate={(d) => { handleDateChange(d); setView('edit') }} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <MarkdownField label="오늘 완료한 업무" value={form.content} onChange={setField('content')} rows={7} placeholder={'- [x] 완료한 일\n- [ ] 진행 중인 일\n**중요** 표시도 가능'} />
          <MarkdownField label="이슈 / 리스크" value={form.issues} onChange={setField('issues')} rows={4} placeholder={'> 발생한 이슈나 리스크를 기록하세요'} />
          <MarkdownField label="다음 업무 계획" value={form.next_plan} onChange={setField('next_plan')} rows={4} placeholder={'- 내일 처리할 업무'} />

          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium text-emerald-600 transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`}>
              저장되었습니다 ✓
            </span>
            <button onClick={() => saveMut.mutate({ log_date: date, ...form })}
              disabled={saveMut.isPending}
              className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors">
              저장
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-card h-fit">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">최근 14일</h2>
          <div className="space-y-1">
            {recentLogs.length === 0
              ? <p className="text-slate-400 text-xs py-2">작성된 일지가 없습니다</p>
              : recentLogs.map(l => (
                <button key={l.id}
                  onClick={() => { setDate(l.log_date); setForm({ content: l.content || '', issues: l.issues || '', next_plan: l.next_plan || '' }) }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    date === l.log_date
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-50 dark:bg-slate-800 hover:text-slate-900'
                  }`}>
                  <div className="font-medium">{dayjs(l.log_date).format('MM월 DD일 (ddd)')}</div>
                  {l.content && <div className="text-xs text-slate-400 truncate mt-0.5">{l.content.replace(/[#*>\-\[\]]/g, '').slice(0, 35)}</div>}
                  {l.issues && <div className="text-xs text-amber-500 font-medium mt-0.5">⚠ 이슈 있음</div>}
                </button>
              ))
            }
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
