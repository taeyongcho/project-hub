import { create } from 'zustand'

const useAuth = create(set => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,

  login: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('token', token)
    set({ user, token })
  },

  updateUser: (patch) => set(state => {
    const user = { ...state.user, ...patch }
    localStorage.setItem('user', JSON.stringify(user))
    return { user }
  }),

  logout: () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    set({ user: null, token: null })
  }
}))

export default useAuth
