import React from 'react'; import ReactDOM from 'react-dom/client'; import { RouterProvider } from 'react-router-dom'; import './index.css'; import { router } from './app/routes'; import { ensureSeed } from './db/database';
navigator.storage?.persist?.().catch(() => {});
ensureSeed().catch(() => {});
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
