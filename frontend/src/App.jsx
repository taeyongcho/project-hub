import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function Guard({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
