import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'

export function SkeletonTaskCard() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <Skeleton width="60%" height={20} className="mb-2" />
          <Skeleton width="40%" height={16} />
        </div>
        <Skeleton width={80} height={24} />
      </div>
    </div>
  )
}

export function SkeletonProjectCard() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <Skeleton width="70%" height={24} className="mb-2" />
          <Skeleton width="100%" height={16} />
        </div>
        <Skeleton width={100} height={28} />
      </div>
      <div className="flex gap-2">
        <Skeleton width={60} height={20} />
        <Skeleton width={60} height={20} />
      </div>
    </div>
  )
}

export function SkeletonUserCard() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <Skeleton circle width={40} height={40} />
        <div className="flex-1">
          <Skeleton width="50%" height={18} className="mb-2" />
          <Skeleton width="70%" height={14} />
        </div>
      </div>
    </div>
  )
}
