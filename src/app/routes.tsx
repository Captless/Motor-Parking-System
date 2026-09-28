import { createHashRouter } from 'react-router-dom'; import App from './App';
import Operations from '../features/operations/Operations';
import History from '../features/history/History'; import Analytics from '../features/analytics/Analytics'; import Settings from '../features/settings/Settings';
export const router = createHashRouter([{ path: '/', element: <App />, children: [{ index: true, element: <Operations /> }, { path: 'history', element: <History /> }, { path: 'analytics', element: <Analytics /> }, { path: 'settings', element: <Settings /> }] }]);
