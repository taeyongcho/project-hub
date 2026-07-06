import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown, Building2, Users, Upload } from 'lucide-react'
import api from '../api/client'
import useAuth from '../store/auth'
import Avatar from '../components/Avatar'

function collectCodes(node, acc) {
  acc.add(node.code)
  for (const c of node.children || []) collectCodes(c, acc)
  return acc
}

function TreeNode({ node, depth, selected, onSelect, expanded, toggle }) {
  const hasChildren = (node.children || []).length > 0
  const isOpen = expanded.has(node.code)
  const isSel = selected === node.code
  return (
    <div>
      <button
        onClick={() => { onSelect(node.code); if (hasChildren) toggle(node.code) }}
        className={`w-full flex items-center gap-1.5 py-1.5 pr-2 rounded-lg text-sm transition-colors ${
          isSel ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}>
        {hasChildren
          ? (isOpen ? <ChevronDown size={14} className="flex-shrink-0 text-slate-400" /> : <ChevronRight size={14} className="flex-shrink-0 text-slate-400" />)
          : <span className="w-3.5 flex-shrink-0" />}
        <span className="truncate">{node.name}</span>
        {node.member_count > 0 && (
          <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-0.5">
            <Users size={11} />{node.member_count}
          </span>
        )}
      </button>
      {hasChildren && isOpen && (
        <div>
          {node.children.map(c => (
            <TreeNode key={c.code} node={c} depth={depth + 1}
              selected={selected} onSelect={onSelect} expanded={expanded} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Org() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [selected, setSelected] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const orgFileRef = useRef()
  const empFileRef = useRef()

  const { data: tree = [] } = useQuery({
    queryKey: ['org-tree'],
    queryFn: () => api.get('/org/tree').then(r => r.data),
  })
  const { data: employees = [] } = useQuery({
    queryKey: ['org-employees'],
    queryFn: () => api.get('/org/employees').then(r => r.data),
  })

  const toggle = (code) => setExpanded(prev => {
    const n = new Set(prev)
    n.has(code) ? n.delete(code) : n.add(code)
    return n
  })

  // 선택 조직(및 하위) 코드 집합
  const selectedCodes = useMemo(() => {
    if (!selected) return null
    const find = (nodes) => {
      for (const n of nodes) {
        if (n.code === selected) return n
        const f = find(n.children || [])
        if (f) return f
      }
      return null
    }
    const node = find(tree)
    return node ? collectCodes(node, new Set()) : new Set([selected])
  }, [selected, tree])

  const shownEmployees = selectedCodes
    ? employees.filter(e => e.dept_code && selectedCodes.has(e.dept_code))
    : employees

  const uploadMut = useMutation({
    mutationFn: ({ url, file }) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post(url, fd).then(r => r.data)
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['org-tree'] })
      qc.invalidateQueries({ queryKey: ['org-employees'] })
      qc.invalidateQueries({ queryKey: ['users'] })
      if (vars.kind === 'org') toast.success(`조직 반영: 신규 ${data.created}, 갱신 ${data.updated}`)
      else toast.success(`직원 반영: 신규 ${data.created}, 갱신 ${data.updated}${data.skipped ? `, 건너뜀 ${data.skipped}` : ''}`)
    },
    onError: (err) => toast.error(err.response?.data?.detail || '업로드 실패'),
  })

  const onFile = (kind, url, ref) => (e) => {
    const file = e.target.files[0]
    if (file) uploadMut.mutate({ url, file, kind })
    e.target.value = ''
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">조직도</h1>
          <p className="text-sm text-slate-400 mt-0.5">총 {employees.length}명 · 조직 {(function count(ns){return ns.reduce((a,n)=>a+1+count(n.children||[]),0)})(tree)}개</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => orgFileRef.current.click()} disabled={uploadMut.isPending}
              className="flex items-center gap-1.5 text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-2 rounded-xl font-medium transition-colors disabled:opacity-50">
              <Upload size={15} /> 조직 CSV
            </button>
            <button onClick={() => empFileRef.current.click()} disabled={uploadMut.isPending}
              className="flex items-center gap-1.5 text-sm bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white px-3 py-2 rounded-xl font-medium transition-colors disabled:opacity-50">
              <Upload size={15} /> 직원 CSV
            </button>
            <input ref={orgFileRef} type="file" accept=".csv" className="hidden" onChange={onFile('org', '/org/import-orgs', orgFileRef)} />
            <input ref={empFileRef} type="file" accept=".csv" className="hidden" onChange={onFile('emp', '/org/import-employees', empFileRef)} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5">
        {/* 트리 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-3">
          <button onClick={() => setSelected(null)}
            className={`w-full flex items-center gap-1.5 py-1.5 px-2 rounded-lg text-sm mb-1 transition-colors ${
              !selected ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}>
            <Building2 size={14} /> 전체
          </button>
          {tree.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-6">조직 데이터가 없습니다.{isAdmin && ' 조직 CSV를 업로드하세요.'}</div>
          ) : tree.map(n => (
            <TreeNode key={n.code} node={n} depth={0}
              selected={selected} onSelect={setSelected} expanded={expanded} toggle={toggle} />
          ))}
        </div>

        {/* 직원 목록 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {selected ? '선택 조직 인원' : '전체 인원'} <span className="text-slate-400 font-normal">({shownEmployees.length})</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[60vh] overflow-y-auto">
            {shownEmployees.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-10">해당 조직에 인원이 없습니다.</div>
            ) : shownEmployees.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar emoji={e.avatar_emoji} color={e.avatar_color} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {e.name}
                    {e.role === 'admin' && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">관리자</span>}
                  </div>
                  <div className="text-xs text-slate-400 truncate">{e.dept_name || '미배정'} · {e.employee_no || '-'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
