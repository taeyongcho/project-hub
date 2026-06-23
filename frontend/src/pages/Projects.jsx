import { useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import api from '../api/client'
import dayjs from 'dayjs'
import { SkeletonProjectCard } from '../components/Skeleton'
import Pagination from '../components/Pagination'

const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16']

const EMPTY_FORM = { name: '', description: '', color: COLORS[0], start_date: '', end_date: '', member_ids: [] }

export default function Projects() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editProject, setEditProject] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 6

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data)
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowForm(false)
      setForm(EMPTY_FORM)
      toast.success('프로젝트가 생성되었습니다')
    },
    onError: (err) => toast.error(err.response?.data?.detail || '프로젝트 생성 실패')
  })

  const archiveMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/projects/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success('프로젝트가 업데이트되었습니다')
    },
    onError: (err) => toast.error(err.response?.data?.detail || '업데이트 실패')
  })

  const editMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/projects/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setEditProject(null)
      toast.success('프로젝트가 수정되었습니다')
    },
    onError: (err) => toast.error(err.response?.data?.detail || '수정 실패')
  })

  const openEdit = (e, p) => {
    e.stopPropagation()
    setEditProject(p)
    setEditForm({
      name: p.name,
      description: p.description || '',
      color: p.color || COLORS[0],
      start_date: p.start_date || '',
      end_date: p.end_date || '',
    })
  }

  const toggleMember = uid => {
    setForm(p => ({
      ...p,
      member_ids: p.member_ids.includes(uid)
        ? p.member_ids.filter(id => id !== uid)
        : [...p.member_ids, uid]
    }))
  }

  const active = projects.filter(p => p.status === 'active')
  const done = projects.filter(p => p.status !== 'active')

  const totalPages = Math.ceil(active.length / itemsPerPage)
  const paginatedActive = active.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">프로젝트</h1>
        <button onClick={() => setShowForm(true)}
          className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
          + 새 프로젝트
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-5 mb-6 border border-slate-200 shadow-card">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">새 프로젝트</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              ['프로젝트명 *', 'name', 'text', '프로젝트 이름'],
              ['설명', 'description', 'text', '간단한 설명'],
              ['시작일', 'start_date', 'date', ''],
              ['완료 목표일', 'end_date', 'date', ''],
            ].map(([label, key, type, ph]) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
                <input type={type} value={form[key]} placeholder={ph}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  className={inputCls} />
              </div>
            ))}
          </div>

          {/* 색상 */}
          <div className="mb-4">
            <label className="text-xs font-medium text-slate-500 mb-2 block">색상</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    form.color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          {/* 멤버 선택 */}
          <div className="mb-5">
            <label className="text-xs font-medium text-slate-500 mb-2 block">
              담당자 배정
              {form.member_ids.length > 0 && (
                <span className="ml-1.5 text-blue-600">{form.member_ids.length}명 선택됨</span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {users.filter(u => u.is_active).map(u => {
                const selected = form.member_ids.includes(u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleMember(u.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                      selected
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      selected ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {u.name[0]}
                    </span>
                    <span>{u.name}</span>
                    {selected && <span className="text-blue-500 text-xs">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 transition-colors">취소</button>
            <button
              onClick={() => form.name && createMut.mutate({
                ...form,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
              })}
              disabled={createMut.isPending}
              className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              {createMut.isPending ? '생성 중...' : '생성'}
            </button>
          </div>
        </div>
      )}

      {/* 편집 모달 */}
      {editProject && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setEditProject(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-slate-800 mb-4">프로젝트 수정</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                ['프로젝트명 *', 'name', 'text', '프로젝트 이름'],
                ['설명', 'description', 'text', '간단한 설명'],
                ['시작일', 'start_date', 'date', ''],
                ['완료 목표일', 'end_date', 'date', ''],
              ].map(([label, key, type, ph]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
                  <input type={type} value={editForm[key]} placeholder={ph}
                    onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                    className={inputCls} />
                </div>
              ))}
            </div>
            <div className="mb-5">
              <label className="text-xs font-medium text-slate-500 mb-2 block">색상</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setEditForm(p => ({ ...p, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      editForm.color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                    }`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditProject(null)}
                className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 transition-colors">취소</button>
              <button
                onClick={() => editForm.name && editMut.mutate({
                  id: editProject.id,
                  data: { ...editForm, start_date: editForm.start_date || null, end_date: editForm.end_date || null }
                })}
                disabled={editMut.isPending}
                className="text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
                {editMut.isPending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => <SkeletonProjectCard key={i} />)
        ) : (
          <>
            {paginatedActive.map(p => (
              <ProjectCard key={p.id} project={p}
                onClick={() => navigate(`/projects/${p.id}`)}
                onEdit={e => openEdit(e, p)}
                onArchive={() => archiveMut.mutate({ id: p.id, status: 'done' })} />
            ))}
            {active.length === 0 && (
              <div className="col-span-3 text-center py-16 text-slate-400">
                <div className="text-4xl mb-3">◈</div>
                <div className="font-medium">진행 중인 프로젝트가 없습니다.</div>
                <div className="text-xs mt-1">+ 새 프로젝트 버튼으로 시작하세요.</div>
              </div>
            )}
          </>
        )}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      {done.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">완료된 프로젝트</h2>
          <div className="grid grid-cols-3 gap-4 opacity-60">
            {done.map(p => (
              <ProjectCard key={p.id} project={p}
                onClick={() => navigate(`/projects/${p.id}`)}
                onEdit={e => openEdit(e, p)}
                onReopen={() => archiveMut.mutate({ id: p.id, status: 'active' })} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const ProjectCard = memo(function ProjectCard({ project: p, onClick, onEdit, onArchive, onReopen }) {
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', p.id],
    queryFn: () => api.get(`/projects/${p.id}/members`).then(r => r.data),
    staleTime: 30000,
  })

  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">{p.name}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit}
            className="text-xs text-slate-400 hover:text-blue-600 transition-colors font-medium px-1.5 py-0.5 rounded hover:bg-blue-50">
            수정
          </button>
          <button onClick={e => { e.stopPropagation(); (onArchive || onReopen)?.() }}
            className="text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium px-1.5 py-0.5 rounded hover:bg-slate-100">
            {onArchive ? '완료' : '재개'}
          </button>
        </div>
      </div>

      {p.description && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{p.description}</p>}

      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
          <span>진행률</span><span>{p.progress}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${p.progress}%`, background: p.color }} />
        </div>
      </div>

      {/* 멤버 아바타 */}
      {members.length > 0 && (
        <div className="flex items-center gap-1 mb-3">
          {members.slice(0, 5).map(m => (
            <div key={m.user_id} title={m.name}
              className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 border-2 border-white -ml-1 first:ml-0"
              style={{ zIndex: 1 }}>
              {m.name[0]}
            </div>
          ))}
          {members.length > 5 && (
            <span className="text-xs text-slate-400 ml-1">+{members.length - 5}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>태스크 {p.done_tasks}/{p.total_tasks}</span>
        {p.overdue_tasks > 0 && <span className="text-red-500 font-medium">{p.overdue_tasks}개 지연</span>}
        {p.end_date && <span>{dayjs(p.end_date).format('~MM/DD')}</span>}
      </div>
    </div>
  )
})
