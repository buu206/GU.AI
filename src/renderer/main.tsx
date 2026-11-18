import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/press-start-2p/latin-400.css';
import '@vp-tw/cjk-web-fonts-fusion-pixel-font/dist/12px/proportional/zh_hans/Fusion-Pixel-12px-Proportional-Simplified-Chinese.css';
import { App } from './App';
import { ConfirmationProvider } from './components/Confirmation';
import './styles.css';
import './desktop/desktop.css';
import './creationFlow.css';
import './cyberArt.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmationProvider><App /></ConfirmationProvider>
  </StrictMode>,
);

import './desktop/productionDesktop.css';

import './desktop/pixelOverlays.css';
