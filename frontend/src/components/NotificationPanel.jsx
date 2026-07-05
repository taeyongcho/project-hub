import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import dayjs from 'dayjs'

const META = {
  task_assigned:   { icon: '📌', color: 'text-blue-500',   border: 'border-l-blue-400' },
  task_comment:    { icon: '💬', color: 'text-violet-500', border: 'border-l-violet-400' },
  overdue:         { icon: '⚠',  color: 'text-red-500',    border: 'border-l-red-400' },
  due_today:       { icon: '⏰', color: 'text-amber-500',  border: 'border-l-amber-400' },
  worklog_reminder:{ icon: '📝', color: 'text-blue-500',   border: 'border-l-blue-400' },
  cert_expiry:     { icon: '🔒', color: 'text-amber-500',  border: 'border-l-amber-400' },
}

export default function NotificationPanel({ onClose, onSelectTask }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 60000,
  })

  const items = data?.items || []
  const hasUnreadEvents = items.some(it => it.notif_id && !it.is_read)

  const readMut = useMutation({
    mutationFn: id => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const readAllMut = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const handleClick = (item) => {
    if (item.notif_id && !item.is_read) readMut.mutate(item.notif_id)
    if (item.type === 'worklog_reminder') { navigate('/worklog'); onClose() }
    else if (item.type === 'cert_expiry') { navigate('/cert-monitor'); onClose() }
    else if (item.task_id) { onSelectTask(item.task_id); onClose() }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-full top-0 ml-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">알림</span>
            {data?.count > 0 && (
              <span className="ml-2 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">{data.count}</span>
            )}
          </div>
          {hasUnreadEvents && (
            <button onClick={() => readAllMut.mutate()}
              className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              모두 읽음
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-10">
              <div className="text-3xl mb-2">🔔</div>
              새 알림이 없습니다
            </div>
          ) : (
            <div className="py-1">
              {items.map((item, i) => {
                const m = META[item.type] || META.due_today
                const unread = !item.notif_id || !item.is_read  // 계산형은 항상 강조
                return (
                  <button
                    key={item.notif_id ? `n${item.notif_id}` : `c${item.type}${item.id}${i}`}
                    onClick={() => handleClick(item)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 border-l-2 ${m.border} ${
                      unread ? '' : 'opacity-55'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`text-base flex-shrink-0 mt-0.5 ${m.color}`}>{m.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm truncate text-slate-800 dark:text-slate-100 ${unread ? 'font-semibold' : 'font-medium'}`}>{item.title}</div>
                        <div className={`text-xs mt-0.5 font-medium ${m.color}`}>{item.message}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {item.due_date ? dayjs(item.due_date).format('YYYY-MM-DD HH:mm') : ''}
                        </div>
                      </div>
                      {unread && item.notif_id && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
