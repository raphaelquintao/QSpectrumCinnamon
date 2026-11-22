import '@ci-types/cjs/cinnamon/globals.js';

declare global {
  interface Global {
    QDEBUG: boolean;
    ANIMATIONS: () => boolean;
    CURSOR_REACTIVE: () => boolean;
    ANIMATION_PRESET_VIEW: () => string;
    ANIMATION_SLIDER_HOVER: () => boolean;
    ANIMATION_DISPLAY_SUBMENU: () => boolean;
    SLIDER_ICONS: () => boolean;
    SLIDER_SCROLL: () => boolean;
  }
}

export {};
