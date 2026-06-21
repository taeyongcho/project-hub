import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import minMax from 'dayjs/plugin/minMax'
dayjs.extend(isBetween)
dayjs.extend(minMax)

const STATUS_MAP = {
  todo:        { label: '할 일',  cls: 'bg-slate-100 text-slate-600',  bar: '#94a3b8' },
  in_progress: { label: '진행 중', cls: 'bg-blue-100 text-blue-700',   bar: '#3b82f6' },
  review:      { label: '검토',   cls: 'bg-amber-100 text-amber-700',  bar: '#f59e0b' },
  done:        { label: '완료',   cls: 'bg-emerald-100 text-emerald-700', bar: '#10b981' },
}

const PRIORITY_MAP = {
  urgent: { label: '긴급', cls: 'text-red-500' },
  high:   { label: '높음', cls: 'text-amber-500' },
  normal: { label: '보통', cls: 'text-blue-400' },
  low:    { label: '낮음', cls: 'text-slate-400' },
}

const DAY_PX = 28  // 1일 = 28px

function buildTree(tasks) {
  const map = {}
  tasks.forEach(t => { map[t.id] = { ...t, children: [] } })
  const roots = []
  tasks.forEach(t => {
    if (t.parent_id && map[t.parent_id]) map[t.parent_id].children.push(map[t.id])
    else roots.push(map[t.id])
  })
  const sort = n => { n.children.sort((a, b) => a.wbs_order - b.wbs_order); n.children.forEach(sort) }
  roots.sort((a, b) => a.wbs_order - b.wbs_order)
  roots.forEach(sort)
  return roots
}

function flattenVisible(nodes, collapsed, prefix = '', level = 0) {
  const result = []
  nodes.forEach((node, idx) => {
    const wbsNum = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`
    result.push({ ...node, wbsNum, level })
    if (node.children?.length && !collapsed.has(node.id))
      result.push(...flattenVisible(node.children, collapsed, wbsNum, level + 1))
  })
  return result
}

function flattenAll(nodes, prefix = '', level = 0) {
  const result = []
  nodes.forEach((node, idx) => {
    const wbsNum = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`
    result.push({ ...node, wbsNum, level })
    if (node.children?.length)
      result.push(...flattenAll(node.children, wbsNum, level + 1))
  })
  return result
}

function exportCSV(rows, users) {
  const header = ['WBS', '작업명', '담당자', '시작일', '마감일', '상태', '우선순위']
  const data = rows.map(r => [
    r.wbsNum,
    '  '.repeat(r.level) + r.title,
    users.find(u => u.id === r.assigned_to_id)?.name || '',
    r.start_date || '',
    r.due_date || '',
    STATUS_MAP[r.status]?.label || r.status,
    PRIORITY_MAP[r.priority]?.label || r.priority,
  ])
  const csv = [header, ...data].map(row => row.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'WBS.csv' })
  a.click()
}

