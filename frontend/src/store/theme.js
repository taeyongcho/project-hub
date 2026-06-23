import { create } from 'zustand'

export const useTheme = create((set) => {
  const isDark = localStorage.getItem('theme') === 'dark'
  if (isDark) document.documentElement.classList.add('dark')

  return {
    isDark,
    toggle: () => set((state) => {
      const newIsDark = !state.isDark
      localStorage.setItem('theme', newIsDark ? 'dark' : 'light')
      newIsDark ? document.documentElement.classList.add('dark') : document.documentElement.classList.remove('dark')
      return { isDark: newIsDark }
    })
  }
})
