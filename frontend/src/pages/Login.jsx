import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import api from '../api/client'
import useAuth from '../store/auth'

export default function Login() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ mode: 'onBlur' })
  const { login } = useAuth()
  const navigate = useNavigate()

  async function onSubmit(data) {
    try {
      const form = new URLSearchParams()
      form.append('username', data.email)
      form.append('password', data.password)
      const { data: res } = await api.post('/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      login(res.user, res.access_token)
      toast.success('로그인 성공')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.detail || '이메일 또는 비밀번호가 올바르지 않습니다.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-xl font-bold">P</span>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">Project Hub</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">팀 업무 통합 관리 시스템</div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-card border border-slate-200 dark:border-slate-700 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">이메일</label>
            <input
              type="email"
              {...register('email', {
                required: '이메일은 필수입니다',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '올바른 이메일 형식을 입력하세요' }
              })}
              className={`w-full bg-white dark:bg-slate-800 border rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                errors.email ? 'border-red-300 dark:border-red-600 focus:ring-red-500' : 'border-slate-300 dark:border-slate-600 focus:ring-blue-500'
              }`}
              placeholder="admin@company.com"
            />
            {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">비밀번호</label>
            <input
              type="password"
              {...register('password', { required: '비밀번호는 필수입니다' })}
              className={`w-full bg-white dark:bg-slate-800 border rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                errors.password ? 'border-red-300 dark:border-red-600 focus:ring-red-500' : 'border-slate-300 dark:border-slate-600 focus:ring-blue-500'
              }`}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors shadow-sm"
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
