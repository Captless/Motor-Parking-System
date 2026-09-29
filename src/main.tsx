import React from 'react'; import ReactDOM from 'react-dom/client'; import { RouterProvider } from 'react-router-dom'; import '@fontsource-variable/jetbrains-mono'; import './index.css'; import { router } from './app/routes';
navigator.storage?.persist?.().catch(() => {});
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
