import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import PanelLayout from './pages/Panel/PanelLayout';
import Chats from './pages/Panel/Chats';
import Citas from './pages/Panel/Citas';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      {/* Público */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Protegido — solo agentes autenticados */}
      <Route
        path="/panel"
        element={
          <ProtectedRoute>
            <PanelLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="chats" replace />} />
        <Route path="chats" element={<Chats />} />
        <Route path="citas" element={<Citas />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
