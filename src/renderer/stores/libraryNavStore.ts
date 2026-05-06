import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Library } from '../services/api';

interface LibraryNavState {
  libraries: Library[];
  selectedLib: Library | null;
  selectedLibraryId: string | null;
  setLibraries: (libs: Library[]) => void;
  setSelectedLib: (lib: Library | null) => void;
}

export const useLibraryNavStore = create<LibraryNavState>()(
  persist(
    (set, get) => ({
      libraries: [],
      selectedLib: null,
      selectedLibraryId: null,

      setLibraries: (libs) => {
        const selectedLibraryId = get().selectedLibraryId;
        const selectedLib = libs.find((lib) => lib.id === selectedLibraryId) ?? libs[0] ?? null;

        set({
          libraries: libs,
          selectedLib,
          selectedLibraryId: selectedLib?.id ?? null,
        });
      },

      setSelectedLib: (lib) => set({
        selectedLib: lib,
        selectedLibraryId: lib?.id ?? null,
      }),
    }),
    {
      name: 'library-nav',
      partialize: (state) => ({
        selectedLibraryId: state.selectedLibraryId,
      }),
    },
  ),
);
