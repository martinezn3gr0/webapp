import { Navigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

export default function ProtectedRoute({ children }) {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#5b6472' }}>
        Cargando…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
