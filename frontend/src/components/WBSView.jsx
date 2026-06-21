import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'
import dayjs from 'dayjs'

const STATUS_MAP = {
  todo:        { label: '할 일',  cls: 'bg-slate-100 text-slate-600' },
  in_progress: { label: '진행 중', cls: 'bg-blue-100 text-blue-700' },
  review:      { label: '검토',   cls: 'bg-amber-100 text-amber-700' },
  done:        { label: '완료',   cls: 'bg-emerald-100 text-emerald-700' },
}

const PRIORITY_MAP = {
  urgent: { label: '긴급', cls: 'text-red-500' },
  high:   { label: '높음', cls: 'text-amber-500' },
  normal: { label: '보통', cls: 'text-blue-400' },
  low:    { label: '낮음', cls: 'text-slate-400' },
}

// 평탄한 배열 → 트리 구조 변환
function buildTree(tasks) {
  const map = {}
  tasks.forEach(t => { map[t.id] = { ...t, children: [] } })
  const roots = []
  tasks.forEach(t => {
    if (t.parent_id && map[t.parent_id]) {
      map[t.parent_id].children.push(map[t.id])
    } else {
      roots.push(map[t.id])
    }
  })
  // wbs_order 정렬
  const sortChildren = node => {
    node.children.sort((a, b) => a.wbs_order - b.wbs_order)
    node.children.forEach(sortChildren)
  }
  roots.sort((a, b) => a.wbs_order - b.wbs_order)
  roots.forEach(sortChildren)
  return roots
}

