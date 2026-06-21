import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import dayjs from 'dayjs'

const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16']

export default function Projects() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: COLORS[0], start_date: '', end_date: '' })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/projects', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowForm(false)
      setForm({ name: '', description: '', color: COLORS[0], start_date: '', end_date: '' })
    }
  })

  const archiveMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/projects/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] })
  })

  const active = projects.filter(p => p.status === 'active')
  const done = projects.filter(p => p.status !== 'active')

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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            ))}
          </div>
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
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-800 px-4 py-2 transition-colors">취소</button>
            <button onClick={() => form.name && createMut.mutate(form)}
              className="text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-medium transition-colors">
              생성
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-8">
        {active.map(p => (
          <ProjectCard key={p.id} project={p}
            onClick={() => navigate(`/projects/${p.id}`)}
            onArchive={() => archiveMut.mutate({ id: p.id, status: 'done' })} />
        ))}
      </div>

      {done.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">완료된 프로젝트</h2>
          <div className="grid grid-cols-3 gap-4 opacity-60">
            {done.map(p => (
              <ProjectCard key={p.id} project={p}
                onClick={() => navigate(`/projects/${p.id}`)}
                onReopen={() => archiveMut.mutate({ id: p.id, status: 'active' })} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ProjectCard({ project: p, onClick, onArchive, onReopen }) {
  return (
    <div onClick={onClick}
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-card cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">{p.name}</h3>
        </div>
        <button onClick={e => { e.stopPropagation(); (onArchive || onReopen)?.() }}
          className="text-xs text-slate-400 hover:text-slate-700 transition-colors opacity-0 group-hover:opacity-100 font-medium">
          {onArchive ? '완료' : '재개'}
        </button>
      </div>
      {p.description && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{p.description}</p>}
      <div className="mb-2.5">
        <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
          <span>진행률</span><span>{p.progress}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${p.progress}%`, background: p.color }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>태스크 {p.done_tasks}/{p.total_tasks}</span>
        {p.overdue_tasks > 0 && <span className="text-red-500 font-medium">{p.overdue_tasks}개 지연</span>}
        {p.end_date && <span>{dayjs(p.end_date).format('~MM/DD')}</span>}
      </div>
    </div>
  )
}
