import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, PenTool, Trash2, Pencil, Check, X, Share2, Globe, Lock } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/ko'
import api from '../api/client'
import useAuth from '../store/auth'

dayjs.extend(relativeTime)
dayjs.locale('ko')

export default function Whiteboards() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [shareBoard, setShareBoard] = useState(null) // 공유 모달 대상 board

  const { data: boards, isLoading } = useQuery({
    queryKey: ['whiteboards'],
    queryFn: () => api.get('/whiteboards').then(r => r.data)
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data)
  })

  const shareMut = useMutation({
    mutationFn: ({ id, visibility, shared_with }) => api.patch(`/whiteboards/${id}/share`, { visibility, shared_with }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whiteboards'] })
      setShareBoard(null)
      toast.success('공유 설정이 저장되었습니다')
    },
    onError: () => toast.error('소유자만 변경할 수 있습니다')
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/whiteboards', { name: '새 화이트보드' }).then(r => r.data),
    onSuccess: (data) => {
      toast.success('생성되었습니다')
      navigate(`/whiteboard/${data.id}`)
    },
    onError: () => toast.error('생성 실패')
  })

  const renameMut = useMutation({
    mutationFn: ({ id, name }) => api.patch(`/whiteboards/${id}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whiteboards'] })
      setEditId(null)
      toast.success('이름 변경됨')
    }
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/whiteboards/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whiteboards'] })
      toast.success('삭제됨')
    }
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PenTool size={24} /> 화이트보드
          </h1>
          <p className="text-slate-400 text-sm mt-1">팀과 함께 아이디어를 그려보세요</p>
        </div>
        <button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
        >
          <Plus size={18} /> 새 보드
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : boards?.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <PenTool size={48} className="mx-auto mb-4 opacity-30" />
          <p>아직 만든 화이트보드가 없습니다.</p>
          <button onClick={() => createMut.mutate()} className="mt-4 text-blue-600 hover:underline">
            첫 보드 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards?.map(b => (
            <div
              key={b.id}
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all"
            >
              {/* 썸네일 영역 */}
              <div
                onClick={() => navigate(`/whiteboard/${b.id}`)}
                className="h-32 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center cursor-pointer relative overflow-hidden"
              >
                {b.thumbnail
                  ? <img src={b.thumbnail} alt={b.name} className="w-full h-full object-contain bg-white" />
                  : <PenTool size={32} className="text-slate-300 dark:text-slate-600" />}
                <span className="absolute bottom-2 right-3 text-[11px] text-slate-400 bg-white/70 dark:bg-slate-900/70 px-1.5 rounded">
                  요소 {b.object_count}개
                </span>
              </div>

              {/* 정보 */}
              <div className="p-4">
                {editId === b.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') renameMut.mutate({ id: b.id, name: editName }) }}
                      className="flex-1 px-2 py-1 text-sm border border-blue-400 rounded dark:bg-slate-800 dark:text-white outline-none"
                    />
                    <button onClick={() => renameMut.mutate({ id: b.id, name: editName })} className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditId(null)} className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 cursor-pointer" onClick={() => navigate(`/whiteboard/${b.id}`)}>
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        {b.name}
                        {b.visibility === 'private'
                          ? <Lock size={12} className="text-slate-400 flex-shrink-0" />
                          : <Globe size={12} className="text-slate-300 flex-shrink-0" />}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">{dayjs(b.updated_at).fromNow()} 수정</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {b.created_by_id === user?.id && (
                        <button
                          onClick={() => setShareBoard(b)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                          title="공유 설정"
                        >
                          <Share2 size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => { setEditId(b.id); setEditName(b.name) }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                        title="이름 변경"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`"${b.name}" 보드를 삭제할까요?`)) deleteMut.mutate(b.id) }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        title="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {shareBoard && (
        <ShareModal board={shareBoard} users={users} currentUser={user}
          onClose={() => setShareBoard(null)}
          onSave={(visibility, shared_with) => shareMut.mutate({ id: shareBoard.id, visibility, shared_with })}
          saving={shareMut.isPending} />
      )}
    </div>
  )
}

function ShareModal({ board, users, currentUser, onClose, onSave, saving }) {
  const [visibility, setVisibility] = useState(board.visibility || 'shared')
  const [selected, setSelected] = useState(board.shared_with || [])
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">공유 설정</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4 truncate">{board.name}</p>

        <div className="space-y-2 mb-4">
          <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${visibility === 'shared' ? 'border-blue-400 bg-blue-50 dark:bg-blue-950' : 'border-slate-200 dark:border-slate-700'}`}>
            <input type="radio" checked={visibility === 'shared'} onChange={() => setVisibility('shared')} />
            <Globe size={18} className="text-slate-500" />
            <div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">전체 공개</div>
              <div className="text-xs text-slate-400">모든 팀원이 보고 편집</div>
            </div>
          </label>
          <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${visibility === 'private' ? 'border-blue-400 bg-blue-50 dark:bg-blue-950' : 'border-slate-200 dark:border-slate-700'}`}>
            <input type="radio" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
            <Lock size={18} className="text-slate-500" />
            <div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">지정 멤버만</div>
              <div className="text-xs text-slate-400">선택한 사람만 접근 가능</div>
            </div>
          </label>
        </div>

        {visibility === 'private' && (
          <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2 mb-4">
            {users.filter(u => u.id !== currentUser.id).map(u => (
              <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                <span className="text-sm text-slate-700 dark:text-slate-200">{u.name}</span>
                <span className="text-xs text-slate-400">{u.email}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">취소</button>
          <button onClick={() => onSave(visibility, visibility === 'private' ? selected : [])} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium">저장</button>
        </div>
      </div>
    </div>
  )
}
