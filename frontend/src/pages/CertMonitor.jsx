import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Trash2, Plus, HelpCircle } from 'lucide-react'
import api from '../api/client'
import useAuth from '../store/auth'

const STATUS = {
  ok:      { label: '정상',      cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', Icon: ShieldCheck },
  warning: { label: '만료 임박',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',    Icon: ShieldAlert },
  expired: { label: '만료됨',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',           Icon: ShieldX },
  error:   { label: '확인 실패',  cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',       Icon: HelpCircle },
  unknown: { label: '미확인',    cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',       Icon: HelpCircle },
}

function fmtDays(d) {
  if (d === null || d === undefined) return '—'
  if (d < 0) return `${-d}일 경과`
  return `${d}일 남음`
}

export default function CertMonitor() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [host, setHost] = useState('')
  const [label, setLabel] = useState('')

  const { data: certs = [], isLoading, isError } = useQuery({
    queryKey: ['cert-monitor'],
    queryFn: () => api.get('/cert-monitor').then(r => r.data),
    enabled: me?.role === 'admin',
    refetchOnWindowFocus: false,
  })

  const addMut = useMutation({
    mutationFn: body => api.post('/cert-monitor', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cert-monitor'] })
      setHost(''); setLabel('')
      toast.success('도메인이 추가되었습니다')
    },
    onError: err => toast.error(err.response?.data?.detail || '추가 실패'),
  })

  const refreshMut = useMutation({
    mutationFn: id => api.post(`/cert-monitor/${id}/refresh`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cert-monitor'] }),
    onError: () => toast.error('갱신 실패'),
  })

  const refreshAllMut = useMutation({
    mutationFn: () => api.post('/cert-monitor/refresh-all'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cert-monitor'] }); toast.success('전체 갱신 완료') },
    onError: () => toast.error('갱신 실패'),
  })

  const delMut = useMutation({
    mutationFn: id => api.delete(`/cert-monitor/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cert-monitor'] }); toast.success('삭제되었습니다') },
    onError: () => toast.error('삭제 실패'),
  })

  if (me?.role !== 'admin') {
    return <div className="p-6 text-slate-400">접근 권한이 없습니다.</div>
  }

  const submit = e => {
    e.preventDefault()
    if (!host.trim()) return
    addMut.mutate({ host: host.trim(), label: label.trim() })
  }

  const warnCount = certs.filter(c => c.status === 'warning' || c.status === 'expired').length
  const inputCls = 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">인증서 관리</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            SSL 인증서 만료 모니터링 · 총 {certs.length}개
            {warnCount > 0 && <span className="text-amber-600 dark:text-amber-400 font-medium"> · 주의 {warnCount}개</span>}
          </p>
        </div>
        <button onClick={() => refreshAllMut.mutate()} disabled={refreshAllMut.isPending}
          className="flex items-center gap-1.5 text-sm bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
          <RefreshCw size={15} className={refreshAllMut.isPending ? 'animate-spin' : ''} />
          전체 갱신
        </button>
      </div>

      {/* 추가 폼 */}
      <form onSubmit={submit} className="flex flex-wrap gap-2 mb-5">
        <input value={host} onChange={e => setHost(e.target.value)}
          placeholder="도메인 (예: hub.afg.kr)" className={`${inputCls} flex-1 min-w-[180px]`} />
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder="이름 (선택)" className={`${inputCls} w-40`} />
        <button type="submit" disabled={addMut.isPending}
          className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors">
          <Plus size={15} /> 추가
        </button>
      </form>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <th className="text-left py-3 px-4">도메인</th>
              <th className="text-left py-3 px-4">상태</th>
              <th className="text-left py-3 px-4">만료일</th>
              <th className="text-left py-3 px-4">남은 기간</th>
              <th className="text-left py-3 px-4 hidden md:table-cell">발급자</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-400">불러오는 중...</td></tr>
            ) : isError ? (
              <tr><td colSpan={6} className="py-10 text-center text-red-500">목록을 불러오지 못했습니다.</td></tr>
            ) : certs.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-400">등록된 도메인이 없습니다. 위에서 추가하세요.</td></tr>
            ) : (
              certs.map(c => {
                const s = STATUS[c.status] || STATUS.unknown
                const Icon = s.Icon
                return (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{c.label}</div>
                      {c.label !== c.host && <div className="text-xs text-slate-400">{c.host}{c.port !== 443 ? `:${c.port}` : ''}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${s.cls}`}>
                        <Icon size={12} /> {s.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {c.expires_at ? c.expires_at.slice(0, 10) : '—'}
                    </td>
                    <td className={`py-3 px-4 font-medium ${
                      c.status === 'expired' ? 'text-red-600 dark:text-red-400'
                      : c.status === 'warning' ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-600 dark:text-slate-300'}`}>
                      {fmtDays(c.days_left)}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-xs hidden md:table-cell max-w-[220px] truncate" title={c.last_error || c.issuer || ''}>
                      {c.last_error ? <span className="text-red-400">{c.last_error}</span> : (c.issuer || '—')}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button onClick={() => refreshMut.mutate(c.id)}
                        className="text-slate-400 hover:text-blue-500 transition-colors p-1" title="갱신">
                        <RefreshCw size={15} className={refreshMut.isPending && refreshMut.variables === c.id ? 'animate-spin' : ''} />
                      </button>
                      <button onClick={() => confirm(`'${c.label}' 모니터링을 삭제할까요?`) && delMut.mutate(c.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1 ml-1" title="삭제">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 mt-4">
        매일 오전 8시 자동 점검됩니다. 만료 30일 전부터 상단 알림(🔔)에 표시됩니다.
      </p>
    </div>
  )
}
