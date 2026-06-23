import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

export const useBoard = create((set) => ({
  // 보드 메타 정보
  boardId: null,
  boardName: 'Untitled Board',

  // 모든 오브젝트 (펜 그리기, 셰이프, 스티커 등)
  objects: [],

  // 현재 도구
  tool: 'pen', // 'pen', 'rectangle', 'circle', 'line', 'text', 'sticky'
  color: '#000000',
  brushSize: 3,

  // 선택된 오브젝트
  selectedId: null,

  // 초기화
  initBoard: (boardId, boardName) => set({
    boardId,
    boardName,
    objects: [],
    tool: 'pen',
    color: '#000000',
    selectedId: null
  }),

  // 도구 변경
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setBrushSize: (size) => set({ brushSize: size }),

  // 오브젝트 추가
  addObject: (obj) => set((state) => ({
    objects: [...state.objects, { id: uuid(), timestamp: Date.now(), ...obj }]
  })),

  // 오브젝트 업데이트
  updateObject: (id, updates) => set((state) => ({
    objects: state.objects.map(obj => obj.id === id ? { ...obj, ...updates } : obj)
  })),

  // 오브젝트 삭제
  deleteObject: (id) => set((state) => ({
    objects: state.objects.filter(obj => obj.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId
  })),

  // 여러 오브젝트 교체 (협업용)
  setObjects: (objects) => set({ objects }),

  // 선택
  selectObject: (id) => set({ selectedId: id }),
  deselect: () => set({ selectedId: null }),

  // 보드 이름 변경
  setBoardName: (name) => set({ boardName: name })
}))
