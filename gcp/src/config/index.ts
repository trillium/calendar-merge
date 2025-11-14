/**
 * Configuration exports
 * Centralized export for all configuration modules
 */

export { APP_CONFIG, validateAppConfig } from './app.config';
export { DB_CONFIG, getCollectionPath } from './database.config';
export { GOOGLE_CONFIG, validateGoogleConfig } from './google.config';

/**
 * Validate all configurations
 */
import { validateAppConfig } from './app.config';
import { validateGoogleConfig } from './google.config';

export function validateAllConfig(): void {
  validateAppConfig();
  validateGoogleConfig();
}