export default function WBSView({ tasks, projectId, users, onSelectTask }) {
  const qc = useQueryClient()
  const ganttRef = useRef(null)
  const tableBodyRef = useRef(null)
  const [collapsed, setCollapsed] = useState(new Set())
  const [addingParent, setAddingParent] = useState(undefined)
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const ROW_H = 36

  const tree = buildTree(tasks)
  const visibleRows = flattenVisible(tree, collapsed)
  const allRows = flattenAll(tree)

  // 전체 날짜 범위 계산
  const dates = tasks.flatMap(t => [t.start_date, t.due_date].filter(Boolean)).map(d => dayjs(d))
  const ganttStart = dates.length ? dayjs.min(...dates).startOf('month') : dayjs().startOf('month')
  const ganttEnd   = dates.length ? dayjs.max(...dates).endOf('month')   : dayjs().add(2, 'month').endOf('month')
  const totalDays  = ganttEnd.diff(ganttStart, 'day') + 1
  const totalWidth = totalDays * DAY_PX

  // 월 헤더 생성
  const months = []
  let cur = ganttStart.startOf('month')
  while (cur.isBefore(ganttEnd)) {
    const start = cur.isBefore(ganttStart) ? ganttStart : cur
    const end = cur.endOf('month').isAfter(ganttEnd) ? ganttEnd : cur.endOf('month')
    months.push({ label: cur.format('YYYY년 MM월'), days: end.diff(start, 'day') + 1, startDay: start.diff(ganttStart, 'day') })
    cur = cur.add(1, 'month')
  }

  // 오늘 위치
  const todayOffset = dayjs().diff(ganttStart, 'day') * DAY_PX

  // 간트 바 위치 계산
  const barStyle = (row) => {
    if (!row.start_date && !row.due_date) return null
    const s = row.start_date ? dayjs(row.start_date) : (row.due_date ? dayjs(row.due_date) : null)
    const e = row.due_date  ? dayjs(row.due_date)   : s
    const left  = s.diff(ganttStart, 'day') * DAY_PX
    const width = Math.max(e.diff(s, 'day') + 1, 1) * DAY_PX
    return { left, width }
  }

  const createMut = useMutation({
    mutationFn: data => api.post('/tasks', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', String(projectId)] })
      qc.invalidateQueries({ queryKey: ['project', String(projectId)] })
      setAddingParent(undefined); setNewTitle('')
    }
  })

  const renameMut = useMutation({
    mutationFn: ({ id, title }) => api.patch(`/tasks/${id}`, { title }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', String(projectId)] }); setEditingId(null) }
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', String(projectId)] })
      qc.invalidateQueries({ queryKey: ['project', String(projectId)] })
    }
  })

  const handleAdd = (parentId) => {
    if (!newTitle.trim()) return
    const siblings = tasks.filter(t => (t.parent_id ?? null) === (parentId ?? null))
    const order = siblings.length ? Math.max(...siblings.map(t => t.wbs_order)) + 1 : 0
    createMut.mutate({ title: newTitle.trim(), project_id: projectId, parent_id: parentId ?? null, wbs_order: order, priority: 'normal' })
  }

  // 테이블 스크롤과 간트 스크롤 동기화
  const syncScroll = (e) => {
    if (ganttRef.current) ganttRef.current.scrollTop = e.target.scrollTop
  }
  const syncScrollGantt = (e) => {
    if (tableBodyRef.current) tableBodyRef.current.scrollTop = e.target.scrollTop
  }

  const toggleCollapse = id => setCollapsed(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const hasChildren = id => tasks.some(t => t.parent_id === id)

  // 오늘 위치로 스크롤
  useEffect(() => {
    if (ganttRef.current && todayOffset > 0) {
      ganttRef.current.scrollLeft = Math.max(0, todayOffset - 200)
    }
  }, [todayOffset])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 툴바 */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <button onClick={() => { setAddingParent(null); setNewTitle('') }}
          className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl font-medium transition-colors">
          + 항목 추가
        </button>
        <button onClick={() => exportCSV(allRows, users)}
          className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl font-medium transition-colors">
          CSV 내보내기
        </button>
        <span className="text-xs text-slate-400 ml-auto">총 {tasks.length}개 · 클릭: 상세 · 더블클릭: 이름수정</span>
      </div>

      {/* 본문: 왼쪽 고정 테이블 + 오른쪽 간트 */}
      <div className="flex flex-1 min-h-0 border border-slate-200 rounded-xl overflow-hidden bg-white">

        {/* ── 왼쪽: 고정 테이블 ── */}
        <div className="flex flex-col flex-shrink-0 border-r border-slate-200" style={{ width: 420 }}>
          {/* 헤더 */}
          <div className="flex items-center bg-slate-50 border-b border-slate-200 flex-shrink-0" style={{ height: 56 }}>
            <div className="px-3 text-xs font-semibold text-slate-500 w-14">WBS</div>
            <div className="flex-1 px-2 text-xs font-semibold text-slate-500">작업명</div>
            <div className="w-20 px-2 text-xs font-semibold text-slate-500">담당자</div>
            <div className="w-16 px-2 text-xs font-semibold text-slate-500">상태</div>
          </div>

          {/* 루트 추가 행 */}
          {addingParent === null && (
            <div className="border-b border-blue-100 bg-blue-50 flex-shrink-0">
              <AddRow level={0} value={newTitle} onChange={setNewTitle}
                onConfirm={() => handleAdd(null)} onCancel={() => setAddingParent(undefined)}
                loading={createMut.isPending} />
            </div>
          )}

          {/* 스크롤 바디 */}
          <div ref={tableBodyRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={syncScroll}>
            {visibleRows.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                항목이 없습니다. "+ 항목 추가" 버튼으로 시작하세요.
              </div>
            ) : visibleRows.map((row, idx) => {
              const assignee = users.find(u => u.id === row.assigned_to_id)
              const status = STATUS_MAP[row.status] || STATUS_MAP.todo
              const isOverdue = row.due_date && row.status !== 'done' && dayjs(row.due_date).isBefore(dayjs(), 'day')
              const childCnt = tasks.filter(t => t.parent_id === row.id).length

              return (
                <div key={row.id}>
                  <div
                    className="flex items-center border-b border-slate-100 hover:bg-slate-50 group transition-colors"
                    style={{ height: ROW_H }}
                  >
                    {/* WBS 번호 */}
                    <div className="px-3 text-xs text-slate-400 font-mono w-14 flex-shrink-0">{row.wbsNum}</div>

                    {/* 작업명 */}
                    <div className="flex-1 px-1 flex items-center gap-1 min-w-0" style={{ paddingLeft: `${4 + row.level * 16}px` }}>
                      {childCnt > 0 ? (
                        <button onClick={() => toggleCollapse(row.id)}
                          className="w-4 h-4 text-[10px] text-slate-400 hover:text-slate-700 flex-shrink-0 flex items-center justify-center">
                          {collapsed.has(row.id) ? '▶' : '▼'}
                        </button>
                      ) : <span className="w-4 flex-shrink-0" />}

                      {editingId === row.id ? (
                        <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
                          onBlur={() => renameMut.mutate({ id: row.id, title: editTitle })}
                          onKeyDown={e => { if (e.key === 'Enter') renameMut.mutate({ id: row.id, title: editTitle }); if (e.key === 'Escape') setEditingId(null) }}
                          className="flex-1 border-b border-blue-500 outline-none text-xs text-slate-900 bg-transparent" />
                      ) : childCnt > 0 ? (
                        // 상위 그룹 항목 — 클릭해도 상세 패널 안 열림
                        <span
                          onDoubleClick={() => { setEditingId(row.id); setEditTitle(row.title) }}
                          className="flex-1 text-xs font-bold text-slate-700 truncate cursor-default select-none"
                          title="더블클릭: 이름 수정"
                        >
                          {row.title}
                        </span>
                      ) : (
                        // 실행 태스크 — 클릭 시 상세 패널
                        <span
                          onClick={() => onSelectTask(row.id)}
                          onDoubleClick={() => { setEditingId(row.id); setEditTitle(row.title) }}
                          className={`flex-1 text-xs cursor-pointer hover:text-blue-600 truncate font-medium transition-colors ${
                            row.status === 'done' ? 'line-through text-slate-400' : isOverdue ? 'text-red-500' : 'text-slate-800'
                          }`}
                          title="클릭: 상세보기 · 더블클릭: 이름 수정"
                        >
                          {row.title}
                        </span>
                      )}

                      {/* 호버 액션 */}
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                        <button onClick={() => { setAddingParent(row.id); setNewTitle('') }}
                          title="하위 추가" className="w-5 h-5 text-[10px] text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded flex items-center justify-center">+</button>
                        <button onClick={() => confirm(`"${row.title}" 삭제?`) && deleteMut.mutate(row.id)}
                          title="삭제" className="w-5 h-5 text-[10px] text-slate-400 hover:text-red-500 hover:bg-red-50 rounded flex items-center justify-center">✕</button>
                      </div>
                    </div>

                    {/* 담당자 */}
                    <div className="w-20 px-2 flex-shrink-0">
                      {assignee ? (
                        <div className="flex items-center gap-1">
                          <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-700 flex-shrink-0">{assignee.name[0]}</div>
                          <span className="text-[10px] text-slate-600 truncate">{assignee.name}</span>
                        </div>
                      ) : <span className="text-[10px] text-slate-300">-</span>}
                    </div>

                    {/* 상태 */}
                    <div className="w-16 px-2 flex-shrink-0">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${status.cls}`}>{status.label}</span>
                    </div>
                  </div>

                  {/* 하위 추가 행 */}
                  {addingParent === row.id && (
                    <div className="border-b border-blue-100 bg-blue-50">
                      <AddRow level={row.level + 1} value={newTitle} onChange={setNewTitle}
                        onConfirm={() => handleAdd(row.id)} onCancel={() => setAddingParent(undefined)}
                        loading={createMut.isPending} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 오른쪽: 간트 차트 ── */}
        <div ref={ganttRef} className="flex-1 overflow-auto" onScroll={syncScrollGantt}>
          <div style={{ width: totalWidth, minWidth: '100%' }}>

            {/* 간트 헤더: 월 */}
            <div className="flex bg-slate-50 border-b border-slate-200 sticky top-0 z-10" style={{ height: 28 }}>
              {months.map((m, i) => (
                <div key={i} className="border-r border-slate-200 px-2 flex items-center text-[10px] font-semibold text-slate-500 flex-shrink-0 overflow-hidden"
                  style={{ width: m.days * DAY_PX }}>
                  {m.label}
                </div>
              ))}
            </div>

            {/* 간트 헤더: 일 */}
            <div className="flex bg-slate-50 border-b border-slate-200 sticky top-7 z-10" style={{ height: 28 }}>
              {Array.from({ length: totalDays }, (_, i) => {
                const d = ganttStart.add(i, 'day')
                const isToday = d.isSame(dayjs(), 'day')
                const isSun = d.day() === 0
                const isSat = d.day() === 6
                return (
                  <div key={i}
                    className={`flex-shrink-0 border-r border-slate-100 flex items-center justify-center text-[9px] font-medium
                      ${isToday ? 'bg-blue-500 text-white' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}
                    style={{ width: DAY_PX }}>
                    {d.date() === 1 || i === 0 ? d.format('D') : (d.date() % 5 === 0 ? d.format('D') : '')}
                  </div>
                )
              })}
            </div>

            {/* 루트 추가 행일 때 빈 행 */}
            {addingParent === null && <div style={{ height: ROW_H }} className="border-b border-blue-100 bg-blue-50/30" />}

            {/* 간트 바 행 */}
            {visibleRows.map((row) => {
              const bar = barStyle(row)
              const color = STATUS_MAP[row.status]?.bar || '#94a3b8'
              const isOverdue = row.due_date && row.status !== 'done' && dayjs(row.due_date).isBefore(dayjs(), 'day')

              return (
                <div key={row.id}>
                  <div className="relative border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    style={{ height: ROW_H }}>

                    {/* 주말 세로줄 */}
                    {Array.from({ length: totalDays }, (_, i) => {
                      const d = ganttStart.add(i, 'day')
                      if (d.day() === 0 || d.day() === 6) {
                        return <div key={i} className="absolute top-0 bottom-0 bg-slate-50/80" style={{ left: i * DAY_PX, width: DAY_PX }} />
                      }
                      return null
                    })}

                    {/* 오늘 세로선 */}
                    {todayOffset >= 0 && todayOffset <= totalWidth && (
                      <div className="absolute top-0 bottom-0 w-px bg-blue-400 z-10" style={{ left: todayOffset }} />
                    )}

                    {/* 간트 바 */}
                    {bar && (() => {
                      const isGroup = tasks.some(t => t.parent_id === row.id)
                      return isGroup ? (
                        // 상위 그룹: 얇은 진한 바
                        <div
                          className="absolute rounded-sm"
                          style={{ left: bar.left + 2, width: bar.width - 4, height: 8, top: '50%', transform: 'translateY(-50%)', background: '#475569' }}
                          title={`${row.title} (${row.start_date || '?'} ~ ${row.due_date || '?'})`}
                        />
                      ) : (
                        // 실행 태스크: 일반 바
                        <div
                          className="absolute top-1/2 -translate-y-1/2 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center px-1.5 overflow-hidden"
                          style={{ left: bar.left + 2, width: bar.width - 4, height: 20, background: isOverdue ? '#ef4444' : color }}
                          onClick={() => onSelectTask(row.id)}
                          title={`${row.title} (${row.start_date || '?'} ~ ${row.due_date || '?'})`}
                        >
                          <span className="text-white text-[10px] font-medium truncate">{row.title}</span>
                        </div>
                      )
                    })()}

                    {/* 날짜 없는 항목: 다이아몬드 마커 */}
                    {!bar && (
                      <div className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 text-[10px] text-slate-300 italic"
                        style={{ left: 0 }}>
                        (날짜 미설정)
                      </div>
                    )}
                  </div>

                  {/* 하위 추가 빈 행 */}
                  {addingParent === row.id && (
                    <div className="border-b border-blue-100 bg-blue-50/30" style={{ height: ROW_H }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function AddRow({ level, value, onChange, onConfirm, onCancel, loading }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: `${12 + level * 16}px` }}>
      <span className="w-4 flex-shrink-0" />
      <input autoFocus value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel() }}
        placeholder="작업명 입력 후 Enter..."
        className="flex-1 bg-white border border-blue-300 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-400" />
      <button onClick={onConfirm} disabled={loading || !value.trim()}
        className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg font-medium transition-colors">추가</button>
      <button onClick={onCancel}
        className="text-xs text-slate-400 hover:text-slate-700 px-1.5 py-1 rounded transition-colors">취소</button>
    </div>
  )
}
