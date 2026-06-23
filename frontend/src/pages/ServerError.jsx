import { useNavigate } from 'react-router-dom'

export default function ServerError() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-6xl font-bold text-red-600 dark:text-red-400 mb-4">500</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">서버 오류</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            뒤로 가기
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            대시보드로
          </button>
        </div>
      </div>
    </div>
  )
}
