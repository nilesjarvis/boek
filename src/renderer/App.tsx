import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './themes/ThemeProvider';
import { useAuthStore } from './stores/authStore';
import { websocketService } from './services/websocket';
import { absApi } from './services/api';
import Layout from './components/Layout';
import Player from './components/Player';
import Login from './pages/Login';
import Library from './pages/Library';

const Stats = lazy(() => import('./pages/Stats'));

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  const { isAuthenticated, serverUrl, user } = useAuthStore();
  
  useEffect(() => {
    // Initialize API if we have stored credentials
    if (isAuthenticated && serverUrl && user?.token) {
      absApi.init(serverUrl, user.token);
    }
  }, []); // Run once on mount
  
  useEffect(() => {
    if (isAuthenticated) {
      websocketService.connect();
    } else {
      websocketService.disconnect();
    }
    
    return () => {
      // Cleanup on unmount
      websocketService.disconnect();
    };
  }, [isAuthenticated]);

  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout>
                  <Library />
                </Layout>
                <Player />
              </PrivateRoute>
            }
          />
          <Route
            path="/stats"
            element={
              <PrivateRoute>
                <Layout>
                  <Suspense fallback={<div className="loading">Loading...</div>}>
                    <Stats />
                  </Suspense>
                </Layout>
                <Player />
              </PrivateRoute>
            }
          />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
