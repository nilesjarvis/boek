import { create } from 'zustand';
import type { Library } from '../services/api';

interface LibraryNavState {
  libraries: Library[];
  selectedLib: Library | null;
  setLibraries: (libs: Library[]) => void;
  setSelectedLib: (lib: Library | null) => void;
}

export const useLibraryNavStore = create<LibraryNavState>((set) => ({
  libraries: [],
  selectedLib: null,
  setLibraries: (libs) => set({ libraries: libs }),
  setSelectedLib: (lib) => set({ selectedLib: lib }),
}));
