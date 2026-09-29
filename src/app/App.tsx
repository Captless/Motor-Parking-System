import { NavLink, Outlet } from 'react-router-dom'; import { ToastProvider } from './toast';
export default function App() {
  return (<ToastProvider><div className="mx-auto min-h-screen flex flex-col max-w-md lg:max-w-3xl">
    <main className="flex-1 p-4 pb-20 lg:p-8 lg:pb-24"><Outlet /></main>
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 mx-auto flex max-w-md lg:max-w-3xl">
      <NavLink to="/" end className={({isActive})=>`nav-link${isActive?' active':''}`}>Operations</NavLink>
      <NavLink to="/history" className={({isActive})=>`nav-link${isActive?' active':''}`}>History</NavLink>
      <NavLink to="/analytics" className={({isActive})=>`nav-link${isActive?' active':''}`}>Analytics</NavLink>
      <NavLink to="/settings" className={({isActive})=>`nav-link${isActive?' active':''}`}>Settings</NavLink>
    </nav></div></ToastProvider>);
}
