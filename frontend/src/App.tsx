import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider, RequireAuth } from './auth/AuthProvider'
import { Toaster } from './components/Toaster'
import { AppLayout } from './layouts/AppLayout'
import { PublicLayout } from './layouts/PublicLayout'
import { NotFound } from './pages/NotFound'
import { Alerts } from './pages/app/Alerts'
import { Dashboard } from './pages/app/Dashboard'
import { MapPage } from './pages/app/MapPage'
import { PatientDetail } from './pages/app/PatientDetail'
import { Patients } from './pages/app/Patients'
import { Settings } from './pages/app/Settings'
import { About } from './pages/public/About'
import { Home } from './pages/public/Home'
import { Login } from './pages/public/Login'
import { Register } from './pages/public/Register'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="about" element={<About />} />
            </Route>
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />

            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="patients" element={<Patients />} />
              <Route path="patients/:patientId" element={<PatientDetail />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="map" element={<MapPage />} />
              <Route path="settings" element={<Settings />} />
              <Route path="pair" element={<Dashboard />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Toaster>
      </AuthProvider>
    </BrowserRouter>
  )
}
