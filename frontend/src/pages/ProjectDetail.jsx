import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import dayjs from 'dayjs'

const KANBAN_COLS = [
  { key: 'todo', label: '할 일', color: 'text-slate-400' },
  { key: 'in_progress', label: '진행 중', color: 'text-blue-400' },
  { key: 'review', label: '검토', color: 'text-amber-400' },
  { key: 'done', label: '완료', color: 'text-emerald-400' },
]

const PRIORITY_COLORS = {
  urgent: 'border-l-red-500',
  high: 'border-l-amber-500',
  normal: 'border-l-blue-500',
  low: 'border-l-slate-600',
}

export default function ProjectDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [tab, setTab] = useState('kanban')
  const [showTask, setShowTask] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'normal', due_date: '', assigned_to_id: '' })
  const [showMs, setShowMs] = useState(false)
  const [msForm, setMsForm] = useState({ title: '', due_date: '' })

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data)
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.get(`/tasks?project_id=${id}`).then(r => r.data)
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data)
  })

  const taskMut = useMutation({
    mutationFn: data => api.post('/tasks', { ...data, project_id: parseInt(id) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', id] })
      qc.invalidateQueries({ queryKey: ['project', id] })
      setShowTask(false)
      setTaskForm({ title: '', priority: 'normal', due_date: '', assigned_to_id: '' })
    }
  })

  const statusMut = useMutation({
    mutationFn: ({ taskId, status }) => api.patch(`/tasks/${taskId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', id] })
      qc.invalidateQueries({ queryKey: ['project', id] })
    }
  })

  const msMut = useMutation({
    mutationFn: data => api.post(`/projects/${id}/milestones`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      setShowMs(false)
      setMsForm({ title: '', due_date: '' })
    }
  })

  const msDoneMut = useMutation({
    mutationFn: ({ msId, is_done }) => api.patch(`/projects/${id}/milestones/${msId}`, { is_done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] })
  })

  if (!project) return <div className="p-6 text-slate-500">로딩 중...</div>

  const tasksByStatus = KANBAN_COLS.reduce((acc, col) => {
    acc[col.key] = tasks.filter(t => t.status === col.key)
    return acc
  }, {})

  return (
    <div className="p-6 h-full flex flex-col">
      {/* 헤더 */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-4 h-4 rounded-full" style={{ background: project.color }} />
          <h1 className="text-xl font-bold text-white">{project.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            project.status === 'active' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-800 text-slate-400'
          }`}>
            {project.status === 'active' ? '진행중' : '완료'}
          </span>
        </div>
        {project.description && <p className="text-sm text-slate-400 ml-7">{project.description}</p>}
        <div className="flex items-center gap-6 mt-3 ml-7 text-xs text-slate-500">
          <span>태스크 {project.done_tasks}/{project.total_tasks}</span>
          <span>진행률 {project.progress}%</span>
          {project.end_date && <span>마감 {dayjs(project.end_date).format('YYYY-MM-DD')}</span>}
          {project.overdue_tasks > 0 && <span className="text-red-400">지연 {project.overdue_tasks}개</span>}
        </div>
        {/* 진행바 */}
        <div className="ml-7 mt-2 w-64 bg-slate-700 rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${project.progress}%`, background: project.color }} />
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-slate-800 pb-0">
        {[['kanban', '칸반 보드'], ['milestones', '마일스톤'], ['list', '목록']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === v ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}>
            {l}
          </button>
        ))}
        <div className="ml-auto pb-1">
          <button onClick={() => setShowTask(true)}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            + 태스크 추가
          </button>
        </div>
      </div>

      {/* 태스크 추가 폼 */}
      {showTask && (
        <div className="bg-[#1e293b] rounded-xl p-4 mb-4 border border-slate-700">
          <div className="grid grid-cols-4 gap-3 mb-3">
            <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
              placeholder="태스크 제목 *" className="col-span-2 bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            <select value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}
              className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="low">낮음</option>
              <option value="normal">보통</option>
              <option value="high">높음</option>
              <option value="urgent">긴급</option>
            </select>
            <select value={taskForm.assigned_to_id} onChange={e => setTaskForm(p => ({ ...p, assigned_to_id: e.target.value }))}
              className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">담당자 선택</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input type="date" value={taskForm.due_date} onChange={e => setTaskForm(p => ({ ...p, due_date: e.target.value }))}
              className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            <div className="ml-auto flex gap-2">
              <button onClick={() => setShowTask(false)} className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2">취소</button>
              <button onClick={() => taskForm.title && taskMut.mutate({
                ...taskForm,
                assigned_to_id: taskForm.assigned_to_id ? parseInt(taskForm.assigned_to_id) : null,
                due_date: taskForm.due_date || null
              })}
                className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">추가</button>
            </div>
          </div>
        </div>
      )}

      {/* 칸반 보드 */}
      {tab === 'kanban' && (
        <div className="flex gap-4 flex-1 overflow-x-auto pb-2">
          {KANBAN_COLS.map(col => (
            <div key={col.key} className="flex-1 min-w-52 bg-[#1e293b] rounded-xl p-3 flex flex-col">
              <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${col.color}`}>
                {col.label} <span className="text-slate-600 font-normal">({tasksByStatus[col.key]?.length || 0})</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {tasksByStatus[col.key]?.map(t => (
                  <TaskCard key={t.id} task={t} users={users}
                    onMove={(status) => statusMut.mutate({ taskId: t.id, status })}
                    cols={KANBAN_COLS} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 마일스톤 */}
      {tab === 'milestones' && (
        <div className="max-w-2xl">
          <button onClick={() => setShowMs(true)}
            className="text-sm text-blue-400 hover:text-blue-300 mb-4 transition-colors">+ 마일스톤 추가</button>
          {showMs && (
            <div className="bg-[#1e293b] rounded-xl p-4 mb-4 border border-slate-700 flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">제목</label>
                <input value={msForm.title} onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">목표일</label>
                <input type="date" value={msForm.due_date} onChange={e => setMsForm(p => ({ ...p, due_date: e.target.value }))}
                  className="bg-[#0f172a] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              <button onClick={() => msForm.title && msMut.mutate(msForm)}
                className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors">추가</button>
              <button onClick={() => setShowMs(false)} className="text-sm text-slate-400 hover:text-slate-200 px-2 py-2">취소</button>
            </div>
          )}
          <div className="space-y-2">
            {project.milestones?.map(ms => (
              <div key={ms.id} className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
                ms.is_done ? 'bg-emerald-900/10 border-emerald-800/30' : 'bg-[#1e293b] border-slate-700'
              }`}>
                <input type="checkbox" checked={ms.is_done}
                  onChange={e => msDoneMut.mutate({ msId: ms.id, is_done: e.target.checked })}
                  className="w-4 h-4 accent-emerald-500" />
                <span className={`flex-1 text-sm ${ms.is_done ? 'line-through text-slate-500' : 'text-white'}`}>
                  {ms.title}
                </span>
                {ms.due_date && (
                  <span className={`text-xs ${
                    !ms.is_done && dayjs(ms.due_date).isBefore(dayjs()) ? 'text-red-400' : 'text-slate-500'
                  }`}>
                    {dayjs(ms.due_date).format('YYYY-MM-DD')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 목록 */}
      {tab === 'list' && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="text-left py-2 px-3">제목</th>
                <th className="text-left py-2 px-3">상태</th>
                <th className="text-left py-2 px-3">우선순위</th>
                <th className="text-left py-2 px-3">담당자</th>
                <th className="text-left py-2 px-3">마감일</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => {
                const assignee = users.find(u => u.id === t.assigned_to_id)
                return (
                  <tr key={t.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-300">{t.title}</td>
                    <td className="py-2.5 px-3">
                      <select value={t.status}
                        onChange={e => statusMut.mutate({ taskId: t.id, status: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        className="bg-[#1e293b] border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none">
                        {KANBAN_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{assignee?.name || '-'}</td>
                    <td className={`py-2.5 px-3 text-xs ${
                      t.due_date && t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs())
                        ? 'text-red-400' : 'text-slate-500'
                    }`}>
                      {t.due_date ? dayjs(t.due_date).format('MM/DD') : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TaskCard({ task: t, users, onMove, cols }) {
  const assignee = users.find(u => u.id === t.assigned_to_id)
  const isOverdue = t.due_date && t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs())

  return (
    <div className={`bg-[#0f172a] rounded-lg p-3 border-l-2 ${PRIORITY_COLORS[t.priority] || 'border-l-slate-600'}`}>
      <p className="text-sm text-slate-200 mb-2 leading-snug">{t.title}</p>
      <div className="flex items-center justify-between">
        {assignee && (
          <span className="text-xs text-slate-500">{assignee.name}</span>
        )}
        {t.due_date && (
          <span className={`text-xs ml-auto ${isOverdue ? 'text-red-400' : 'text-slate-600'}`}>
            {dayjs(t.due_date).format('MM/DD')}
          </span>
        )}
      </div>
      <div className="flex gap-1 mt-2">
        {(() => {
          const idx = cols.findIndex(c => c.key === t.status)
          return [
            idx > 0 && (
              <button key="prev" onClick={() => onMove(cols[idx - 1].key)}
                className="text-[10px] text-slate-600 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-1.5 py-0.5 rounded transition-colors">
                ← {cols[idx - 1].label}
              </button>
            ),
            idx < cols.length - 1 && (
              <button key="next" onClick={() => onMove(cols[idx + 1].key)}
                className="text-[10px] text-slate-600 hover:text-slate-300 border border-slate-700 hover:border-slate-500 px-1.5 py-0.5 rounded transition-colors">
                → {cols[idx + 1].label}
              </button>
            ),
          ]
        })()}
      </div>
    </div>
  )
}

function PriorityBadge({ priority }) {
  const map = { urgent: ['긴급', 'text-red-400'], high: ['높음', 'text-amber-400'], normal: ['보통', 'text-blue-400'], low: ['낮음', 'text-slate-500'] }
  const [label, color] = map[priority] || map.normal
  return <span className={`text-xs ${color}`}>{label}</span>
}
