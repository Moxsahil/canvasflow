/**
 * The line that turns the terms from a page someone could have found into
 * something they agreed to. It sits wherever continuing creates an account or
 * a guest identity — signing in with Google or GitHub creates one for anybody
 * new, so the sign-in page carries it too.
 *
 * The link opens a new tab, so a half-filled form is still there when the
 * reader comes back to it.
 */
export function TermsAgreement({
  className,
  linkClassName,
}: {
  className?: string;
  linkClassName?: string;
}) {
  return (
    <p className={className}>
      By continuing, you agree to our{' '}
      <a href="/terms" target="_blank" rel="noopener noreferrer" className={linkClassName}>
        Terms of Service<span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </p>
  );
}
