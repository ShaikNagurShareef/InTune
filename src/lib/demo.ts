/** Demo accounts use this reserved domain; the app labels them and protects them from deletion. */
export const DEMO_DOMAIN = "@intune.demo";
export const isDemoEmail = (email: string): boolean => email.toLowerCase().endsWith(DEMO_DOMAIN);