// 트리 → 평탄화 (WBS 번호 포함)
function flattenTree(nodes, prefix = '', level = 0) {
  const result = []
  nodes.forEach((node, idx) => {
    const wbsNum = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`
    result.push({ ...node, wbsNum, level })
    if (node.children?.length) {
      result.push(...flattenTree(node.children, wbsNum, level + 1))
    }
  })
  return result
}

// CSV 내보내기
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
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'WBS.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function WBSView({ tasks, projectId, users, onSelectTask }) {
  const qc = useQueryClient()
  const [collapsed, setCollapsed] = useState(new Set())
  const [addingParent, setAddingParent] = useState(null) // null=루트, id=자식
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  const tree = buildTree(tasks)

  // 접힌 노드의 자식을 제외한 평탄화
  const flattenVisible = (nodes, prefix = '', level = 0) => {
    const result = []
    nodes.forEach((node, idx) => {
      const wbsNum = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`
      result.push({ ...node, wbsNum, level })
      if (node.children?.length && !collapsed.has(node.id)) {
        result.push(...flattenVisible(node.children, wbsNum, level + 1))
      }
    })
    return result
  }

  const allRows = flattenTree(tree)   // CSV용 전체
  const visibleRows = flattenVisible(tree)  // 화면용

  const createMut = useMutation({
    mutationFn: data => api.post('/tasks', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', String(projectId)] })
      qc.invalidateQueries({ queryKey: ['project', String(projectId)] })
      setAddingParent(undefined)
      setNewTitle('')
    }
  })

  const renameMut = useMutation({
    mutationFn: ({ id, title }) => api.patch(`/tasks/${id}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', String(projectId)] })
      setEditingId(null)
    }
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
    // 같은 레벨의 최대 wbs_order + 1
    const siblings = tasks.filter(t => (t.parent_id ?? null) === (parentId ?? null))
    const order = siblings.length > 0 ? Math.max(...siblings.map(t => t.wbs_order)) + 1 : 0
    createMut.mutate({
      title: newTitle.trim(),
      project_id: projectId,
      parent_id: parentId ?? null,
      wbs_order: order,
      priority: 'normal',
    })
  }

  const toggleCollapse = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasChildren = id => tasks.some(t => t.parent_id === id)

  return (
    <div className="flex flex-col h-full">
      {/* 툴바 */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => { setAddingParent(null); setNewTitle('') }}
          className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl font-medium transition-colors"
        >
          + 항목 추가
        </button>
        <button
          onClick={() => exportCSV(allRows, users)}
          className="text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl font-medium transition-colors"
        >
          CSV 내보내기
        </button>
        <span className="text-xs text-slate-400 ml-auto">총 {tasks.length}개 항목</span>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-16">WBS</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500">작업명</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">담당자</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">시작일</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-24">마감일</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-20">상태</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 w-14">우선순위</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {/* 루트 추가 입력 */}
            {addingParent === null && (
              <AddRow
                level={0}
                value={newTitle}
                onChange={setNewTitle}
                onConfirm={() => handleAdd(null)}
                onCancel={() => setAddingParent(undefined)}
                loading={createMut.isPending}
              />
            )}

            {visibleRows.length === 0 && addingParent !== null && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400 text-sm">
                  항목이 없습니다. "+ 항목 추가" 버튼으로 시작하세요.
                </td>
              </tr>
            )}

            {visibleRows.map(row => {
              const assignee = users.find(u => u.id === row.assigned_to_id)
              const status = STATUS_MAP[row.status] || STATUS_MAP.todo
              const priority = PRIORITY_MAP[row.priority] || PRIORITY_MAP.normal
              const isOverdue = row.due_date && row.status !== 'done' && dayjs(row.due_date).isBefore(dayjs(), 'day')
              const childCount = tasks.filter(t => t.parent_id === row.id).length
              const isCollapsed = collapsed.has(row.id)

              return (
                <>
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 hover:bg-slate-50 group transition-colors"
                  >
                    {/* WBS 번호 */}
                    <td className="px-3 py-2 text-xs text-slate-400 font-mono whitespace-nowrap">
                      {row.wbsNum}
                    </td>

                    {/* 작업명 */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1" style={{ paddingLeft: `${row.level * 20}px` }}>
                        {/* 접기/펴기 */}
                        {childCount > 0 ? (
                          <button
                            onClick={() => toggleCollapse(row.id)}
                            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 flex-shrink-0"
                          >
                            {isCollapsed ? '▶' : '▼'}
                          </button>
                        ) : (
                          <span className="w-4 flex-shrink-0" />
                        )}

                        {editingId === row.id ? (
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onBlur={() => renameMut.mutate({ id: row.id, title: editTitle })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') renameMut.mutate({ id: row.id, title: editTitle })
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            className="flex-1 border-b border-blue-500 outline-none text-sm text-slate-900 bg-transparent py-0.5"
                          />
                        ) : (
                          <span
                            onClick={() => onSelectTask(row.id)}
                            onDoubleClick={() => { setEditingId(row.id); setEditTitle(row.title) }}
                            className={`flex-1 cursor-pointer hover:text-blue-600 transition-colors text-sm font-medium ${
                              row.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'
                            } ${isOverdue ? 'text-red-500' : ''}`}
                            title="클릭: 상세보기 · 더블클릭: 이름 수정"
                          >
                            {row.title}
                          </span>
                        )}

                        {childCount > 0 && isCollapsed && (
                          <span className="text-[10px] text-slate-400 ml-1">({childCount})</span>
                        )}
                      </div>
                    </td>

                    {/* 담당자 */}
                    <td className="px-3 py-2">
                      {assignee ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700">
                            {assignee.name[0]}
                          </div>
                          <span className="text-xs text-slate-600 truncate">{assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>

                    {/* 시작일 */}
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                      {row.start_date ? dayjs(row.start_date).format('YY.MM.DD') : '-'}
                    </td>

                    {/* 마감일 */}
                    <td className={`px-3 py-2 text-xs whitespace-nowrap font-medium ${isOverdue ? 'text-red-500' : 'text-slate-500'}`}>
                      {row.due_date ? dayjs(row.due_date).format('YY.MM.DD') : '-'}
                      {isOverdue && <span className="ml-1 text-[10px]">지연</span>}
                    </td>

                    {/* 상태 */}
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>

                    {/* 우선순위 */}
                    <td className={`px-3 py-2 text-xs font-medium ${priority.cls}`}>
                      {priority.label}
                    </td>

                    {/* 액션 */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setAddingParent(row.id); setNewTitle('') }}
                          title="하위 항목 추가"
                          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors text-xs"
                        >+</button>
                        <button
                          onClick={() => confirm(`"${row.title}"을 삭제할까요?`) && deleteMut.mutate(row.id)}
                          title="삭제"
                          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors text-xs"
                        >✕</button>
                      </div>
                    </td>
                  </tr>

                  {/* 하위 항목 추가 입력 */}
                  {addingParent === row.id && (
                    <tr key={`add-${row.id}`}>
                      <td />
                      <td colSpan={7}>
                        <AddRow
                          level={row.level + 1}
                          value={newTitle}
                          onChange={setNewTitle}
                          onConfirm={() => handleAdd(row.id)}
                          onCancel={() => setAddingParent(undefined)}
                          loading={createMut.isPending}
                        />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 mt-2">
        클릭: 상세 패널 · 더블클릭: 이름 수정 · 행 오른쪽 + 버튼: 하위 항목 추가
      </p>
    </div>
  )
}

function AddRow({ level, value, onChange, onConfirm, onCancel, loading }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100"
      style={{ paddingLeft: `${12 + level * 20}px` }}>
      <span className="w-4 flex-shrink-0" />
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onConfirm()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="작업명 입력 후 Enter..."
        className="flex-1 bg-white border border-blue-300 rounded-lg px-2 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-400"
      />
      <button onClick={onConfirm} disabled={loading || !value.trim()}
        className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded-lg font-medium transition-colors">
        추가
      </button>
      <button onClick={onCancel}
        className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded transition-colors">
        취소
      </button>
    </div>
  )
}
