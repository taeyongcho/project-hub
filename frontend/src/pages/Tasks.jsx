import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import useAuth from '../store/auth'
import dayjs from 'dayjs'

const PRIORITY_MAP = { urgent: '긴급', high: '높음', normal: '보통', low: '낮음' }
const PRIORITY_COLORS = { urgent: 'text-red-400', high: 'text-amber-400', normal: 'text-blue-400', low: 'text-slate-500' }
const STATUS_MAP = { todo: '할 일', in_progress: '진행 중', review: '검토', done: '완료' }

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
    const key = t.status
    acc[key] = acc[key] || []
    acc[key].push(t)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">할일 목록</h1>
        <button onClick={() => setShowForm(true)}
          className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">
          + 새 할일
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-5">
        {[['mine', '내 할일'], ['all', '전체'], ['overdue', '기한 초과']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`text-sm px-4 py-1.5 rounded-full transition-colors ${
              filter === v ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* 생성 폼 */}
      {showForm && (
        <div className="bg-[#1e293b] rounded-xl p-4 mb-5 border border-slate-700">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="할일 제목 *"
              className="col-span-2 bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
              className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="low">낮음</option>
              <option value="normal">보통</option>
              <option value="high">높음</option>
              <option value="urgent">긴급</option>
            </select>
            <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            <select value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))}
              className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">프로젝트 (선택)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={form.assigned_to_id} onChange={e => setForm(p => ({ ...p, assigned_to_id: e.target.value }))}
              className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">담당자 (선택)</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm text-slate-400 hover:text-slate-200 px-4 py-2">취소</button>
            <button onClick={() => form.title && createMut.mutate({
              ...form,
              project_id: form.project_id ? parseInt(form.project_id) : null,
              assigned_to_id: form.assigned_to_id ? parseInt(form.assigned_to_id) : null,
              due_date: form.due_date || null
            })}
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">추가</button>
          </div>
        </div>
      )}

      {/* 태스크 목록 (상태별 그룹) */}
      {['todo', 'in_progress', 'review', 'done'].map(status => {
        const group = grouped[status] || []
        if (group.length === 0) return null
        return (
          <div key={status} className="mb-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {STATUS_MAP[status]} ({group.length})
            </h2>
            <div className="space-y-1">
              {group.map(t => {
                const assignee = users.find(u => u.id === t.assigned_to_id)
                const project = projects.find(p => p.id === t.project_id)
                const isOverdue = t.due_date && t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs())

                return (
                  <div key={t.id}
                    className="flex items-center gap-3 bg-[#1e293b] rounded-lg px-4 py-3 hover:bg-[#243044] transition-colors group">
                    <input type="checkbox"
                      checked={t.status === 'done'}
                      onChange={e => statusMut.mutate({ id: t.id, status: e.target.checked ? 'done' : 'todo' })}
                      className="w-4 h-4 accent-emerald-500 flex-shrink-0" />
                    <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                      {t.title}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      {project && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: project.color }} />
                          {project.name}
                        </span>
                      )}
                      {assignee && <span>{assignee.name}</span>}
                      <span className={PRIORITY_COLORS[t.priority]}>{PRIORITY_MAP[t.priority]}</span>
                      {t.due_date && (
                        <span className={isOverdue ? 'text-red-400' : ''}>
                          {dayjs(t.due_date).format('MM/DD')}
                        </span>
                      )}
                      <button onClick={() => deleteMut.mutate(t.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors">✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {displayTasks.length === 0 && (
        <div className="text-center text-slate-500 py-12">
          {filter === 'overdue' ? '기한 초과된 태스크가 없습니다 🎉' : '태스크가 없습니다'}
        </div>
      )}
    </div>
  )
}
