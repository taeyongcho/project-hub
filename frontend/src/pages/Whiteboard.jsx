import { useRef, useEffect, useState } from 'react'
import { Stage, Layer, Line, Rect, Circle, Text, Group, Image as KonvaImage, Transformer, Arrow } from 'react-konva'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { MousePointer2, Hand, Pen, Square, Circle as CircleIcon, Type, StickyNote, Trash2, ZoomIn, ZoomOut, Undo2, Redo2, Copy, BringToFront, SendToBack, ArrowUpRight, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { v4 as uuid } from 'uuid'
import { io } from 'socket.io-client'
import api from '../api/client'
import { useBoard } from '../store/board'
import useAuth from '../store/auth'

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: '선택' },
  { id: 'hand', icon: Hand, label: '이동(패닝)' },
  { id: 'pen', icon: Pen, label: '펜' },
  { id: 'rectangle', icon: Square, label: '사각형' },
  { id: 'circle', icon: CircleIcon, label: '원' },
  { id: 'line', icon: Pen, label: '선' },
  { id: 'arrow', icon: ArrowUpRight, label: '화살표' },
  { id: 'text', icon: Type, label: '텍스트' },
  { id: 'sticky', icon: StickyNote, label: '스티커' },
  { id: 'comment', icon: MessageCircle, label: '댓글' },
]

