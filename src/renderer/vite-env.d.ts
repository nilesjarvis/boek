/// <reference types="vite/client" />

import type { Theme } from './themes';

export {};

interface MatugenThemeLoadResult {
  available: boolean;
  path: string;
  theme?: Theme;
  error?: string;
}

declare global {
  interface Window {
    electronAPI: {
      getMatugenTheme: () => Promise<MatugenThemeLoadResult>;
      onMatugenThemeUpdated: (
        callback: (result: MatugenThemeLoadResult) => void,
      ) => () => void;
      openExternal: (url: string) => Promise<void>;
      platform: string;
    };
  }
}
