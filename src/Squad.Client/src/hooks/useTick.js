import { useEffect, useState } from 'react';

// Global 1-second counter, equivalent to the prototype's
// componentDidMount setInterval(() => t++ , 1000).
export function useTick() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setT((v) => v + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  return t;
}