const COLORS = ['#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

// 이미지 로딩 훅
function useImage(src) {
  const [image, setImage] = useState(null)
  useEffect(() => {
    if (!src) return
    const img = new window.Image()
    img.src = src
    img.onload = () => setImage(img)
  }, [src])
  return image
}

// 이미지 오브젝트 컴포넌트
function URLImage({ obj, onSelect, onChange, draggable, setRef }) {
  const image = useImage(obj.src)
  const ref = useRef()
  return (
    <KonvaImage
      ref={(node) => { ref.current = node; setRef(node) }}
      image={image}
      x={obj.x}
      y={obj.y}
      width={obj.width}
      height={obj.height}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={() => {
        const node = ref.current
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        node.scaleX(1)
        node.scaleY(1)
        onChange({
          x: node.x(),
          y: node.y(),
          width: Math.max(20, node.width() * scaleX),
          height: Math.max(20, node.height() * scaleY)
        })
      }}
    />
  )
}

export default function Whiteboard() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const stageRef = useRef(null)
  const trRef = useRef(null)
  const shapeRefs = useRef({})
  const socketRef = useRef(null)
  const lastSyncRef = useRef('') // 마지막으로 주고받은 상태 (에코 방지)
  const syncTimer = useRef(null)
  const cursorThrottle = useRef(0)

  const [isDrawing, setIsDrawing] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [stageScale, setStageScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [editingText, setEditingText] = useState(null) // { id, x, y, value }
  const [activeUsers, setActiveUsers] = useState([])
  const [remoteCursors, setRemoteCursors] = useState({})
  const [commentPopup, setCommentPopup] = useState(null) // { id, x, y, text, author, editing }

  const {
    boardName, objects, tool, color, brushSize, fontSize, selectedId,
    past, future,
    initBoard, setTool, setColor, setBrushSize, setFontSize,
    addObject, updateObject, deleteObject, setObjects,
    selectObject, deselect,
    snapshot, undo, redo, duplicateObject,
    bringToFront, sendToBack, bringForward, sendBackward
  } = useBoard()

  // 선택된 텍스트/스티커 오브젝트
  const selectedObj = objects.find(o => o.id === selectedId)

  const { data: board, isLoading } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.get(`/whiteboards/${boardId}`).then(r => r.data),
    enabled: !!boardId,
    refetchOnWindowFocus: false,
    staleTime: Infinity
  })

  const [saveStatus, setSaveStatus] = useState('saved') // 'saved' | 'saving' | 'unsaved'
  const saveTimer = useRef(null)
  const loadedRef = useRef(false)

  const saveMut = useMutation({
    mutationFn: (data) => api.patch(`/whiteboards/${boardId}`, data),
    onMutate: () => setSaveStatus('saving'),
    onSuccess: () => setSaveStatus('saved'),
    onError: () => { setSaveStatus('unsaved'); toast.error('저장 실패') }
  })

  const initialLoadRef = useRef(false)
  useEffect(() => {
    if (!board || !user || initialLoadRef.current) return
    initialLoadRef.current = true
    initBoard(board.id, board.name)
    if (board.objects) setObjects(board.objects)
    // 로드 완료 표시 (초기 setObjects가 자동저장 트리거하지 않도록)
    setTimeout(() => { loadedRef.current = true }, 100)
  }, [board, user])

  // 썸네일 캡처 (축소된 미리보기 이미지)
  const captureThumbnail = () => {
    try {
      const stage = stageRef.current
      if (!stage) return null
      return stage.toDataURL({ pixelRatio: 0.25, mimeType: 'image/jpeg', quality: 0.5 })
    } catch { return null }
  }

  // 자동 저장 (변경 1.5초 후)
  useEffect(() => {
    if (!loadedRef.current || !boardId || boardId === 'undefined') return
    setSaveStatus('unsaved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveMut.mutate({ objects, thumbnail: captureThumbnail() })
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [objects])

  // Socket.io 연결 (boardId, userId 가 바뀔 때만 재연결)
  useEffect(() => {
    if (!user?.id || !boardId || boardId === 'undefined') return

    const socket = io(window.location.origin, { path: '/socket.io', transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join_board', { boardId, userId: user.id, userName: user.name })
    })

    socket.on('connect_error', (err) => {
      console.error('[SOCKET] 연결 오류', err.message)
    })

    // 다른 사용자의 전체 상태 수신
    socket.on('sync', (data) => {
      if (data.objects) {
        // 댓글 추가/변경 감지 → 실시간 알림 (멘션이면 강조)
        try {
          const prevText = {}
          for (const o of useBoard.getState().objects) {
            if (o.type === 'comment') prevText[o.id] = o.text || ''
          }
          for (const c of data.objects) {
            if (c.type !== 'comment' || !c.text || c.author === user.name) continue
            if ((prevText[c.id] || '') === c.text) continue // 변화 없음
            if (c.text.includes(`@${user.name}`))
              toast(`💬 ${c.author}님이 회원님을 언급했습니다`, { description: c.text })
            else
              toast(`💬 ${c.author}님의 새 댓글`, { description: c.text.slice(0, 40) })
          }
        } catch {}
        // 받은 상태를 기록해 두면, 이 상태로 인한 내 broadcast 효과가 다시 쏘지 않음
        lastSyncRef.current = JSON.stringify(data.objects)
        setObjects(data.objects)
      }
    })

    socket.on('user_joined', (data) => {
      setActiveUsers(data.activeUsers || [])
      if (data.userName && data.userName !== user.name) toast.success(`${data.userName}님이 입장했습니다`)
    })

    socket.on('user_left', (data) => {
      setActiveUsers(data.activeUsers || [])
      setRemoteCursors(prev => {
        const next = { ...prev }
        delete next[data.userId]
        return next
      })
    })

    socket.on('cursor', (data) => {
      setRemoteCursors(prev => ({
        ...prev,
        [data.userId]: { x: data.x, y: data.y, userName: data.userName, color: data.color }
      }))
    })

    return () => { socket.disconnect(); socketRef.current = null }
  }, [boardId, user?.id, user?.name])

  // 로컬 변경을 다른 사용자에게 브로드캐스트 (받은 상태와 같으면 전송 안 함 → 에코 차단)
  useEffect(() => {
    if (!loadedRef.current || !socketRef.current) return
    const serialized = JSON.stringify(objects)
    if (serialized === lastSyncRef.current) return // 원격에서 받은 그대로면 되쏘지 않음
    lastSyncRef.current = serialized
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      socketRef.current?.emit('sync', { boardId, objects })
    }, 150)
  }, [objects])

  // Transformer를 선택된 오브젝트에 연결
  useEffect(() => {
    if (!trRef.current) return
    if (selectedId && shapeRefs.current[selectedId]) {
      trRef.current.nodes([shapeRefs.current[selectedId]])
      trRef.current.getLayer()?.batchDraw()
    } else {
      trRef.current.nodes([])
    }
  }, [selectedId, objects])

  // 클립보드 이미지 붙여넣기 (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile()
          const reader = new FileReader()
          reader.onload = (ev) => {
            const src = ev.target.result
            const img = new window.Image()
            img.src = src
            img.onload = () => {
              const maxW = 400
              const scale = img.width > maxW ? maxW / img.width : 1
              snapshot()
              addObject({
                type: 'image',
                src,
                x: 100,
                y: 100,
                width: img.width * scale,
                height: img.height * scale
              })
              toast.success('이미지 붙여넣기 완료')
            }
          }
          reader.readAsDataURL(file)
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  // 키보드 단축키
  useEffect(() => {
    const handleKey = (e) => {
      if (editingText) return // 편집 중에는 단축키 무시
      const meta = e.ctrlKey || e.metaKey

      // 삭제
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        snapshot()
        deleteObject(selectedId)
        return
      }
      // 실행취소 / 다시실행
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      // 복제
      if (meta && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        duplicateObject(selectedId)
        return
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedId, editingText])

  // 화면 좌표 → 캔버스 좌표 변환
  const getRelativePos = () => {
    const stage = stageRef.current
    const pointer = stage.getPointerPosition()
    return {
      x: (pointer.x - stagePos.x) / stageScale,
      y: (pointer.y - stagePos.y) / stageScale
    }
  }

  const handleMouseDown = (e) => {
    // 빈 영역 클릭 시 선택 해제
    if (e.target === e.target.getStage()) {
      deselect()
    }

    if (tool === 'select' || tool === 'hand') return

    const pos = getRelativePos()
    if (!pos) return

    if (tool === 'sticky') {
      snapshot()
      const id = uuid()
      addObject({ id, type: 'sticky', x: pos.x, y: pos.y, width: 140, height: 120, text: '', color: '#fde047', fontSize: 14 })
      setTool('select')
      selectObject(id)
      setTimeout(() => openEditorFor({ id, x: pos.x, y: pos.y, text: '', width: 140, fontSize: 14, type: 'sticky' }), 50)
      return
    }

    if (tool === 'text') {
      snapshot()
      const id = uuid()
      addObject({ id, type: 'text', x: pos.x, y: pos.y, text: '', fontSize, color })
      setTool('select')
      selectObject(id)
      setTimeout(() => openEditorFor({ id, x: pos.x, y: pos.y, text: '', width: 200, fontSize, type: 'text', color }), 50)
      return
    }

    if (tool === 'comment') {
      snapshot()
      const id = uuid()
      addObject({ id, type: 'comment', x: pos.x, y: pos.y, text: '', author: user?.name || '익명' })
      setTool('select')
      setTimeout(() => setCommentPopup({ id, x: pos.x, y: pos.y, text: '', author: user?.name || '익명', editing: true }), 50)
      return
    }

    setIsDrawing(true)
    setStartPos(pos)
    snapshot() // 그리기 시작 전 상태 저장 (pen/rect/circle/line 공통)

    if (tool === 'pen') {
      addObject({ type: 'pen', points: [pos.x, pos.y], color, brushSize })
    }
  }

  const handleMouseMove = (e) => {
    // 커서 위치 브로드캐스트 (50ms 스로틀)
    if (socketRef.current) {
      const now = Date.now()
      if (now - cursorThrottle.current > 50) {
        cursorThrottle.current = now
        const p = getRelativePos()
        if (p) socketRef.current.emit('cursor', { boardId, x: p.x, y: p.y, color })
      }
    }

    if (!isDrawing || !startPos) return
    const pos = getRelativePos()
    if (!pos) return
    if (tool === 'pen') {
      const lastObj = objects[objects.length - 1]
      if (lastObj?.type === 'pen') {
        updateObject(lastObj.id, { points: [...(lastObj.points || []), pos.x, pos.y] })
      }
    }
  }

  const handleMouseUp = () => {
    if (!isDrawing || !startPos) return
    const pos = getRelativePos()
    if (!pos) { setIsDrawing(false); return }

    if (tool === 'rectangle') {
      addObject({
        type: 'rectangle',
        x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y),
        width: Math.abs(pos.x - startPos.x), height: Math.abs(pos.y - startPos.y),
        color
      })
    } else if (tool === 'circle') {
      const radius = Math.sqrt(Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)) / 2
      addObject({ type: 'circle', x: startPos.x, y: startPos.y, radius, color })
    } else if (tool === 'line') {
      addObject({ type: 'line', points: [startPos.x, startPos.y, pos.x, pos.y], color, brushSize })
    } else if (tool === 'arrow') {
      addObject({ type: 'arrow', points: [startPos.x, startPos.y, pos.x, pos.y], color, brushSize })
    }

    setIsDrawing(false)
    setStartPos(null)
  }

  // 휠로 확대/축소
  const handleWheel = (e) => {
    e.evt.preventDefault()
    const scaleBy = 1.05
    const stage = stageRef.current
    const oldScale = stageScale
    const pointer = stage.getPointerPosition()
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale
    }
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy
    const clamped = Math.max(0.2, Math.min(5, newScale))
    setStageScale(clamped)
    setStagePos({
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped
    })
  }

  // 캔버스 좌표 기준으로 편집창 열기
  const openEditorFor = ({ id, x, y, text, width, fontSize, type, color }) => {
    const stageBox = stageRef.current.container().getBoundingClientRect()
    setEditingText({
      id,
      type: type || 'text',
      color: color || '#000000',
      x: stageBox.left + x * stageScale + stagePos.x,
      y: stageBox.top + y * stageScale + stagePos.y,
      value: text || '',
      width: (width || 200) * stageScale,
      fontSize: (fontSize || 16) * stageScale
    })
  }

  // 텍스트/스티커 더블클릭 → 편집
  const handleDblClick = (obj) => {
    openEditorFor({
      id: obj.id,
      x: obj.x,
      y: obj.y,
      text: obj.text,
      width: obj.width || 200,
      fontSize: obj.fontSize || 16,
      type: obj.type,
      color: obj.color
    })
  }

  const commitText = () => {
    if (editingText) {
      updateObject(editingText.id, { text: editingText.value })
      setEditingText(null)
    }
  }

  const zoom = (dir) => {
    const newScale = dir === 'in' ? stageScale * 1.2 : stageScale / 1.2
    setStageScale(Math.max(0.2, Math.min(5, newScale)))
  }

  const isSelectMode = tool === 'select'

  if (isLoading) return <div className="flex items-center justify-center h-screen">로딩 중...</div>

  const registerRef = (id) => (node) => { if (node) shapeRefs.current[id] = node }

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-slate-600 dark:text-slate-400 hover:text-slate-900">←</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{boardName}</h1>
          <span className="text-xs text-slate-400">{Math.round(stageScale * 100)}%</span>
          {/* 함께 보는 사용자 */}
          {activeUsers.length > 1 && (
            <div className="flex items-center -space-x-2 ml-2">
              {activeUsers.slice(0, 5).map((u, i) => (
                <div key={u.userId + '' + i} title={u.userName}
                  className="w-7 h-7 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ backgroundColor: `hsl(${(u.userId * 137) % 360}, 60%, 50%)` }}>
                  {u.userName?.[0] || '?'}
                </div>
              ))}
              <span className="pl-3 text-xs text-green-600 font-medium">● {activeUsers.length}명 접속</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* 실행취소 / 다시실행 */}
          <button onClick={undo} disabled={past.length === 0} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30" title="실행취소 (Ctrl+Z)"><Undo2 size={18} /></button>
          <button onClick={redo} disabled={future.length === 0} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30" title="다시실행 (Ctrl+Shift+Z)"><Redo2 size={18} /></button>

          {selectedId && (
            <>
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
              <button onClick={() => duplicateObject(selectedId)} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg" title="복제 (Ctrl+D)"><Copy size={18} /></button>
              <button onClick={() => bringToFront(selectedId)} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg" title="맨 앞으로"><BringToFront size={18} /></button>
              <button onClick={() => sendToBack(selectedId)} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg" title="맨 뒤로"><SendToBack size={18} /></button>
              <button onClick={() => { snapshot(); deleteObject(selectedId) }} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" title="삭제 (Delete)"><Trash2 size={18} /></button>
            </>
          )}
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
          <button onClick={() => zoom('out')} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ZoomOut size={18} /></button>
          <button onClick={() => zoom('in')} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><ZoomIn size={18} /></button>
          <span className="text-xs px-2 text-slate-400 min-w-[60px] text-center">
            {saveStatus === 'saving' ? '저장 중…' : saveStatus === 'unsaved' ? '● 미저장' : '✓ 저장됨'}
          </span>
          <button onClick={() => saveMut.mutate({ objects, thumbnail: captureThumbnail() })} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">💾 저장</button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 도구 바 */}
        <div className="w-16 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 gap-2 overflow-y-auto">
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
              className={`w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${
                tool === t.id ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <t.icon size={20} />
            </button>
          ))}
          <div className="border-t border-slate-200 dark:border-slate-800 my-2 w-10" />
          <div className="flex flex-col gap-1">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${color === c ? 'border-slate-900 dark:border-white' : 'border-transparent hover:border-slate-300'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 my-2 w-10" />
          <label className="text-xs text-slate-500 dark:text-slate-400">선</label>
          <input type="range" min="1" max="20" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-10 h-1" />

          {/* 글자 크기 */}
          <div className="border-t border-slate-200 dark:border-slate-800 my-2 w-10" />
          <label className="text-xs text-slate-500 dark:text-slate-400">글자</label>
          <select
            value={(selectedObj && (selectedObj.type === 'text' || selectedObj.type === 'sticky')) ? selectedObj.fontSize : fontSize}
            onChange={(e) => {
              const v = Number(e.target.value)
              setFontSize(v)
              if (selectedObj && (selectedObj.type === 'text' || selectedObj.type === 'sticky')) {
                snapshot()
                updateObject(selectedObj.id, { fontSize: v })
              }
            }}
            className="w-12 text-xs px-1 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none"
          >
            {[12, 14, 16, 18, 24, 32, 40, 48, 64].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* 캔버스 */}
        <div className="flex-1 bg-white dark:bg-slate-900 overflow-hidden relative">
          <Stage
            ref={stageRef}
            width={window.innerWidth - 80}
            height={window.innerHeight - 80}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            draggable={tool === 'hand'}
            onDragEnd={(e) => { if (tool === 'hand') setStagePos({ x: e.target.x(), y: e.target.y() }) }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            style={{ cursor: tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
          >
            <Layer>
              {objects.map(obj => {
                const common = {
                  ref: registerRef(obj.id),
                  draggable: isSelectMode,
                  onClick: () => isSelectMode && selectObject(obj.id),
                  onTap: () => isSelectMode && selectObject(obj.id),
                  onDragStart: () => snapshot(),
                  onTransformStart: () => snapshot(),
                  onDragEnd: (e) => updateObject(obj.id, { x: e.target.x(), y: e.target.y() })
                }

                if (obj.type === 'pen') {
                  return <Line key={obj.id} {...common} points={obj.points} stroke={obj.color} strokeWidth={obj.brushSize} lineCap="round" lineJoin="round" />
                }
                if (obj.type === 'line') {
                  return <Line key={obj.id} {...common} points={obj.points} stroke={obj.color} strokeWidth={obj.brushSize} lineCap="round" />
                }
                if (obj.type === 'arrow') {
                  return (
                    <Arrow key={obj.id} {...common} points={obj.points} stroke={obj.color} fill={obj.color}
                      strokeWidth={obj.brushSize || 3} pointerLength={12} pointerWidth={12} lineCap="round" />
                  )
                }
                if (obj.type === 'comment') {
                  return (
                    <Group key={obj.id} {...common} x={obj.x} y={obj.y}
                      onClick={() => { if (isSelectMode) { selectObject(obj.id); setCommentPopup({ ...obj, editing: false }) } }}
                      onTap={() => { if (isSelectMode) { selectObject(obj.id); setCommentPopup({ ...obj, editing: false }) } }}>
                      <Circle radius={14} fill="#3b82f6" shadowBlur={4} shadowOffsetY={2} shadowOpacity={0.3} />
                      <Text x={-14} y={-8} width={28} align="center" text="💬" fontSize={15} />
                    </Group>
                  )
                }
                if (obj.type === 'rectangle') {
                  return (
                    <Rect key={obj.id} {...common} x={obj.x} y={obj.y} width={obj.width} height={obj.height}
                      stroke={obj.color} strokeWidth={2} fill="transparent"
                      onTransformEnd={(e) => {
                        const node = e.target
                        const sx = node.scaleX(), sy = node.scaleY()
                        node.scaleX(1); node.scaleY(1)
                        updateObject(obj.id, { x: node.x(), y: node.y(), width: Math.max(10, node.width() * sx), height: Math.max(10, node.height() * sy) })
                      }} />
                  )
                }
                if (obj.type === 'circle') {
                  return (
                    <Circle key={obj.id} {...common} x={obj.x} y={obj.y} radius={obj.radius}
                      stroke={obj.color} strokeWidth={2} fill="transparent"
                      onTransformEnd={(e) => {
                        const node = e.target
                        const sx = node.scaleX()
                        node.scaleX(1); node.scaleY(1)
                        updateObject(obj.id, { x: node.x(), y: node.y(), radius: Math.max(5, obj.radius * sx) })
                      }} />
                  )
                }
                if (obj.type === 'text') {
                  return (
                    <Text key={obj.id} {...common} x={obj.x} y={obj.y}
                      text={obj.text || (editingText?.id === obj.id ? '' : '텍스트')}
                      fontSize={obj.fontSize} fill={obj.color}
                      visible={editingText?.id !== obj.id}
                      onDblClick={() => handleDblClick(obj)} onDblTap={() => handleDblClick(obj)}
                      onTransformEnd={(e) => {
                        const node = e.target
                        const sx = node.scaleX()
                        node.scaleX(1); node.scaleY(1)
                        updateObject(obj.id, { x: node.x(), y: node.y(), fontSize: Math.max(8, obj.fontSize * sx) })
                      }} />
                  )
                }
                if (obj.type === 'sticky') {
                  return (
                    <Group key={obj.id} {...common} x={obj.x} y={obj.y}
                      onDblClick={() => handleDblClick(obj)} onDblTap={() => handleDblClick(obj)}
                      onTransformEnd={(e) => {
                        const node = e.target
                        const sx = node.scaleX(), sy = node.scaleY()
                        node.scaleX(1); node.scaleY(1)
                        updateObject(obj.id, { x: node.x(), y: node.y(), width: Math.max(60, obj.width * sx), height: Math.max(60, obj.height * sy) })
                      }}>
                      <Rect width={obj.width} height={obj.height} fill={obj.color} cornerRadius={4} shadowBlur={6} shadowOffsetY={3} shadowOpacity={0.2} />
                      <Text x={10} y={10} text={obj.text} fontSize={obj.fontSize || 14} width={obj.width - 20} height={obj.height - 20} fill="#1f2937" wrap="word" verticalAlign="top" />
                    </Group>
                  )
                }
                if (obj.type === 'image') {
                  return (
                    <URLImage key={obj.id} obj={obj} draggable={isSelectMode}
                      setRef={(node) => { if (node) shapeRefs.current[obj.id] = node }}
                      onSelect={() => isSelectMode && selectObject(obj.id)}
                      onChange={(updates) => updateObject(obj.id, updates)} />
                  )
                }
                return null
              })}

              {/* 크기 조정 핸들 */}
              {isSelectMode && (
                <Transformer
                  ref={trRef}
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 10 || newBox.height < 10 ? oldBox : newBox)}
                />
              )}
            </Layer>
          </Stage>

          {/* 다른 사용자 커서 */}
          {Object.entries(remoteCursors).map(([uid, c]) => (
            <div key={uid} className="absolute pointer-events-none z-50"
              style={{ left: c.x * stageScale + stagePos.x, top: c.y * stageScale + stagePos.y, transition: 'left 0.05s linear, top 0.05s linear' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={c.color || '#3b82f6'}>
                <path d="M3 2l7 18 2.5-7.5L20 10z" />
              </svg>
              <span className="absolute left-4 top-3 text-[11px] px-1.5 py-0.5 rounded text-white whitespace-nowrap"
                style={{ backgroundColor: c.color || '#3b82f6' }}>
                {c.userName}
              </span>
            </div>
          ))}

          {/* 댓글 팝업 */}
          {commentPopup && (
            <div className="absolute z-50 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3"
              style={{ left: commentPopup.x * stageScale + stagePos.x + 20, top: commentPopup.y * stageScale + stagePos.y }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-blue-600">💬 {commentPopup.author}</span>
                <div className="flex gap-1">
                  <button onClick={() => { snapshot(); deleteObject(commentPopup.id); setCommentPopup(null) }}
                    className="text-slate-400 hover:text-red-600 text-xs">삭제</button>
                  <button onClick={() => setCommentPopup(null)} className="text-slate-400 hover:text-slate-700 text-xs">✕</button>
                </div>
              </div>
              {commentPopup.editing ? (
                <textarea autoFocus value={commentPopup.text}
                  onChange={(e) => setCommentPopup({ ...commentPopup, text: e.target.value })}
                  onBlur={() => { updateObject(commentPopup.id, { text: commentPopup.text }); setCommentPopup({ ...commentPopup, editing: false }) }}
                  placeholder="댓글 입력 (@이름 으로 멘션)..."
                  className="w-full h-20 text-sm p-2 border border-slate-200 dark:border-slate-600 rounded-lg outline-none resize-none dark:bg-slate-900 dark:text-white" />
              ) : (
                <div onClick={() => setCommentPopup({ ...commentPopup, editing: true })}
                  className="text-sm text-slate-700 dark:text-slate-200 min-h-[40px] cursor-text whitespace-pre-wrap">
                  {commentPopup.text || <span className="text-slate-400">댓글을 입력하려면 클릭...</span>}
                </div>
              )}
            </div>
          )}

          {/* 텍스트 편집 오버레이 */}
          {editingText && (editingText.type === 'text' ? (
            // 순수 텍스트: 캔버스에 직접 쓰는 느낌 (테두리/배경 없음, 자동 확장)
            <textarea
              autoFocus
              value={editingText.value}
              onChange={(e) => {
                setEditingText({ ...editingText, value: e.target.value })
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
                e.target.style.width = 'auto'
                e.target.style.width = Math.max(e.target.scrollWidth + 4, 20) + 'px'
              }}
              onFocus={(e) => {
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingText(null)
              }}
              style={{
                position: 'fixed',
                left: editingText.x,
                top: editingText.y,
                fontSize: editingText.fontSize,
                lineHeight: 1.2,
                color: editingText.color,
                fontFamily: 'Arial, sans-serif',
                padding: 0,
                margin: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                resize: 'none',
                overflow: 'hidden',
                whiteSpace: 'pre',
                minWidth: '20px',
                zIndex: 1000,
                caretColor: editingText.color
              }}
            />
          ) : (
            // 스티커 등: 박스형 입력 (위에서 아래로 자동 확장)
            <textarea
              autoFocus
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 80) + 'px' } }}
              value={editingText.value}
              onChange={(e) => {
                setEditingText({ ...editingText, value: e.target.value })
                e.target.style.height = 'auto'
                e.target.style.height = Math.max(e.target.scrollHeight, 80) + 'px'
              }}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) commitText()
                if (e.key === 'Escape') setEditingText(null)
              }}
              style={{
                position: 'fixed',
                left: editingText.x + 10,
                top: editingText.y + 10,
                width: Math.max(editingText.width || 200, 160),
                fontSize: Math.max(editingText.fontSize || 14, 14),
                lineHeight: '1.4',
                padding: '8px',
                border: '2px solid #3b82f6',
                borderRadius: '6px',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                zIndex: 1000,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#ffffff',
                color: '#000000',
                verticalAlign: 'top',
                textAlign: 'left'
              }}
            />
          ))}
        </div>
      </div>

      {/* 하단 힌트 */}
      <div className="px-6 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400 flex gap-4">
        <span>🖱️ 선택 도구로 이동·크기조정</span>
        <span>✋ 손 도구로 화면 이동</span>
        <span>🖼️ Ctrl+V 로 이미지 붙여넣기</span>
        <span>✏️ 텍스트/스티커 더블클릭 편집</span>
        <span>🗑️ Delete 키로 삭제</span>
        <span>↩️ Ctrl+Z 실행취소</span>
        <span>📋 Ctrl+D 복제</span>
        <span>🔍 휠로 확대/축소</span>
      </div>
    </div>
  )
}
