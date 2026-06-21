import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import useAuth from '../store/auth'
import dayjs from 'dayjs'

const STATUS_OPTIONS = [
  { value: 'todo', label: '할 일', cls: 'bg-slate-100 text-slate-600' },
  { value: 'in_progress', label: '진행 중', cls: 'bg-blue-100 text-blue-700' },
  { value: 'review', label: '검토', cls: 'bg-amber-100 text-amber-700' },
  { value: 'done', label: '완료', cls: 'bg-emerald-100 text-emerald-700' },
]
const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '긴급', cls: 'text-red-500' },
  { value: 'high', label: '높음', cls: 'text-amber-500' },
  { value: 'normal', label: '보통', cls: 'text-blue-500' },
  { value: 'low', label: '낮음', cls: 'text-slate-400' },
]

export default function TaskDetailPanel({ taskId, onClose }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const commentRef = useRef(null)
  const [editTitle, setEditTitle] = useState(false)
  const [title, setTitle] = useState('')
  const [editDesc, setEditDesc] = useState(false)
  const [desc, setDesc] = useState('')
  const [commentText, setCommentText] = useState('')

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then(r => r.data),
    enabled: !!taskId,
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: () => api.get(`/tasks/${taskId}/comments`).then(r => r.data),
    enabled: !!taskId,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  })

  const { data: projectDetail } = useQuery({
    queryKey: ['project', task?.project_id],
    queryFn: () => api.get(`/projects/${task.project_id}`).then(r => r.data),
    enabled: !!task?.project_id,
  })

  useEffect(() => {
    if (task) { setTitle(task.title); setDesc(task.description || '') }
  }, [task])

  // ESC 닫기
  useEffect(() => {
    const h = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const updateMut = useMutation({
    mutationFn: data => api.patch(`/tasks/${taskId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      qc.invalidateQueries({ queryKey: ['all-tasks'] })
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-tasks'] })
      onClose()
    },
  })

  const commentMut = useMutation({
    mutationFn: content => api.post(`/tasks/${taskId}/comments`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-comments', taskId] })
      setCommentText('')
      setTimeout(() => commentRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    },
  })

  const update = data => updateMut.mutate(data)

  const assignee = users.find(u => u.id === task?.assigned_to_id)
  const project = projects.find(p => p.id === task?.project_id)
  const currentStatus = STATUS_OPTIONS.find(s => s.value === task?.status)
  const currentPriority = PRIORITY_OPTIONS.find(p => p.value === task?.priority)

  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <>
      {/* 배경 딤 */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* 패널 */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {currentStatus && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${currentStatus.cls}`}>
                {currentStatus.label}
              </span>
            )}
            <span className="text-xs text-slate-400">#{task?.id}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => confirm('태스크를 삭제할까요?') && deleteMut.mutate()}
              className="text-xs text-slate-400 hover:text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors font-medium">
              삭제
            </button>
            <button onClick={onClose}
              className="text-slate-400 hover:text-slate-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-lg">
              ✕
            </button>
          </div>
        </div>

        {/* 본문 스크롤 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-slate-400">불러오는 중...</div>
          ) : (
            <div className="px-5 py-4 space-y-5">

              {/* 제목 */}
              <div>
                {editTitle ? (
                  <input
                    autoFocus
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={() => { update({ title }); setEditTitle(false) }}
                    onKeyDown={e => { if (e.key === 'Enter') { update({ title }); setEditTitle(false) } }}
                    className="w-full text-xl font-bold text-slate-900 border-b-2 border-blue-500 outline-none bg-transparent pb-1"
                  />
                ) : (
                  <h2
                    onClick={() => setEditTitle(true)}
                    className={`text-xl font-bold text-slate-900 cursor-text hover:text-blue-600 transition-colors leading-tight ${
                      task?.status === 'done' ? 'line-through text-slate-400' : ''
                    }`}
                  >
                    {task?.title}
                  </h2>
                )}
                <p className="text-xs text-slate-400 mt-1">클릭하여 수정 · ESC로 닫기</p>
              </div>

              {/* 속성 그리드 */}
              <div className="grid grid-cols-2 gap-3">
                {/* 상태 */}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">상태</label>
                  <select
                    value={task?.status || 'todo'}
                    onChange={e => update({ status: e.target.value })}
                    className={inputCls}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                {/* 우선순위 */}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">우선순위</label>
                  <select
                    value={task?.priority || 'normal'}
                    onChange={e => update({ priority: e.target.value })}
                    className={inputCls}
                  >
                    {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>

                {/* 시작일 */}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">시작일</label>
                  <input
                    type="date"
                    value={task?.start_date || ''}
                    onChange={e => update({ start_date: e.target.value || null })}
                    className={inputCls}
                  />
                </div>

                {/* 마감일 */}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">마감일</label>
                  <input
                    type="date"
                    value={task?.due_date || ''}
                    onChange={e => update({ due_date: e.target.value || null })}
                    className={inputCls}
                  />
                </div>

                {/* 담당자 */}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">담당자</label>
                  <select
                    value={task?.assigned_to_id || ''}
                    onChange={e => update({ assigned_to_id: e.target.value ? parseInt(e.target.value) : null })}
                    className={inputCls}
                  >
                    <option value="">미배정</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 마일스톤 */}
              {projectDetail?.milestones?.length > 0 && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-400 mb-1 block">마일스톤</label>
                  <select
                    value={task?.milestone_id || ''}
                    onChange={e => update({ milestone_id: e.target.value ? parseInt(e.target.value) : null })}
                    className={inputCls}
                  >
                    <option value="">마일스톤 없음</option>
                    {projectDetail.milestones.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.is_done ? '✓ ' : ''}{m.title}{m.due_date ? ` (~${m.due_date.slice(5)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 프로젝트 */}
              {project && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: project.color }} />
                  <span className="font-medium">{project.name}</span>
                </div>
              )}

              {/* 설명 */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">설명</label>
                {editDesc ? (
                  <textarea
                    autoFocus
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    onBlur={() => { update({ description: desc }); setEditDesc(false) }}
                    rows={5}
                    className="w-full bg-slate-50 border border-blue-300 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none resize-none ring-2 ring-blue-500"
                  />
                ) : (
                  <div
                    onClick={() => setEditDesc(true)}
                    className="min-h-[80px] bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-600 cursor-text hover:bg-slate-100 transition-colors whitespace-pre-wrap border border-transparent hover:border-slate-200"
                  >
                    {task?.description || <span className="text-slate-400">설명 추가...</span>}
                  </div>
                )}
              </div>

              {/* 메타 정보 */}
              <div className="text-xs text-slate-400 space-y-1 border-t border-slate-100 pt-3">
                {task?.created_at && <div>생성: {dayjs(task.created_at).format('YYYY-MM-DD HH:mm')}</div>}
                {task?.done_at && <div>완료: {dayjs(task.done_at).format('YYYY-MM-DD HH:mm')}</div>}
              </div>

              {/* 댓글 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    댓글 {comments.length > 0 && <span className="text-slate-400 font-normal">({comments.length})</span>}
                  </label>
                </div>

                <div className="space-y-3 mb-4">
                  {comments.length === 0 && (
                    <p className="text-sm text-slate-400">댓글이 없습니다. 첫 댓글을 작성하세요.</p>
                  )}
                  {comments.map(c => {
                    const author = users.find(u => u.id === c.author_id)
                    return (
                      <div key={c.id} className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                          {author?.name?.[0] || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-slate-700">{author?.name || '알 수 없음'}</span>
                            <span className="text-xs text-slate-400">{dayjs(c.created_at).format('MM/DD HH:mm')}</span>
                          </div>
                          <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
                            {c.content}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={commentRef} />
                </div>

                {/* 댓글 입력 */}
                <div className="flex gap-2 items-end">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                    {user?.name?.[0]}
                  </div>
                  <div className="flex-1">
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && commentText.trim()) {
                          commentMut.mutate(commentText.trim())
                        }
                      }}
                      placeholder="댓글 작성... (Ctrl+Enter로 전송)"
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
                {commentText.trim() && (
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => commentMut.mutate(commentText.trim())}
                      disabled={commentMut.isPending}
                      className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-1.5 rounded-xl font-medium transition-colors"
                    >
                      {commentMut.isPending ? '전송 중...' : '댓글 달기'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
