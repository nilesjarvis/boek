# Matugen theme for Boek

Boek can load a generated Matugen palette without changing the GTK or Adwaita theme. The app watches the generated file and reloads it automatically.

## Setup

1. Install [Matugen](https://github.com/InioX/matugen).
2. Copy [`boek-theme.json`](./boek-theme.json) to your Matugen templates directory:

   ```bash
   mkdir -p ~/.config/matugen/templates
   cp boek-theme.json ~/.config/matugen/templates/boek-theme.json
   ```

3. Add this template to `~/.config/matugen/config.toml`:

   ```toml
   [templates.boek]
   input_path = '~/.config/matugen/templates/boek-theme.json'
   output_path = '~/.config/boek/matugen-theme.json'
   ```

4. Generate your normal Matugen palette. For example:

   ```bash
   matugen image /path/to/wallpaper.jpg --mode dark
   ```

5. In Boek, right-click the palette button and select **Matugen**.

No Matugen `post_hook` is required. Boek watches the output directory, including atomic file replacements, and updates the selected theme while running.

## Custom config location

Boek follows `XDG_CONFIG_HOME`, so the default generated file is:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/boek/matugen-theme.json
```

To use another location, launch Boek with an absolute file path:

```bash
BOEK_MATUGEN_THEME_FILE=/absolute/path/to/boek-theme.json ./Boek.AppImage
```

The generated file must contain all documented color roles and use `#RRGGBB` or `#RRGGBBAA` values. Invalid files are ignored, and Boek keeps running with its last valid or fallback theme.
