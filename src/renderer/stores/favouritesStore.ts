import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavouritesState {
  favouriteIds: string[];
  isFavourite: (id: string) => boolean;
  toggleFavourite: (id: string) => void;
  addFavourite: (id: string) => void;
  removeFavourite: (id: string) => void;
}

export const useFavouritesStore = create<FavouritesState>()(
  persist(
    (set, get) => ({
      favouriteIds: [],

      isFavourite: (id: string) => get().favouriteIds.includes(id),

      toggleFavourite: (id: string) => {
        const { favouriteIds } = get();
        if (favouriteIds.includes(id)) {
          set({ favouriteIds: favouriteIds.filter(fid => fid !== id) });
        } else {
          set({ favouriteIds: [...favouriteIds, id] });
        }
      },

      addFavourite: (id: string) => {
        const { favouriteIds } = get();
        if (!favouriteIds.includes(id)) {
          set({ favouriteIds: [...favouriteIds, id] });
        }
      },

      removeFavourite: (id: string) => {
        set({ favouriteIds: get().favouriteIds.filter(fid => fid !== id) });
      },
    }),
    {
      name: 'favourites',
    }
  )
);
