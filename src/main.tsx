import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BladeProvider } from '@razorpay/blade/components';
import { bladeTheme } from '@razorpay/blade/tokens';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BladeProvider themeTokens={bladeTheme}>
      <App />
    </BladeProvider>
  </StrictMode>,
);
