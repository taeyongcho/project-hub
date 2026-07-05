import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import dayjs from 'dayjs'

export default function NotificationPanel({ onClose, onSelectTask }) {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 60000,
  })

  const items = data?.items || []

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-full top-0 ml-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">알림</span>
            {items.length > 0 && (
              <span className="ml-2 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-semibold">{items.length}</span>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-10">
              <div className="text-3xl mb-2">🔔</div>
              새 알림이 없습니다
            </div>
          ) : (
            <div className="py-1">
              {items.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (item.type === 'worklog_reminder') { navigate('/worklog'); onClose() }
                    else { onSelectTask(item.task_id); onClose() }
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-50 last:border-0 ${
                    item.type === 'overdue' ? 'border-l-2 border-l-red-400'
                      : item.type === 'worklog_reminder' ? 'border-l-2 border-l-blue-400'
                      : 'border-l-2 border-l-amber-400'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`text-base flex-shrink-0 mt-0.5 ${
                      item.type === 'overdue' ? 'text-red-500'
                        : item.type === 'worklog_reminder' ? 'text-blue-500' : 'text-amber-500'
                    }`}>
                      {item.type === 'overdue' ? '⚠' : item.type === 'worklog_reminder' ? '📝' : '⏰'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.title}</div>
                      <div className={`text-xs mt-0.5 font-semibold ${
                        item.type === 'overdue' ? 'text-red-500'
                          : item.type === 'worklog_reminder' ? 'text-blue-500' : 'text-amber-500'
                      }`}>{item.message}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{dayjs(item.due_date).format('YYYY-MM-DD')}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
