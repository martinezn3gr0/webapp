import { Navigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

export default function ProtectedRoute({ children }) {
  const { session, loading, error } = useSession();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#5b6472' }}>
        Cargando…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#b3492f', padding: 24, textAlign: 'center' }}>
        {error}
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
