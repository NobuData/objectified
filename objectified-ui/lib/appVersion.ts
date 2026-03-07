import packageJson from '../package.json';

/** Application version from package.json; single source of truth for displayed version. */
export const APP_VERSION = packageJson.version;
