import { create } from 'zustand'

// 앱 전역 접속(온라인) 사용자 목록
const usePresence = create(set => ({
  online: [],
  setOnline: (ids) => set({ online: ids || [] }),
}))

export default usePresence
