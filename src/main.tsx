import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './lib/auth.tsx';
import CyberOverlay from './components/CyberOverlay.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CyberOverlay />
      <App />
    </AuthProvider>
  </StrictMode>
);
