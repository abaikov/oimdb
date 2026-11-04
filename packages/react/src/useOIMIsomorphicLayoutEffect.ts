import { useEffect, useLayoutEffect } from 'react';

export const useOIMIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
