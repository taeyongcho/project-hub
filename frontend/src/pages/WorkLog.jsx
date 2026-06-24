import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CheckSquare, Bold, List, Heading, Quote, Eye, Pencil } from 'lucide-react'
import api from '../api/client'
import dayjs from 'dayjs'

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
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card">
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
        <div className="markdown-body min-h-[80px] text-sm text-slate-800 px-1 py-2">
          {value?.trim()
            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            : <span className="text-slate-300">미리볼 내용이 없습니다</span>}
        </div>
      ) : (
        <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
          rows={rows} placeholder={placeholder}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono leading-relaxed" />
      )}
    </div>
  )
}

export default function WorkLog() {
  const qc = useQueryClient()
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [form, setForm] = useState({ content: '', issues: '', next_plan: '' })
  const [saved, setSaved] = useState(false)

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
          <h1 className="text-2xl font-bold text-slate-900">업무일지</h1>
          <p className="text-sm text-slate-400 mt-0.5">{dayjs(date).format('YYYY년 MM월 DD일 dddd')} · 마크다운 지원</p>
        </div>
        <input type="date" value={date} onChange={e => handleDateChange(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
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

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card h-fit">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">최근 14일</h2>
          <div className="space-y-1">
            {recentLogs.length === 0
              ? <p className="text-slate-400 text-xs py-2">작성된 일지가 없습니다</p>
              : recentLogs.map(l => (
                <button key={l.id}
                  onClick={() => { setDate(l.log_date); setForm({ content: l.content || '', issues: l.issues || '', next_plan: l.next_plan || '' }) }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    date === l.log_date
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
    </div>
  )
}
