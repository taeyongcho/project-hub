import { useState } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import dayjs from 'dayjs'
import WBSView from '../components/WBSView'

const KANBAN_COLS = [
  { key: 'todo',        label: '할 일',  color: 'text-slate-500',   bg: 'bg-slate-100' },
  { key: 'in_progress', label: '진행 중', color: 'text-blue-600',   bg: 'bg-blue-50' },
  { key: 'review',      label: '검토',   color: 'text-amber-600',   bg: 'bg-amber-50' },
  { key: 'done',        label: '완료',   color: 'text-emerald-600', bg: 'bg-emerald-50' },
]

const PRIORITY_BORDER = {
  urgent: 'border-l-red-400',
  high:   'border-l-amber-400',
  normal: 'border-l-blue-400',
  low:    'border-l-slate-200',
}

export default function ProjectDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { onSelectTask } = useOutletContext()
  const [tab, setTab] = useState('kanban')
  const [showTask, setShowTask] = useState(false)
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'normal', due_date: '', assigned_to_id: '', milestone_id: '' })
  const [showMs, setShowMs] = useState(false)
  const [msForm, setMsForm] = useState({ title: '', due_date: '' })
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})

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
      setTaskForm({ title: '', priority: 'normal', due_date: '', assigned_to_id: '', milestone_id: '' })
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['project', id] }); setShowMs(false); setMsForm({ title: '', due_date: '' }) }
  })

  const msDoneMut = useMutation({
    mutationFn: ({ msId, is_done }) => api.patch(`/projects/${id}/milestones/${msId}`, { is_done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] })
  })

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', id],
    queryFn: () => api.get(`/projects/${id}/members`).then(r => r.data)
  })

  const addMemberMut = useMutation({
    mutationFn: user_id => api.post(`/projects/${id}/members`, { user_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', id] })
  })

  const removeMemberMut = useMutation({
    mutationFn: user_id => api.delete(`/projects/${id}/members/${user_id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', id] })
  })

  const projectEditMut = useMutation({
    mutationFn: data => api.patch(`/projects/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setEditMode(false)
    }
  })

  const openEditMode = () => {
    setEditForm({
      name: project.name,
      description: project.description || '',
      color: project.color,
      start_date: project.start_date || '',
      end_date: project.end_date || '',
    })
    setEditMode(true)
  }

  const memberUserIds = new Set(members.map(m => m.user_id))

  if (!project) return <div className="p-6 text-slate-400">로딩 중...</div>

  const tasksByStatus = KANBAN_COLS.reduce((acc, col) => {
    acc[col.key] = tasks.filter(t => t.status === col.key)
    return acc
  }, {})

  const inputCls = 'bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="p-6 h-full flex flex-col">
      {/* 헤더 */}
      <div className="mb-5">
        {editMode ? (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-card mb-2">
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[
                ['프로젝트명 *', 'name', 'text'],
                ['설명', 'description', 'text'],
                ['시작일', 'start_date', 'date'],
                ['완료 목표일', 'end_date', 'date'],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
                  <input type={type} value={editForm[key]}
                    onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                    className={inputCls} />
                </div>
              ))}
            </div>
            <div className="mb-3">
              <label className="text-xs font-medium text-slate-500 mb-2 block">색상</label>
              <div className="flex gap-2">
                {['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16'].map(c => (
                  <button key={c} onClick={() => setEditForm(p => ({ ...p, color: c }))}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${editForm.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditMode(false)}
                className="text-sm text-slate-500 hover:text-slate-800 px-3 py-1.5 transition-colors">취소</button>
              <button
                onClick={() => editForm.name && projectEditMut.mutate({
                  ...editForm,
                  start_date: editForm.start_date || null,
                  end_date: editForm.end_date || null,
                })}
                disabled={projectEditMut.isPending}
                className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-1.5 rounded-xl font-medium transition-colors">
                {projectEditMut.isPending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="w-4 h-4 rounded-full" style={{ background: project.color }} />
                <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  project.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {project.status === 'active' ? '진행중' : '완료'}
                </span>
              </div>
              {project.description && <p className="text-sm text-slate-500 ml-7">{project.description}</p>}
              <div className="flex items-center gap-6 mt-2 ml-7 text-xs text-slate-400">
                <span className="font-medium">태스크 {project.done_tasks}/{project.total_tasks}</span>
                <span>진행률 <span className="font-semibold text-slate-600">{project.progress}%</span></span>
                {project.end_date && <span>마감 {dayjs(project.end_date).format('YYYY-MM-DD')}</span>}
                {project.overdue_tasks > 0 && <span className="text-red-500 font-medium">지연 {project.overdue_tasks}개</span>}
              </div>
              <div className="ml-7 mt-2 w-64 bg-slate-200 rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${project.progress}%`, background: project.color }} />
              </div>
            </div>
            <button onClick={openEditMode}
              className="text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-xl transition-colors font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              수정
            </button>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-slate-200 pb-0">
        {[['kanban','칸반 보드'],['wbs','WBS'],['milestones','마일스톤'],['list','목록'],['members',`멤버 ${members.length}`]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === v
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}>
            {l}
          </button>
        ))}
        {tab === 'kanban' && (
          <div className="ml-auto pb-1">
            <button onClick={() => setShowTask(true)}
              className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl font-medium transition-colors">
              + 태스크 추가
            </button>
          </div>
        )}
      </div>

      {showTask && (
        <div className="bg-white rounded-2xl p-4 mb-4 border border-slate-200 shadow-card">
          <div className="grid grid-cols-4 gap-3 mb-3">
            <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
              placeholder="태스크 제목 *" className={`col-span-2 ${inputCls}`} />
            <select value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))} className={inputCls}>
              <option value="low">낮음</option>
              <option value="normal">보통</option>
              <option value="high">높음</option>
              <option value="urgent">긴급</option>
            </select>
            <select value={taskForm.assigned_to_id} onChange={e => setTaskForm(p => ({ ...p, assigned_to_id: e.target.value }))} className={inputCls}>
              <option value="">담당자 선택</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input type="date" value={taskForm.due_date} onChange={e => setTaskForm(p => ({ ...p, due_date: e.target.value }))}
              className={inputCls} />
            <select value={taskForm.milestone_id} onChange={e => setTaskForm(p => ({ ...p, milestone_id: e.target.value }))} className={inputCls}>
              <option value="">마일스톤 (선택)</option>
              {project.milestones?.filter(m => !m.is_done).map(m => (
                <option key={m.id} value={m.id}>{m.title}{m.due_date ? ` (~${dayjs(m.due_date).format('MM/DD')})` : ''}</option>
              ))}
            </select>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setShowTask(false)}
                className="text-sm text-slate-400 hover:text-slate-700 px-3 py-2 transition-colors">취소</button>
              <button onClick={() => taskForm.title && taskMut.mutate({
                ...taskForm,
                assigned_to_id: taskForm.assigned_to_id ? parseInt(taskForm.assigned_to_id) : null,
                milestone_id: taskForm.milestone_id ? parseInt(taskForm.milestone_id) : null,
                due_date: taskForm.due_date || null
              })}
                className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WBS */}
      {tab === 'wbs' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <WBSView
            tasks={tasks}
            projectId={parseInt(id)}
            users={users}
            onSelectTask={onSelectTask}
          />
        </div>
      )}

      {/* 칸반 보드 */}
      {tab === 'kanban' && (
        <div className="flex gap-3 flex-1 overflow-x-auto pb-2">
          {KANBAN_COLS.map(col => (
            <div key={col.key} className="flex-1 min-w-52 bg-slate-50 rounded-2xl p-3 flex flex-col border border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.bg} ${col.color}`}>
                  {col.label}
                </span>
                <span className="text-xs text-slate-400">{tasksByStatus[col.key]?.length || 0}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {tasksByStatus[col.key]?.map(t => (
                  <TaskCard key={t.id} task={t} users={users}
                    onMove={status => statusMut.mutate({ taskId: t.id, status })}
                    cols={KANBAN_COLS}
                    onClick={() => onSelectTask(t.id)} />
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
            className="text-sm text-blue-600 hover:text-blue-700 mb-4 font-medium transition-colors">
            + 마일스톤 추가
          </button>
          {showMs && (
            <div className="bg-white rounded-2xl p-4 mb-4 border border-slate-200 shadow-card flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-500 mb-1 block">제목</label>
                <input value={msForm.title} onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))}
                  className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">목표일</label>
                <input type="date" value={msForm.due_date} onChange={e => setMsForm(p => ({ ...p, due_date: e.target.value }))}
                  className={inputCls} />
              </div>
              <button onClick={() => msForm.title && msMut.mutate(msForm)}
                className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">추가</button>
              <button onClick={() => setShowMs(false)}
                className="text-sm text-slate-400 hover:text-slate-700 px-2 py-2 transition-colors">취소</button>
            </div>
          )}

          <div className="space-y-4">
            {project.milestones?.map(ms => {
              const msTasks = tasks.filter(t => t.milestone_id === ms.id)
              const msUnlinked = tasks.filter(t => !t.milestone_id)
              const doneCnt = msTasks.filter(t => t.status === 'done').length
              const isOverdue = !ms.is_done && ms.due_date && dayjs(ms.due_date).isBefore(dayjs())

              return (
                <div key={ms.id} className={`rounded-2xl border overflow-hidden ${
                  ms.is_done ? 'border-emerald-200' : 'border-slate-200'
                }`}>
                  {/* 마일스톤 헤더 */}
                  <div className={`flex items-center gap-3 px-4 py-3 ${ms.is_done ? 'bg-emerald-50' : 'bg-white'}`}>
                    <input type="checkbox" checked={ms.is_done}
                      onChange={e => msDoneMut.mutate({ msId: ms.id, is_done: e.target.checked })}
                      className="w-4 h-4 accent-slate-900 rounded flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${ms.is_done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {ms.title}
                        </span>
                        {msTasks.length > 0 && (
                          <span className="text-xs text-slate-400 font-medium">
                            {doneCnt}/{msTasks.length} 완료
                          </span>
                        )}
                      </div>
                      {msTasks.length > 0 && (
                        <div className="mt-1.5 w-48 bg-slate-200 rounded-full h-1">
                          <div className="h-1 rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${msTasks.length ? Math.round(doneCnt / msTasks.length * 100) : 0}%` }} />
                        </div>
                      )}
                    </div>
                    {ms.due_date && (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${
                        ms.is_done ? 'text-emerald-600 bg-emerald-100' :
                        isOverdue ? 'text-red-600 bg-red-50' : 'text-slate-500 bg-slate-100'
                      }`}>
                        {isOverdue ? '⚠ ' : ''}{dayjs(ms.due_date).format('MM/DD')}
                      </span>
                    )}
                  </div>

                  {/* 마일스톤 태스크 목록 */}
                  {msTasks.length > 0 && (
                    <div className="border-t border-slate-100">
                      {msTasks.map(t => {
                        const assignee = users.find(u => u.id === t.assigned_to_id)
                        return (
                          <div key={t.id}
                            onClick={() => onSelectTask(t.id)}
                            className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer group">
                            <input type="checkbox" checked={t.status === 'done'}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); statusMut.mutate({ taskId: t.id, status: e.target.checked ? 'done' : 'todo' }) }}
                              className="w-3.5 h-3.5 accent-slate-900 rounded flex-shrink-0" />
                            <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-700 group-hover:text-blue-600'} transition-colors`}>
                              {t.title}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              {assignee && <span className="font-medium">{assignee.name}</span>}
                              <PriorityBadge priority={t.priority} />
                              {t.due_date && (
                                <span className={t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs()) ? 'text-red-500 font-medium' : ''}>
                                  {dayjs(t.due_date).format('MM/DD')}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {msTasks.length === 0 && (
                    <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-50">
                      태스크 없음 — 태스크 추가 시 이 마일스톤을 선택하세요
                    </div>
                  )}
                </div>
              )
            })}

            {/* 마일스톤 미배정 태스크 */}
            {tasks.filter(t => !t.milestone_id).length > 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-400">미배정 태스크</span>
                  <span className="text-xs text-slate-400">{tasks.filter(t => !t.milestone_id).length}개</span>
                </div>
                <div>
                  {tasks.filter(t => !t.milestone_id).map(t => {
                    const assignee = users.find(u => u.id === t.assigned_to_id)
                    return (
                      <div key={t.id}
                        onClick={() => onSelectTask(t.id)}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer group">
                        <input type="checkbox" checked={t.status === 'done'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { e.stopPropagation(); statusMut.mutate({ taskId: t.id, status: e.target.checked ? 'done' : 'todo' }) }}
                          className="w-3.5 h-3.5 accent-slate-900 rounded flex-shrink-0" />
                        <span className={`flex-1 text-sm ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-500 group-hover:text-slate-700'} transition-colors`}>
                          {t.title}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {assignee && <span>{assignee.name}</span>}
                          {t.due_date && <span>{dayjs(t.due_date).format('MM/DD')}</span>}
                        </div>
                        {/* 마일스톤 바로 배정 */}
                        {project.milestones?.length > 0 && (
                          <select
                            onClick={e => e.stopPropagation()}
                            defaultValue=""
                            onChange={e => {
                              e.stopPropagation()
                              if (!e.target.value) return
                              api.patch(`/tasks/${t.id}`, { milestone_id: parseInt(e.target.value) })
                                .then(() => {
                                  qc.invalidateQueries({ queryKey: ['tasks'] })
                                  qc.invalidateQueries({ queryKey: ['project', id] })
                                })
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                          >
                            <option value="">마일스톤 배정...</option>
                            {project.milestones.filter(m => !m.is_done).map(m => (
                              <option key={m.id} value={m.id}>{m.title}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {project.milestones?.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <div className="text-3xl mb-2">◎</div>
                <div className="text-sm font-medium">마일스톤이 없습니다</div>
                <div className="text-xs mt-1">+ 마일스톤 추가 버튼으로 일정을 만드세요</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 멤버 */}
      {tab === 'members' && (
        <div className="max-w-xl space-y-4">
          {/* 현재 멤버 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">프로젝트 멤버 ({members.length})</h3>
            </div>
            {members.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-400">멤버가 없습니다.</div>
            ) : (
              <div>
                {members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 flex-shrink-0">
                      {m.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{m.name}</div>
                      <div className="text-xs text-slate-400">{m.email}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.role === 'owner'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {m.role === 'owner' ? '소유자' : '멤버'}
                    </span>
                    {m.role !== 'owner' && (
                      <button
                        onClick={() => removeMemberMut.mutate(m.user_id)}
                        className="text-xs text-slate-300 hover:text-red-400 transition-colors ml-1"
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 멤버 추가 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">멤버 추가</h3>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-2">
                {users.filter(u => u.is_active && !memberUserIds.has(u.id)).map(u => (
                  <button
                    key={u.id}
                    onClick={() => addMemberMut.mutate(u.id)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 rounded-xl text-sm font-medium transition-all"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">
                      {u.name[0]}
                    </span>
                    {u.name}
                    <span className="text-slate-300 hover:text-blue-400">+</span>
                  </button>
                ))}
                {users.filter(u => u.is_active && !memberUserIds.has(u.id)).length === 0 && (
                  <p className="text-sm text-slate-400">추가할 수 있는 사용자가 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 목록 */}
      {tab === 'list' && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200 bg-slate-50">
                <th className="text-left py-2.5 px-3">제목</th>
                <th className="text-left py-2.5 px-3">상태</th>
                <th className="text-left py-2.5 px-3">우선순위</th>
                <th className="text-left py-2.5 px-3">담당자</th>
                <th className="text-left py-2.5 px-3">마감일</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => {
                const assignee = users.find(u => u.id === t.assigned_to_id)
                return (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => onSelectTask(t.id)}>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{t.title}</td>
                    <td className="py-2.5 px-3">
                      <select value={t.status}
                        onChange={e => statusMut.mutate({ taskId: t.id, status: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs text-slate-700 focus:outline-none">
                        {KANBAN_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 px-3"><PriorityBadge priority={t.priority} /></td>
                    <td className="py-2.5 px-3 text-slate-500">{assignee?.name || '-'}</td>
                    <td className={`py-2.5 px-3 text-xs font-medium ${
                      t.due_date && t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs())
                        ? 'text-red-500' : 'text-slate-400'
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

function TaskCard({ task: t, users, onMove, cols, onClick }) {
  const assignee = users.find(u => u.id === t.assigned_to_id)
  const isOverdue = t.due_date && t.status !== 'done' && dayjs(t.due_date).isBefore(dayjs())
  const idx = cols.findIndex(c => c.key === t.status)

  return (
    <div onClick={onClick}
      className={`bg-white rounded-xl p-3 border-l-2 border border-slate-200 shadow-card cursor-pointer hover:shadow-md transition-all ${PRIORITY_BORDER[t.priority] || 'border-l-slate-200'}`}>
      <p className="text-sm text-slate-800 font-medium mb-2 leading-snug">{t.title}</p>
      <div className="flex items-center justify-between">
        {assignee && <span className="text-xs text-slate-400">{assignee.name}</span>}
        {t.due_date && (
          <span className={`text-xs ml-auto font-medium ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
            {dayjs(t.due_date).format('MM/DD')}
          </span>
        )}
      </div>
      <div className="flex gap-1 mt-2" onClick={e => e.stopPropagation()}>
        {idx > 0 && (
          <button onClick={() => onMove(cols[idx - 1].key)}
            className="text-[10px] text-slate-400 hover:text-slate-700 border border-slate-200 hover:border-slate-400 hover:bg-slate-50 px-1.5 py-0.5 rounded-lg transition-colors">
            ← {cols[idx - 1].label}
          </button>
        )}
        {idx < cols.length - 1 && (
          <button onClick={() => onMove(cols[idx + 1].key)}
            className="text-[10px] text-slate-400 hover:text-slate-700 border border-slate-200 hover:border-slate-400 hover:bg-slate-50 px-1.5 py-0.5 rounded-lg transition-colors">
            → {cols[idx + 1].label}
          </button>
        )}
      </div>
    </div>
  )
}

function PriorityBadge({ priority }) {
  const map = {
    urgent: ['긴급', 'text-red-600 bg-red-50'],
    high:   ['높음', 'text-amber-600 bg-amber-50'],
    normal: ['보통', 'text-blue-600 bg-blue-50'],
    low:    ['낮음', 'text-slate-500 bg-slate-100']
  }
  const [label, cls] = map[priority] || map.normal
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
}
