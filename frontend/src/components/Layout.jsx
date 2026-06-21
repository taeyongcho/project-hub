import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TaskDetailPanel from './TaskDetailPanel'

export default function Layout() {
  const [selectedTaskId, setSelectedTaskId] = useState(null)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar onSelectTask={setSelectedTaskId} />
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <Outlet context={{ onSelectTask: setSelectedTaskId }} />
      </main>
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  )
}
