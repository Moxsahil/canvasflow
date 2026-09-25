/**
 * Who runs CanvasFlow and how to reach them, as the legal pages state it. The
 * pages quote these rather than spelling them out, so a change here lands on
 * every page at once.
 *
 * A value still reading `[CHECK: …]` is a fact only the owner can supply, and
 * the pages must not ship while one is left. `grep -rn "\[CHECK" apps/web/src`
 * lists every one, here and in the pages themselves.
 */
export const OPERATOR = {
  /**
   * The party the terms are an agreement with. CanvasFlow is run by one person,
   * not a registered company, so that is who users agree with.
   */
  name: 'Sahil Barak',
  /** The law the terms are read under. Contract law in India is national, so no state. */
  governingLaw: 'India',
  /** Where a dispute over the terms is heard: where the operator lives. */
  courts: 'Rohtak, Haryana',
} as const;

/**
 * The youngest anyone may be to use CanvasFlow, as both legal pages state it.
 *
 * Indian law counts anyone younger as a child, whose data needs a parent's
 * verified consent before an account exists, and signup has no step for that
 * yet. Lower this only once it does.
 */
export const MINIMUM_AGE = 18;

/**
 * Split by what the reader is after, so each sentence on a page can send them
 * to the address that fits it.
 */
export const CONTACT = {
  /** Help with an account, including someone else getting into it, or closing it. */
  support: 'support@canvasflowapp.com',
  /** These terms, and reports of anything on CanvasFlow that breaks them. */
  legal: 'legal@canvasflowapp.com',
  /** The privacy policy, requests about personal data, and privacy complaints. */
  privacy: 'privacy@canvasflowapp.com',
} as const;
