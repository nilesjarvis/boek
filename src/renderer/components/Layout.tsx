import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../themes/ThemeProvider';
import { themes, ThemeName } from '../themes/index';
import Search from './Search';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

const themeNames = Object.keys(themes) as ThemeName[];

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  const { themeName, setTheme } = useTheme();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const themePickerRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleThemeToggle = () => {
    const currentIndex = themeNames.indexOf(themeName);
    const nextIndex = (currentIndex + 1) % themeNames.length;
    setTheme(themeNames[nextIndex]);
  };

  const handleThemeContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowThemePicker(prev => !prev);
  };

  // Close theme picker on outside click
  useEffect(() => {
    if (!showThemePicker) return;
    const handleClick = (e: MouseEvent) => {
      if (themePickerRef.current && !themePickerRef.current.contains(e.target as Node)) {
        setShowThemePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showThemePicker]);

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
          
          <div className="theme-button-wrapper" ref={themePickerRef}>
            <button 
              className="icon-button theme-button"
              onClick={handleThemeToggle}
              onContextMenu={handleThemeContextMenu}
              title={`Theme: ${themes[themeName].name} (right-click for list)`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
              </svg>
            </button>
            {showThemePicker && (
              <div className="theme-picker">
                {themeNames.map(key => (
                  <button
                    key={key}
                    className={`theme-picker-option ${key === themeName ? 'active' : ''}`}
                    onClick={() => {
                      setTheme(key);
                      setShowThemePicker(false);
                    }}
                  >
                    <span
                      className="theme-picker-swatch"
                      style={{
                        background: `linear-gradient(135deg, ${themes[key].colors.bg} 50%, ${themes[key].colors.accent} 50%)`,
                      }}
                    />
                    <span className="theme-picker-name">{themes[key].name}</span>
                    {key === themeName && (
                      <svg className="theme-picker-check" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          
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