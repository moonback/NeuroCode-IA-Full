import { useState, useCallback } from 'react';

export function useCharacterCount(initialValue: string) {
  const [count, setCount] = useState(initialValue.length);
  
  const updateCount = useCallback((value: string) => {
    setCount(value.length);
  }, []);

  return [count, updateCount] as const;
} 