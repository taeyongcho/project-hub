import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ExternalLink, Pencil, Trash2, Server, Copy, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '../api/client'

const ENV_BADGE = {
  dev: { label: '개발', cls: 'bg-blue-100 text-blue-700' },
  test: { label: '테스트', cls: 'bg-amber-100 text-amber-700' },
  staging: { label: '스테이징', cls: 'bg-violet-100 text-violet-700' },
  prod: { label: '운영', cls: 'bg-red-100 text-red-700' },
}

const EMPTY = { name: '', url: '', description: '', category: '기타', environment: 'test' }

export default function SystemLinks() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null) // null | {…link} (편집) | EMPTY (신규)
  const [statuses, setStatuses] = useState({}) // { id: { status, ms, checking } }

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['system-links'],
    queryFn: () => api.get('/system-links').then(r => r.data)
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data)
  })

  const checkOne = async (id) => {
    setStatuses(s => ({ ...s, [id]: { ...s[id], checking: true } }))
    try {
      const res = await api.get(`/system-links/${id}/check`).then(r => r.data)
      setStatuses(s => ({ ...s, [id]: { status: res.status, ms: res.ms, checking: false } }))
    } catch {
      setStatuses(s => ({ ...s, [id]: { status: 'down', checking: false } }))
    }
  }

  const checkAll = () => links.forEach(l => checkOne(l.id))

  const saveMut = useMutation({
    mutationFn: (data) => data.id
      ? api.patch(`/system-links/${data.id}`, data)
      : api.post('/system-links', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-links'] })
      setModal(null)
      toast.success('저장되었습니다')
    },
    onError: () => toast.error('저장 실패')
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/system-links/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-links'] })
      toast.success('삭제됨')
    }
  })

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url)
    toast.success('URL 복사됨')
  }

  // 카테고리별 그룹화
  const grouped = links.reduce((acc, l) => {
    (acc[l.category || '기타'] = acc[l.category || '기타'] || []).push(l)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Server size={24} /> 시스템 바로가기
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">테스트·개발 환경 URL을 모아두고 바로 접속하세요</p>
        </div>
        <div className="flex items-center gap-2">
          {links.length > 0 && (
            <button onClick={checkAll}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:bg-slate-800 text-slate-600 rounded-xl font-medium transition-colors text-sm">
              상태 확인
            </button>
          )}
          <button onClick={() => setModal({ ...EMPTY })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">
            <Plus size={18} /> 시스템 등록
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Server size={48} className="mx-auto mb-4 opacity-30" />
          <p>등록된 시스템이 없습니다.</p>
          <button onClick={() => setModal({ ...EMPTY })} className="mt-4 text-blue-600 hover:underline">첫 시스템 등록하기</button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h2 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">{cat}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(l => {
                  const env = ENV_BADGE[l.environment] || ENV_BADGE.test
                  return (
                    <div key={l.id} className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:shadow-md hover:border-blue-300 transition-all">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {/* 상태 표시 */}
                            {(() => {
                              const st = statuses[l.id]
                              const dot = st?.checking ? 'bg-slate-300 animate-pulse'
                                : st?.status === 'up' ? 'bg-green-500'
                                : st?.status === 'down' ? 'bg-red-500' : 'bg-slate-300'
                              const title = st?.checking ? '확인 중'
                                : st?.status === 'up' ? `정상 (${st.ms}ms)`
                                : st?.status === 'down' ? '응답 없음' : '미확인 — 클릭하여 확인'
                              return (
                                <button onClick={() => checkOne(l.id)} title={title}
                                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                              )
                            })()}
                            <h3 className="font-semibold text-slate-900 dark:text-white truncate">{l.name}</h3>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${env.cls}`}>{env.label}</span>
                          </div>
                          <a href={l.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline font-mono break-all flex items-center gap-1">
                            {l.url} <ExternalLink size={12} className="flex-shrink-0" />
                          </a>
                          {l.description && <p className="text-xs text-slate-400 mt-1.5">{l.description}</p>}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
                          <button onClick={() => copyUrl(l.url)} title="URL 복사" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"><Copy size={14} /></button>
                          <button onClick={() => setModal(l)} title="수정" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"><Pencil size={14} /></button>
                          <button onClick={() => { if (confirm(`"${l.name}" 삭제할까요?`)) deleteMut.mutate(l.id) }} title="삭제" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 등록/수정 모달 */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{modal.id ? '시스템 수정' : '시스템 등록'}</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <Field label="이름 *" value={modal.name} onChange={v => setModal({ ...modal, name: v })} placeholder="예: 주문관리 API" />
              <Field label="URL / 주소 *" value={modal.url} onChange={v => setModal({ ...modal, url: v })} placeholder="http://192.168.0.10:8000" mono />
              <Field label="설명" value={modal.description || ''} onChange={v => setModal({ ...modal, description: v })} placeholder="메모 (선택)" />
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">연결 프로젝트 (선택)</label>
                <select value={modal.project_id || ''} onChange={e => setModal({ ...modal, project_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">없음</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">분류</label>
                  <input value={modal.category} onChange={e => setModal({ ...modal, category: e.target.value })}
                    placeholder="백엔드 / 프론트 / DB…"
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">환경</label>
                  <select value={modal.environment} onChange={e => setModal({ ...modal, environment: e.target.value })}
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="dev">개발</option>
                    <option value="test">테스트</option>
                    <option value="staging">스테이징</option>
                    <option value="prod">운영</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">취소</button>
              <button onClick={() => saveMut.mutate(modal)} disabled={!modal.name || !modal.url || saveMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, mono }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`} />
    </div>
  )
}
