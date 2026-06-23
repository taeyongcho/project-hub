import { useRef, useEffect, useState } from 'react'
import { Stage, Layer, Line, Rect, Circle, Text } from 'react-konva'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pen, Square, Circle as CircleIcon, Type, Sticky, Trash2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { io } from 'socket.io-client'
import api from '../api/client'
import { useBoard } from '../store/board'
import useAuth from '../store/auth'

const TOOLS = [
  { id: 'pen', icon: Pen, label: '펜' },
  { id: 'rectangle', icon: Square, label: '사각형' },
  { id: 'circle', icon: CircleIcon, label: '원' },
  { id: 'line', icon: Pen, label: '선' },
  { id: 'text', icon: Type, label: '텍스트' },
  { id: 'sticky', icon: Sticky, label: '스티커' },
]

const COLORS = ['#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']

export default function Whiteboard() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const qc = useQueryClient()

  const stageRef = useRef(null)
  const socketRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [activeUsers, setActiveUsers] = useState([])
  const [remoteCursors, setRemoteCursors] = useState({})

  const {
    boardName, objects, tool, color, brushSize,
    initBoard, setTool, setColor, setBrushSize,
    addObject, updateObject, deleteObject, setObjects,
    selectObject, deselect
  } = useBoard()

  // 보드 데이터 로드
  const { data: board, isLoading } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.get(`/whiteboards/${boardId}`).then(r => r.data),
    enabled: !!boardId
  })

  // 보드 저장
  const saveMut = useMutation({
    mutationFn: (data) => api.patch(`/whiteboards/${boardId}`, data),
    onSuccess: () => toast.success('저장됨')
  })

  // Socket.io 연결 및 초기화
  useEffect(() => {
    if (!board || !user) return

    initBoard(board.id, board.name)
    if (board.objects) setObjects(board.objects)

    // Socket.io 연결
    socketRef.current = io(window.location.origin, {
      path: '/socket.io',
      query: { boardId: boardId }
    })

    socketRef.current.on('connect', () => {
      console.log('Socket.io 연결됨')
      // 보드 join
      socketRef.current.emit('join_board', {
        boardId: boardId,
        userId: user.id,
        userName: user.name
      })
    })

    // 다른 사용자가 그렸을 때
    socketRef.current.on('draw', (data) => {
      addObject(data.object)
    })

    // 다른 사용자가 삭제했을 때
    socketRef.current.on('delete_object', (data) => {
      deleteObject(data.objectId)
    })

    // 다른 사용자가 업데이트했을 때
    socketRef.current.on('update_object', (data) => {
      updateObject(data.objectId, data.updates)
    })

    // 사용자 입장
    socketRef.current.on('user_joined', (data) => {
      setActiveUsers(data.activeUsers)
      if (data.userName !== user.name) {
        toast.success(`${data.userName}님이 입장했습니다`)
      }
    })

    // 사용자 퇴장
    socketRef.current.on('user_left', (data) => {
      setActiveUsers(data.activeUsers)
      toast.info(`${data.userName}님이 퇴장했습니다`)
    })

    // 다른 사용자 커서
    socketRef.current.on('cursor', (data) => {
      setRemoteCursors(prev => ({
        ...prev,
        [data.userId]: { x: data.x, y: data.y, userName: data.userName, color: data.color }
      }))
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [board, user])

  const handleMouseDown = (e) => {
    const pos = stageRef.current.getPointerPosition()
    if (!pos) return

    if (tool === 'sticky') {
      const newObj = {
        type: 'sticky',
        x: pos.x,
        y: pos.y,
        width: 120,
        height: 100,
        text: '새 스티커',
        color: '#fbbf24'
      }
      addObject(newObj)
      socketRef.current?.emit('draw', { boardId, object: newObj })
      return
    }

    if (tool === 'text') {
      const newObj = {
        type: 'text',
        x: pos.x,
        y: pos.y,
        text: '텍스트 입력',
        fontSize: 16,
        color
      }
      addObject(newObj)
      socketRef.current?.emit('draw', { boardId, object: newObj })
      return
    }

    setIsDrawing(true)
    setStartPos(pos)

    if (tool === 'pen') {
      addObject({
        type: 'pen',
        points: [pos.x, pos.y],
        color,
        brushSize
      })
    }
  }

  const handleMouseMove = (e) => {
    // 커서 위치 전송
    const pos = stageRef.current?.getPointerPosition()
    if (pos) {
      socketRef.current?.emit('cursor', { boardId, x: pos.x, y: pos.y, color })
    }

    if (!isDrawing || !startPos) return
    const pos2 = stageRef.current.getPointerPosition()
    if (!pos2) return

    if (tool === 'pen') {
      const lastObj = objects[objects.length - 1]
      if (lastObj?.type === 'pen') {
        updateObject(lastObj.id, {
          points: [...(lastObj.points || []), pos2.x, pos2.y]
        })
        // 최종 저장은 마우스 업에서
      }
    }
  }

  const handleMouseUp = () => {
    if (!isDrawing || !startPos) return
    const pos = stageRef.current?.getPointerPosition()
    if (!pos) {
      setIsDrawing(false)
      return
    }

    const lastObj = objects[objects.length - 1]

    if (tool === 'pen' && lastObj?.type === 'pen') {
      // 펜 그리기 완료 - 소켓으로 전송
      socketRef.current?.emit('draw', { boardId, object: lastObj })
    } else if (tool === 'rectangle') {
      const newObj = {
        type: 'rectangle',
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        width: Math.abs(pos.x - startPos.x),
        height: Math.abs(pos.y - startPos.y),
        color,
        fill: false
      }
      addObject(newObj)
      socketRef.current?.emit('draw', { boardId, object: newObj })
    } else if (tool === 'circle') {
      const radius = Math.sqrt(
        Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)
      ) / 2
      const newObj = {
        type: 'circle',
        x: startPos.x,
        y: startPos.y,
        radius,
        color,
        fill: false
      }
      addObject(newObj)
      socketRef.current?.emit('draw', { boardId, object: newObj })
    } else if (tool === 'line') {
      const newObj = {
        type: 'line',
        points: [startPos.x, startPos.y, pos.x, pos.y],
        color,
        brushSize
      }
      addObject(newObj)
      socketRef.current?.emit('draw', { boardId, object: newObj })
    }

    setIsDrawing(false)
    setStartPos(null)
  }

  const handleSave = () => {
    saveMut.mutate({ objects })
  }

  if (isLoading) return <div className="flex items-center justify-center h-screen">로딩 중...</div>

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">←</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{boardName}</h1>
          {/* 활성 사용자 표시 */}
          <div className="flex items-center gap-2 ml-4">
            {activeUsers.map(u => (
              <div key={u.userId} className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded-full">
                <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                <span className="text-xs font-medium text-blue-900 dark:text-blue-100">{u.userName}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            💾 저장
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 왼쪽: 도구 바 */}
        <div className="w-16 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 gap-2">
          {TOOLS.map(t => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${
                tool === t.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <t.icon size={20} />
            </button>
          ))}

          <div className="border-t border-slate-200 dark:border-slate-800 my-2 w-10" />

          {/* 색상 선택 */}
          <div className="flex flex-col gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                  color === c
                    ? 'border-slate-900 dark:border-white'
                    : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* 브러시 사이즈 */}
          <div className="border-t border-slate-200 dark:border-slate-800 my-2 w-10" />
          <label className="text-xs text-slate-500 dark:text-slate-400">크기</label>
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-10 h-1"
          />
        </div>

        {/* 중앙: 캔버스 */}
        <div className="flex-1 bg-white dark:bg-slate-900 overflow-hidden relative">
          <Stage
            ref={stageRef}
            width={window.innerWidth - 64}
            height={window.innerHeight - 80}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="bg-white dark:bg-slate-900"
          >
            <Layer>
              {/* 배경 그리드 */}
              {Array.from({ length: 100 }).map((_, i) => (
                <Line
                  key={`v-${i}`}
                  points={[i * 50, 0, i * 50, window.innerHeight]}
                  stroke="#e2e8f0"
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              ))}
              {Array.from({ length: 100 }).map((_, i) => (
                <Line
                  key={`h-${i}`}
                  points={[0, i * 50, window.innerWidth, i * 50]}
                  stroke="#e2e8f0"
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              ))}

              {/* 오브젝트 렌더링 */}
              {objects.map(obj => {
                if (obj.type === 'pen') {
                  return (
                    <Line
                      key={obj.id}
                      points={obj.points}
                      stroke={obj.color}
                      strokeWidth={obj.brushSize}
                      lineCap="round"
                      lineJoin="round"
                      onClick={() => selectObject(obj.id)}
                    />
                  )
                }
                if (obj.type === 'rectangle') {
                  return (
                    <Rect
                      key={obj.id}
                      x={obj.x}
                      y={obj.y}
                      width={obj.width}
                      height={obj.height}
                      stroke={obj.color}
                      strokeWidth={2}
                      fill="none"
                      onClick={() => selectObject(obj.id)}
                    />
                  )
                }
                if (obj.type === 'circle') {
                  return (
                    <Circle
                      key={obj.id}
                      x={obj.x}
                      y={obj.y}
                      radius={obj.radius}
                      stroke={obj.color}
                      strokeWidth={2}
                      fill="none"
                      onClick={() => selectObject(obj.id)}
                    />
                  )
                }
                if (obj.type === 'line') {
                  return (
                    <Line
                      key={obj.id}
                      points={obj.points}
                      stroke={obj.color}
                      strokeWidth={obj.brushSize}
                      lineCap="round"
                      onClick={() => selectObject(obj.id)}
                    />
                  )
                }
                if (obj.type === 'text') {
                  return (
                    <Text
                      key={obj.id}
                      x={obj.x}
                      y={obj.y}
                      text={obj.text}
                      fontSize={obj.fontSize}
                      fill={obj.color}
                      onClick={() => selectObject(obj.id)}
                    />
                  )
                }
                if (obj.type === 'sticky') {
                  return (
                    <g key={obj.id}>
                      <Rect
                        x={obj.x}
                        y={obj.y}
                        width={obj.width}
                        height={obj.height}
                        fill={obj.color}
                        shadowBlur={4}
                        shadowOffsetY={2}
                        onClick={() => selectObject(obj.id)}
                      />
                      <Text
                        x={obj.x + 8}
                        y={obj.y + 8}
                        text={obj.text}
                        fontSize={13}
                        width={obj.width - 16}
                        fill="#1f2937"
                        wrap="word"
                      />
                    </g>
                  )
                }
                return null
              })}
            </Layer>
          </Stage>

          {/* 원격 커서 표시 */}
          {Object.entries(remoteCursors).map(([userId, cursor]) => (
            <div
              key={userId}
              className="absolute pointer-events-none"
              style={{ left: cursor.x, top: cursor.y }}
            >
              <div className="relative">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={cursor.color} strokeWidth="2">
                  <path d="M3 3L3 19L8 15L13 19L13 3Z" fill={cursor.color} />
                </svg>
                <div className="absolute left-6 top-0 text-xs bg-slate-800 text-white px-2 py-1 rounded whitespace-nowrap">
                  {cursor.userName}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
