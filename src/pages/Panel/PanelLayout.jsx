import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import './PanelLayout.css';

export default function PanelLayout() {
  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="panel-layout">
      <header className="panel-header">
        <div className="panel-header__brand">
          <span className="panel-header__stub" />
          <div className="panel-header__brand-text">
            <span className="panel-header__title">PANEL</span>
            <span className="panel-header__subtitle">Instalaciones Eléctricas J-G</span>
          </div>
        </div>

        <nav className="panel-nav">
          <NavLink to="/panel/chats" className={({ isActive }) => (isActive ? 'active' : '')}>
            Chats
          </NavLink>
          <NavLink to="/panel/citas" className={({ isActive }) => (isActive ? 'active' : '')}>
            Citas
          </NavLink>
        </nav>

        <button className="panel-header__logout" onClick={handleLogout}>
          Salir
        </button>
      </header>

      <main className="panel-content">
        <Outlet />
      </main>
    </div>
  );
}
