import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import useAuth from './store/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Emails from './pages/Emails'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Tasks from './pages/Tasks'
import WorkLog from './pages/WorkLog'
import Reports from './pages/Reports'
import Users from './pages/Users'
import EmailSettings from './pages/EmailSettings'
import Whiteboard from './pages/Whiteboard'
import Whiteboards from './pages/Whiteboards'
import NotFound from './pages/NotFound'
import ServerError from './pages/ServerError'

function Guard({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" expand={false} richColors />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/500" element={<ServerError />} />
        <Route path="/" element={<Guard><Layout /></Guard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="emails" element={<Emails />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="worklog" element={<WorkLog />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
          <Route path="email-settings" element={<EmailSettings />} />
          <Route path="whiteboards" element={<Whiteboards />} />
          <Route path="whiteboard/:boardId" element={<Whiteboard />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
