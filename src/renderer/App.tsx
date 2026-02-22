import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './themes/ThemeProvider';
import { useAuthStore } from './stores/authStore';
import { websocketService } from './services/websocket';
import { absApi } from './services/api';
import Layout from './components/Layout';
import Player from './components/Player';
import Login from './pages/Login';
import Library from './pages/Library';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  const { isAuthenticated, serverUrl, user } = useAuthStore();
  
  useEffect(() => {
    console.log('App: Initial mount - auth status:', { 
      isAuthenticated, 
      serverUrl, 
      hasUser: !!user,
      hasToken: !!user?.token 
    });
    
    // Initialize API if we have stored credentials
    if (isAuthenticated && serverUrl && user?.token) {
      console.log('App: Initializing API with stored credentials...');
      absApi.init(serverUrl, user.token);
    }
  }, []); // Run once on mount
  
  useEffect(() => {
    console.log('App: Authentication status changed:', isAuthenticated);
    
    if (isAuthenticated) {
      console.log('App: Connecting WebSocket...');
      websocketService.connect();
    } else {
      console.log('App: Disconnecting WebSocket...');
      websocketService.disconnect();
    }
    
    return () => {
      // Cleanup on unmount
      websocketService.disconnect();
    };
  }, [isAuthenticated]);

  return (
    <ThemeProvider>
      <BrowserRouter>
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
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
