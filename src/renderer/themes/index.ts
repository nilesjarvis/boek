export interface Theme {
  name: string;
  colors: {
    bg: string;
    bgSecondary: string;
    bgTertiary: string;
    fg: string;
    fgSecondary: string;
    fgMuted: string;
    accent: string;
    accentHover: string;
    border: string;
    error: string;
    success: string;
  };
}

export const themes: Record<string, Theme> = {
  dark: {
    name: 'Dark',
    colors: {
      bg: '#121212',
      bgSecondary: '#1e1e1e',
      bgTertiary: '#2d2d2d',
      fg: '#e0e0e0',
      fgSecondary: '#b0b0b0',
      fgMuted: '#757575',
      accent: '#7c3aed',
      accentHover: '#8b5cf6',
      border: '#404040',
      error: '#ef4444',
      success: '#22c55e',
    },
  },
  light: {
    name: 'Light',
    colors: {
      bg: '#ffffff',
      bgSecondary: '#f5f5f5',
      bgTertiary: '#e5e5e5',
      fg: '#171717',
      fgSecondary: '#525252',
      fgMuted: '#a3a3a3',
      accent: '#7c3aed',
      accentHover: '#6d28d9',
      border: '#d4d4d4',
      error: '#dc2626',
      success: '#16a34a',
    },
  },
  catpuccin: {
    name: 'Catpuccin',
    colors: {
      bg: '#1e1e2e',
      bgSecondary: '#313244',
      bgTertiary: '#45475a',
      fg: '#cdd6f4',
      fgSecondary: '#a6adc8',
      fgMuted: '#6c7086',
      accent: '#cba6f7',
      accentHover: '#d8b4fe',
      border: '#585b70',
      error: '#f38ba8',
      success: '#a6e3a1',
    },
  },
  ink: {
    name: 'Ink/E-Reader',
    colors: {
      bg: '#f5f2e8',         // Bone/off-white background
      bgSecondary: '#ebe7db', // Slightly darker bone
      bgTertiary: '#e0dcc9',  // Even darker for depth
      fg: '#1a1a1a',         // Almost black for high contrast
      fgSecondary: '#2d2d2d', // Slightly lighter black
      fgMuted: '#565656',     // Muted but still high contrast
      accent: '#4a4a4a',      // Dark gray accent
      accentHover: '#333333', // Darker on hover
      border: '#c9c5b8',      // Subtle bone-colored border
      error: '#8b0000',       // Dark red for errors
      success: '#2d5016',     // Dark green for success
    },
  },
};

export type ThemeName = keyof typeof themes;
