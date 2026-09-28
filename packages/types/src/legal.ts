/**
 * The Terms of Service in force, named by the day they were last updated.
 *
 * One value for every place that needs it: the terms page prints it as its
 * "Last updated" date, each way into CanvasFlow sends it as the version the
 * reader was shown, and the API records it against an account only while it
 * still matches this. Move it whenever the text of the terms changes.
 */
export const TERMS_VERSION = '2026-09-25';

/**
 * Where someone writes for help with their account — including to stop a
 * deletion inside its grace period. The legal pages, the editor and the mail
 * the API sends all name it, so it is spelled out once, here.
 */
export const SUPPORT_EMAIL = 'support@canvasflowapp.com';

/**
 * How long a request to delete an account waits before the data is erased —
 * the time somebody has to change their mind by writing to support. The terms
 * promise erasure within 30 days, and the purge runs daily, so this must stay
 * well inside that. The database schedules by it and the editor says it.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 7;
