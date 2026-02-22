# Coding Agent Guidelines for Audiobookshelf Player

## Quick Reference

### Build Commands
```bash
npm install              # Install dependencies
npm run dev              # Start dev mode (Vite + electron)
npm run dev:renderer # Renderer only (port 5173)
npm run dev:main       # Main process only
npm run build           # Build for production
npm run package       # Create Linux packages (AppImage, deb)
```

### Testing (Not Yet Implemented)
```bash
# Recommended setup when adding tests:
npm install -D vitest @testing-library/react @testing-library/jest-dom
npm run test            # vitest run
npm run test:watch    # vitest watch
npm run test -- file.test.ts # Run single test file
```

## Project Structure
```
src/
├── main/           # Electron main process
│   ├── index.ts    # Entry point, IPC handlers
│   └── preload. ts # Preload script for renderer bridge
└── renderer/     # React app (Vite)
    ├── components/ # Reusable UI components
    ├── pages/       # Route components
    ├── services/  # API clients, websocket
    ├── stores/     # Zustand state management
    └── themes/     # Theme configuration
```

## TypeScript Configuration
- **Strict mode**: All strict checks enabled
- **No Unused Code**: noUnusedLocals/Parameters = true
- **Path Alias**: `@/*` → `src/renderer/*`
- **Target**: ES2020, ESNext modules

## Code Style

### Imports
```typescript
// 1. React/external libs first
import { useEffect, useState } from 'react';
import axios from 'axios';

// 2. Internal with @ alias
import { useAuthStore } from '@/stores/authStore';
import { absApi } from '@/services/api';

// 3. Styles last
import './Component.css';
```

#### Naming Conventions
- **Files**: PascalCase for components (Player.tsx), camelCase for utils (api.ts)
- **Components**: PascalCase function names
- **Hooks**: usePrefix (useAuthStore, useEpisodeProgress)
- **Interfaces**: PascalCase (interface Library, ABSUser)
- **Constants**: UPPER_SNAKE_CASE for true constants only

### Component Structure
```typescript
export default function ComponentName() {
  // 1. Refs and state hooks first
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // 2. Store hooks
  const { user } = useAuthStore();
  
  // 3. Callbacks with useCallback
  const handleClick = useCallback(() => {}, [deps]);
  
  // 4. Effects
  useEffect(() => {
    return () => { /* cleanup */ };
  }, [deps]);
  
  // 5. Early returns
  if (!data) return null;
  
  // 6. Render
  return <div>...</div>;
}
```

### Error Handling
```typescript
try {
  const result = await absApi.getLibraries();
  // Success handling
} catch (err) {
  console.error('[ComponentName] Operation failed:', err);
  setError(err instanceof Error ? err.message : 'Operation failed');
}
```

### State Management (Zustand)
```typescript
// stores use object syntax
export const usePlayerStore = create<PlayerState>((set, get) => ({
  // State  
  isPlaying: false,
  currentTime: 0,
  
  // Individual setters preferred
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (time) => set({ currentTime: time }),
  
  // Complex updates
  loadTrack: async (item) => {
    set({ isLoading: true, error: null });
    try {
      // Logic here
    } catch (err) {
      set({ error: err.message, isLoading: false });
    }
  }
}));
```

### API Integration
- Use centralized `ABSApi` class in services/api.ts
- All responses should have TypeScript interfaces
- Bearer token auth via Authorization header
- Handle 401/403 for auth failures

### Electron IPC
```typescript
// Main process (src/main/index.ts)
ipcMain.handle('get-data', async (event, param) => {
  // Validate inputs
  return processedData;
});

// renderer (via window.api from preload)
const result = await window.api.invoke('get-data', param);
```

### CSS conventions
- Component.css files colocated  
- BEM-style naming: `.player`, `.player-controls`, `.player-controls--active`
- CSS variables for theming: `var(--primary-color)`

## Key Patterns

### Audio Player
- State in playerStore (Zustand)
- HLS support via hls.js
- Progress sync every 10s during playback
- Session tracking for resume playback

### WebSocket
- socket.io-client for live updates
- Reconnection handling built-in
Auto-auth on connect

## Performance Tips
- Use useCallback/useMemo for expensive operations
- Virtual scrolling for long lists (if needed)
- lazy load route components
- Cleanup intervals/listeners in useEffect

## Development
- Vite HMR for instant updates
- Electron DevTools auto-opens
- Console.log for main process debugging
- TypeScript strict Mode catches most issues

## Linux Focus
- Packages: AppImage (universal), .deb (Ubuntu/Debian)
- Minimal dependencies
- Offline-first considerations