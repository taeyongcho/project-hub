import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import useAuth from '../store/auth'
import dayjs from 'dayjs'

const PRIORITY_MAP = { urgent: '긴급', high: '높음', normal: '보통', low: '낮음' }
const PRIORITY_COLORS = { urgent: 'text-red-500', high: 'text-amber-500', normal: 'text-blue-500', low: 'text-slate-400' }
const STATUS_MAP = { todo: '할 일', in_progress: '진행 중', review: '검토', done: '완료' }
const STATUS_COLORS = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
}

export default function Tasks() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [filter, setFilter] = useState('mine')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', priority: 'normal', due_date: '', project_id: '', assigned_to_id: '' })

  const params = filter === 'mine' ? `?assigned_to_id=${user?.id}` :
    filter === 'overdue' ? '?status=todo' : '?status=in_progress'

  const { data: tasks = [] } = useQuery({
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

  const createMut = useMutation({
    mutationFn: data => api.post('/tasks', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] })
      setShowForm(false)
      setForm({ title: '', priority: 'normal', due_date: '', project_id: '', assigned_to_id: '' })
    }
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-tasks'] })
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-tasks'] })
  })

  const displayTasks = filter === 'overdue'
    ? tasks.filter(t => t.due_date && t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs()))
    : tasks

  const grouped = displayTasks.reduce((acc, t) => {
    acc[t.status] = acc[t.status] || []
    acc[t.status].push(t)
    return acc
  }, {})

  const sel = (key, val) => `w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">할 일</h1>
        <button onClick={() => setShowForm(true)}
          className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
          + 새 할일
        </button>
      </div>

      <div className="flex gap-2 mb-5">
        {[['mine','내 할일'],['all','전체'],['overdue','기한 초과']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`text-sm px-4 py-1.5 rounded-full font-medium transition-colors ${
              filter === v ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-4 mb-5 border border-slate-200 shadow-card">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="할일 제목 *"
              className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
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
            <select value={form.assigned_to_id} onChange={e => setForm(p => ({ ...p, assigned_to_id: e.target.value }))} className={sel()}>
              <option value="">담당자 (선택)</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 transition-colors">취소</button>
            <button onClick={() => form.title && createMut.mutate({
              ...form,
              project_id: form.project_id ? parseInt(form.project_id) : null,
              assigned_to_id: form.assigned_to_id ? parseInt(form.assigned_to_id) : null,
              due_date: form.due_date || null
            })}
              className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              추가
            </button>
          </div>
        </div>
      )}

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
                    className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-slate-200 hover:shadow-card transition-all group">
                    <input type="checkbox" checked={t.status === 'done'}
                      onChange={e => statusMut.mutate({ id: t.id, status: e.target.checked ? 'done' : 'todo' })}
                      className="w-4 h-4 accent-slate-900 flex-shrink-0 rounded" />
                    <span className={`flex-1 text-sm font-medium ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {t.title}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {project && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: project.color }} />
                          {project.name}
                        </span>
                      )}
                      {assignee && <span className="font-medium text-slate-500">{assignee.name}</span>}
                      <span className={`font-medium ${PRIORITY_COLORS[t.priority]}`}>{PRIORITY_MAP[t.priority]}</span>
                      {t.due_date && (
                        <span className={`font-medium ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                          {dayjs(t.due_date).format('MM/DD')}
                        </span>
                      )}
                      <button onClick={() => deleteMut.mutate(t.id)}
                        className="text-slate-300 hover:text-red-400 transition-colors">✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {displayTasks.length === 0 && (
        <div className="text-center text-slate-400 py-16">
          <div className="text-4xl mb-3">✓</div>
          {filter === 'overdue' ? '기한 초과된 태스크가 없습니다!' : '태스크가 없습니다'}
        </div>
      )}
    </div>
  )
}
