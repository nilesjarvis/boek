import { describe, expect, it } from 'vitest';
import { hasLaunchFlag, resolveWindowLaunchPreferences } from '../src/main/windowPreferences';

describe('window launch preferences', () => {
  it('keeps the standard framed window when no preference or flag is present', () => {
    expect(resolveWindowLaunchPreferences(['boek'], false)).toEqual({
      fullscreen: false,
      kiosk: false,
      frame: true,
      autoHideMenuBar: true,
    });
  });

  it('restores a saved fullscreen preference', () => {
    expect(resolveWindowLaunchPreferences(['boek'], true)).toMatchObject({
      fullscreen: true,
      frame: true,
    });
  });

  it('starts fullscreen from either fullscreen launch flag', () => {
    expect(resolveWindowLaunchPreferences(['boek', '--fullscreen'], false).fullscreen).toBe(true);
    expect(resolveWindowLaunchPreferences(['boek', '--start-fullscreen'], false).fullscreen).toBe(true);
  });

  it('lets windowed flags override saved or requested fullscreen for one launch', () => {
    expect(resolveWindowLaunchPreferences(['boek', '--windowed'], true).fullscreen).toBe(false);
    expect(resolveWindowLaunchPreferences(['boek', '--fullscreen', '--no-fullscreen'], true).fullscreen).toBe(
      false,
    );
  });

  it('supports frameless launch flags without forcing fullscreen', () => {
    expect(resolveWindowLaunchPreferences(['boek', '--frameless'], false)).toMatchObject({
      fullscreen: false,
      frame: false,
    });
    expect(resolveWindowLaunchPreferences(['boek', '--no-frame'], false).frame).toBe(false);
  });

  it('starts kiosk mode as fullscreen', () => {
    expect(resolveWindowLaunchPreferences(['boek', '--kiosk'], false)).toMatchObject({
      fullscreen: true,
      kiosk: true,
    });
  });

  it('detects flags with values and ignores non-switch arguments', () => {
    expect(hasLaunchFlag(['boek', 'book-id', '--fullscreen=true'], ['fullscreen'])).toBe(true);
    expect(hasLaunchFlag(['boek', 'fullscreen'], ['fullscreen'])).toBe(false);
  });
});
