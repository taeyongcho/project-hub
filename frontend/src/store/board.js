import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

const MAX_HISTORY = 50

export const useBoard = create((set, get) => ({
  boardId: null,
  boardName: 'Untitled Board',
  objects: [],
  tool: 'select',
  color: '#000000',
  brushSize: 3,
  selectedId: null,

  // 히스토리 스택
  past: [],
  future: [],

  initBoard: (boardId, boardName) => set({
    boardId, boardName, objects: [], tool: 'select',
    color: '#000000', selectedId: null, past: [], future: []
  }),

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setBrushSize: (size) => set({ brushSize: size }),

  // 현재 상태를 히스토리에 저장 (변경 직전 호출)
  snapshot: () => set((state) => ({
    past: [...state.past.slice(-MAX_HISTORY + 1), state.objects],
    future: []
  })),

  undo: () => set((state) => {
    if (state.past.length === 0) return {}
    const previous = state.past[state.past.length - 1]
    return {
      objects: previous,
      past: state.past.slice(0, -1),
      future: [state.objects, ...state.future],
      selectedId: null
    }
  }),

  redo: () => set((state) => {
    if (state.future.length === 0) return {}
    const next = state.future[0]
    return {
      objects: next,
      past: [...state.past, state.objects],
      future: state.future.slice(1),
      selectedId: null
    }
  }),

  addObject: (obj) => set((state) => ({
    objects: [...state.objects, { id: obj.id || uuid(), timestamp: Date.now(), ...obj }]
  })),

  updateObject: (id, updates) => set((state) => ({
    objects: state.objects.map(obj => obj.id === id ? { ...obj, ...updates } : obj)
  })),

  deleteObject: (id) => set((state) => ({
    objects: state.objects.filter(obj => obj.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId
  })),

  // 선택된 오브젝트 복제
  duplicateObject: (id) => {
    const state = get()
    const obj = state.objects.find(o => o.id === id)
    if (!obj) return null
    const newId = uuid()
    const clone = { ...obj, id: newId, timestamp: Date.now() }
    // 위치를 살짝 이동
    if (clone.x != null) clone.x += 20
    if (clone.y != null) clone.y += 20
    if (clone.points) clone.points = clone.points.map((p, i) => p + 20)
    set({
      past: [...state.past.slice(-MAX_HISTORY + 1), state.objects],
      future: [],
      objects: [...state.objects, clone],
      selectedId: newId
    })
    return newId
  },

  // 레이어 순서
  bringToFront: (id) => set((state) => {
    const obj = state.objects.find(o => o.id === id)
    if (!obj) return {}
    return { objects: [...state.objects.filter(o => o.id !== id), obj] }
  }),
  sendToBack: (id) => set((state) => {
    const obj = state.objects.find(o => o.id === id)
    if (!obj) return {}
    return { objects: [obj, ...state.objects.filter(o => o.id !== id)] }
  }),
  bringForward: (id) => set((state) => {
    const idx = state.objects.findIndex(o => o.id === id)
    if (idx < 0 || idx === state.objects.length - 1) return {}
    const arr = [...state.objects]
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    return { objects: arr }
  }),
  sendBackward: (id) => set((state) => {
    const idx = state.objects.findIndex(o => o.id === id)
    if (idx <= 0) return {}
    const arr = [...state.objects]
    ;[arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]
    return { objects: arr }
  }),

  setObjects: (objects) => set({ objects }),
  selectObject: (id) => set({ selectedId: id }),
  deselect: () => set({ selectedId: null }),
  setBoardName: (name) => set({ boardName: name })
}))
