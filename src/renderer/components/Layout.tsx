import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../themes/ThemeProvider';
import Search from './Search';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  const { themeName, setTheme } = useTheme();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleThemeToggle = () => {
    // Cycle through themes
    const themes = ['dark', 'light', 'catpuccin', 'ink'] as const;
    const currentIndex = themes.indexOf(themeName as any);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);  
  };

  const getThemeIcon = () => {
    switch (themeName) {
      case 'light':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        );
      case 'dark':
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        );
      case 'catpuccin':
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9c.83 0 1.5-.67 1.5-1.5S7.83 8 7 8s-1.5.67-1.5 1.5S6.17 11 7 11zm10 0c.83 0 1.5-.67 1.5-1.5S17.83 8 17 8s-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm-5 6c2.28 0 4.22-1.66 5-4H7c.78 2.34 2.72 4 5 4z"/>
          </svg>
        );
      case 'ink':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
            <line x1="9" y1="7" x2="15" y2="7"></line>
            <line x1="9" y1="11" x2="15" y2="11"></line>
            <line x1="9" y1="15" x2="12" y2="15"></line>
          </svg>
        );
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="header-left">
          <h1 className="app-title" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Boek</h1>
          <nav className="header-nav">
            <button
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
              onClick={() => navigate('/')}
            >
              Library
            </button>
            <button
              className={`nav-link ${location.pathname === '/stats' ? 'active' : ''}`}
              onClick={() => navigate('/stats')}
            >
              Stats
            </button>
          </nav>
        </div>
        
        <div className="header-right">
          <Search />
          
          <button 
            className="icon-button theme-button"
            onClick={handleThemeToggle}
            title={`Current theme: ${themeName}`}
          >
            {getThemeIcon()}
          </button>
          
          <button 
            className="icon-button logout-button"
            onClick={handleLogout}
            title="Logout"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </header>

      <main className="main-content">{children}</main>
    </div>
  );
}