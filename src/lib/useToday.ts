import { useEffect, useState } from 'react';
import { startOfDay } from './dates';

export function useToday(pollMs = 30000): number {
  const [today, setToday] = useState(() => startOfDay(Date.now()));
  useEffect(() => {
    const check = () => setToday(prev => { const cur = startOfDay(Date.now()); return cur === prev ? prev : cur; });
    const t = setInterval(check, pollMs);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, [pollMs]);
  return today;
}
