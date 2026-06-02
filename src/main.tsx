import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AiProviderHubLauncher from './AiProviderHubLauncher';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
  <App />
  </React.StrictMode>,
);


const aiProviderHubRoot = document.createElement('div');
aiProviderHubRoot.id = 'ai-provider-hub-root';
document.body.appendChild(aiProviderHubRoot);
ReactDOM.createRoot(aiProviderHubRoot).render(
  <React.StrictMode>
    <AiProviderHubLauncher />
  </React.StrictMode>,
);
