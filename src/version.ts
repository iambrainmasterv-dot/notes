const v = import.meta.env.VITE_APP_VERSION;

/** App version from package.json (injected at build time). */
export const APP_VERSION =
  typeof v === 'string' && v.length > 0 ? v : '0.0.0';
