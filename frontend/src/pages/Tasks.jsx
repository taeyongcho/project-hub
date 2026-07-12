import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import api from '../api/client'
import useAuth from '../store/auth'
import { SkeletonTaskCard } from '../components/Skeleton'
import dayjs from 'dayjs'

const PRIORITY_MAP = { urgent: '긴급', high: '높음', normal: '보통', low: '낮음' }
const PRIORITY_COLORS = { urgent: 'text-red-500', high: 'text-amber-500', normal: 'text-blue-500', low: 'text-slate-400' }
const STATUS_MAP = { todo: '할 일', in_progress: '진행 중', review: '검토', done: '완료' }
const STATUS_COLORS = {
  todo: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  in_progress: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  review: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  done: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
}

export default function Tasks() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { onSelectTask } = useOutletContext()
  const [filter, setFilter] = useState('mine')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', priority: 'normal', due_date: '', project_id: '', assignee_ids: [] })
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [showRecurring, setShowRecurring] = useState(false)

  const params = filter === 'mine' ? `?assigned_to_id=${user?.id}` :
    filter === 'overdue' ? '' : '?status=in_progress'

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['all-tasks', filter],
    queryFn: () => api.get(`/tasks${params}`).then(r => r.data)
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data)
  })

  const createTasks = async () => {
    if (!form.title.trim() || creating) return
    setCreating(true)
    const base = {
      title: form.title.trim(), priority: form.priority,
      project_id: form.project_id ? parseInt(form.project_id) : null,
      due_date: form.due_date || null,
    }
    try {
      const ids = form.assignee_ids
      if (ids.length === 0) {
        await api.post('/tasks', { ...base, assigned_to_id: null })
      } else {
        // 담당자 수만큼 각자에게 동일한 할일 생성
        await Promise.all(ids.map(id => api.post('/tasks', { ...base, assigned_to_id: id })))
      }
      qc.invalidateQueries({ queryKey: ['all-tasks'] })
      setShowForm(false)
      setForm({ title: '', priority: 'normal', due_date: '', project_id: '', assignee_ids: [] })
      setAssigneeSearch('')
      toast.success(ids.length > 1 ? `${ids.length}명에게 할일이 배정되었습니다` : '할일이 생성되었습니다')
    } catch (err) {
      toast.error(err.response?.data?.detail || '할일 생성 실패')
    } finally { setCreating(false) }
  }

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] })
      toast.success('할일이 업데이트되었습니다')
    },
    onError: (err) => toast.error(err.response?.data?.detail || '업데이트 실패')
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] })
      toast.success('할일이 삭제되었습니다')
    },
    onError: (err) => toast.error(err.response?.data?.detail || '삭제 실패')
  })

  const displayTasks = filter === 'overdue'
    ? tasks.filter(t => t.due_date && t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs(), 'day'))
    : tasks

  const grouped = displayTasks.reduce((acc, t) => {
    acc[t.status] = acc[t.status] || []
    acc[t.status].push(t)
    return acc
  }, {})

  const sel = (key, val) => `w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">할 일</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowRecurring(true)}
            className="text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 rounded-xl font-medium transition-colors">
            🔁 반복 할일
          </button>
          <button onClick={() => setShowForm(true)}
            className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
            + 새 할일
          </button>
        </div>
      </div>

      {showRecurring && <RecurringModal users={users} onClose={() => setShowRecurring(false)} />}

      <div className="flex gap-2 mb-5">
        {[['mine','내 할일'],['all','전체 (진행중)'],['overdue','기한 초과']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`text-sm px-4 py-1.5 rounded-full font-medium transition-colors ${
              filter === v ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 mb-5 border border-slate-200 dark:border-slate-700 shadow-card">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="할일 제목 *"
              className="col-span-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className={sel()}>
              <option value="low">낮음</option>
              <option value="normal">보통</option>
              <option value="high">높음</option>
              <option value="urgent">긴급</option>
            </select>
            <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              className={sel()} />
            <select value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))} className={sel()}>
              <option value="">프로젝트 (선택)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">담당자 (여러 명 선택 가능 — 각자에게 할일 생성)</span>
                {form.assignee_ids.length > 0 && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{form.assignee_ids.length}명 선택됨</span>
                )}
              </div>
              <input value={assigneeSearch} onChange={e => setAssigneeSearch(e.target.value)}
                placeholder="이름 검색..." className={`${sel()} mb-1.5`} />
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                {users
                  .filter(u => !assigneeSearch || u.name.toLowerCase().includes(assigneeSearch.toLowerCase()))
                  .slice(0, 30)
                  .map(u => {
                    const on = form.assignee_ids.includes(u.id)
                    return (
                      <button key={u.id} type="button"
                        onClick={() => setForm(p => ({ ...p, assignee_ids: on ? p.assignee_ids.filter(x => x !== u.id) : [...p.assignee_ids, u.id] }))}
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                          on ? 'bg-blue-600 border-blue-600 text-white'
                             : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'
                        }`}>
                        {u.name}
                      </button>
                    )
                  })}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 px-4 py-2 transition-colors">취소</button>
            <button onClick={createTasks} disabled={creating}
              className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              {creating ? '생성 중...' : form.assignee_ids.length > 1 ? `${form.assignee_ids.length}명에게 추가` : '추가'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {Array(4).fill(0).map((_, i) => <SkeletonTaskCard key={i} />)}
        </div>
      ) : (
        <>
          {['todo','in_progress','review','done'].map(status => {
            const group = grouped[status] || []
            if (group.length === 0) return null
            return (
              <div key={status} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[status]}`}>
                    {STATUS_MAP[status]}
                  </span>
                  <span className="text-xs text-slate-400">{group.length}개</span>
                </div>
                <div className="space-y-1.5">
                  {group.map(t => {
                const assignee = users.find(u => u.id === t.assigned_to_id)
                const project = projects.find(p => p.id === t.project_id)
                const isOverdue = t.due_date && t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs())

                return (
                  <div key={t.id}
                    className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 hover:shadow-card transition-all group cursor-pointer"
                    onClick={() => onSelectTask(t.id)}>
                    <input type="checkbox" checked={t.status === 'done'}
                      onChange={e => { e.stopPropagation(); statusMut.mutate({ id: t.id, status: e.target.checked ? 'done' : 'todo' }) }}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 accent-slate-900 flex-shrink-0 rounded" />
                    <span className={`flex-1 text-sm font-medium ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
                      {t.title}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {project && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: project.color }} />
                          {project.name}
                        </span>
                      )}
                      {assignee && <span className="font-medium text-slate-500 dark:text-slate-400">{assignee.name}</span>}
                      <span className={`font-medium ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_MAP[t.priority]}</span>
                      {t.due_date && (
                        <span className={`font-medium ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                          {dayjs(t.due_date).format('MM/DD')}
                        </span>
                      )}
                      <button onClick={e => { e.stopPropagation(); deleteMut.mutate(t.id) }}
                        className="text-slate-300 hover:text-red-400 transition-colors">✕</button>
                    </div>
                  </div>
                )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}

      {!isLoading && displayTasks.length === 0 && (
        <div className="text-center text-slate-400 py-16">
          <div className="text-4xl mb-3">✓</div>
          {filter === 'overdue' ? '기한 초과된 태스크가 없습니다!' : '태스크가 없습니다'}
        </div>
      )}
    </div>
  )
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

function RecurringModal({ users, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ title: '', freq: 'weekly', weekday: 0, month_day: 1, assigned_to_id: '', priority: 'normal' })

  const { data: rules = [] } = useQuery({
    queryKey: ['recurring-tasks'],
    queryFn: () => api.get('/recurring-tasks').then(r => r.data),
  })

  const addMut = useMutation({
    mutationFn: () => api.post('/recurring-tasks', {
      title: form.title.trim(), freq: form.freq, priority: form.priority,
      weekday: form.freq === 'weekly' ? parseInt(form.weekday) : null,
      month_day: form.freq === 'monthly' ? parseInt(form.month_day) : null,
      assigned_to_id: form.assigned_to_id ? parseInt(form.assigned_to_id) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-tasks'] })
      setForm(p => ({ ...p, title: '' }))
      toast.success('반복 할일이 등록되었습니다')
    },
    onError: (e) => toast.error(e.response?.data?.detail || '등록 실패'),
  })

  const toggleMut = useMutation({
    mutationFn: id => api.patch(`/recurring-tasks/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-tasks'] }),
  })
  const delMut = useMutation({
    mutationFn: id => api.delete(`/recurring-tasks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-tasks'] }); toast.success('삭제되었습니다') },
  })

  const inputCls = 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">🔁 반복 할일</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="할일 제목 (예: 주간보고 제출)" className={`${inputCls} w-full`} />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.freq} onChange={e => setForm(p => ({ ...p, freq: e.target.value }))} className={inputCls}>
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
            </select>
            {form.freq === 'weekly' && (
              <select value={form.weekday} onChange={e => setForm(p => ({ ...p, weekday: e.target.value }))} className={inputCls}>
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}요일</option>)}
              </select>
            )}
            {form.freq === 'monthly' && (
              <select value={form.month_day} onChange={e => setForm(p => ({ ...p, month_day: e.target.value }))} className={inputCls}>
                {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}
              </select>
            )}
            {form.freq === 'daily' && <div />}
            <select value={form.assigned_to_id} onChange={e => setForm(p => ({ ...p, assigned_to_id: e.target.value }))} className={inputCls}>
              <option value="">담당자 (선택)</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className={inputCls}>
              <option value="normal">보통</option>
              <option value="high">높음</option>
              <option value="urgent">긴급</option>
              <option value="low">낮음</option>
            </select>
          </div>
          <button onClick={() => form.title.trim() && addMut.mutate()} disabled={addMut.isPending}
            className="w-full py-2 text-sm bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-medium">
            {addMut.isPending ? '등록 중...' : '규칙 추가'}
          </button>
          <p className="text-[11px] text-slate-400">매일 아침 7시에 조건에 맞는 할일이 자동 생성됩니다 (당일 마감).</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {rules.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-8">등록된 반복 규칙이 없습니다</div>
          ) : rules.map(r => (
            <div key={r.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1 ${r.active ? '' : 'opacity-45'}`}>
              <button onClick={() => toggleMut.mutate(r.id)} title={r.active ? '일시중지' : '재개'}
                className={`w-8 h-4.5 rounded-full flex items-center transition-colors flex-shrink-0 ${r.active ? 'bg-emerald-500 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'}`}
                style={{ height: 18 }}>
                <span className="w-3.5 h-3.5 bg-white rounded-full mx-0.5 shadow" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-800 dark:text-slate-100 truncate">{r.title}</div>
                <div className="text-xs text-slate-400">{r.rule_label}{r.assignee_name ? ` · ${r.assignee_name}` : ''}{r.last_created ? ` · 최근 ${r.last_created}` : ''}</div>
              </div>
              <button onClick={() => confirm('이 반복 규칙을 삭제할까요?') && delMut.mutate(r.id)}
                className="text-xs text-slate-400 hover:text-red-500 flex-shrink-0">삭제</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
