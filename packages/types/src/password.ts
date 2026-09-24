/**
 * The rules for choosing a password, as every form shows them.
 *
 * One list, so the web app's signup and reset forms and the editor's
 * change-password form cannot say three different things. The API gateway is
 * still the authority (services/api-gateway/src/modules/auth/password-policy.ts);
 * this list exists to make meeting it easy, and has to stay in step with it.
 */
export const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'A capital letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A number', test: (v) => /[0-9]/.test(v) },
  { label: 'A special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/**
 * The gateway's ceiling. Enforced by the input itself rather than listed as a
 * rule: nobody chooses a 65-character password by accident, and a checklist
 * line that is always met would only be noise.
 */
export const PASSWORD_MAX_LENGTH = 64;

export function meetsPasswordRules(password: string): boolean {
  return password.length <= PASSWORD_MAX_LENGTH && PASSWORD_RULES.every((r) => r.test(password));
}
