export interface WindowLaunchPreferences {
  fullscreen: boolean;
  kiosk: boolean;
  frame: boolean;
  autoHideMenuBar: boolean;
}

const FULLSCREEN_FLAGS = ['fullscreen', 'start-fullscreen'];
const WINDOWED_FLAGS = ['windowed', 'no-fullscreen'];
const FRAMELESS_FLAGS = ['frameless', 'no-frame'];
const KIOSK_FLAGS = ['kiosk'];

function normalizeFlagName(flagName: string) {
  return flagName.replace(/^--/, '').toLowerCase();
}

function getArgFlagName(arg: string) {
  const [switchName] = arg.split('=', 1);

  if (!switchName.startsWith('--')) {
    return null;
  }

  return normalizeFlagName(switchName);
}

export function hasLaunchFlag(argv: readonly string[], flagNames: readonly string[]) {
  const normalizedFlags = new Set(flagNames.map(normalizeFlagName));

  return argv.some((arg) => {
    const argFlagName = getArgFlagName(arg);
    return argFlagName !== null && normalizedFlags.has(argFlagName);
  });
}

export function resolveWindowLaunchPreferences(
  argv: readonly string[],
  fullscreenOnLaunch: boolean,
): WindowLaunchPreferences {
  const kiosk = hasLaunchFlag(argv, KIOSK_FLAGS);
  const windowed = hasLaunchFlag(argv, WINDOWED_FLAGS);
  const fullscreenRequested = hasLaunchFlag(argv, FULLSCREEN_FLAGS);
  const frameless = hasLaunchFlag(argv, FRAMELESS_FLAGS);

  return {
    fullscreen: !windowed && (kiosk || fullscreenRequested || fullscreenOnLaunch),
    kiosk,
    frame: !frameless,
    autoHideMenuBar: true,
  };
}
