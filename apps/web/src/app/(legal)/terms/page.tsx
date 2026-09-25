import type { Metadata } from 'next';
import { TERMS_VERSION } from '@canvasflow/types';
import { LegalDocument, type LegalSection } from '@/components/legal/legal-document';
import { CONTACT, OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service — CanvasFlow',
  description: 'The rules for using CanvasFlow, in plain language.',
};

// "Last updated" is TERMS_VERSION, the version every agreement is recorded
// against. Whenever the text below changes, move it — in @canvasflow/types.

/**
 * Indian law counts anyone younger as a child, whose data needs a parent's
 * verified consent before an account exists, and signup has no step for that
 * yet. Lower this only once it does.
 */
const MINIMUM_AGE = 18;

const supportEmail = <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>;
const legalEmail = <a href={`mailto:${CONTACT.legal}`}>{CONTACT.legal}</a>;

/**
 * Every claim here is one the product keeps today: share links carry a role
 * and a guest switch and can be turned off, boards save to a file and export
 * as PNG or SVG, and nothing can be bought. Change the product, change this.
 */
const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          CanvasFlow is a collaborative whiteboard. You sketch on an infinite canvas, and edit the
          same board with other people in real time.
        </p>
        <p>
          It is run by {OPERATOR.name}. In these terms, “we”, “us” and “our” mean {OPERATOR.name}.
          For help with CanvasFlow, email {supportEmail}. For questions about these terms, email{' '}
          {legalEmail}.
        </p>
      </>
    ),
  },
  {
    id: 'who-can-use-canvasflow',
    title: 'Who can use CanvasFlow',
    body: (
      <>
        <p>You must be at least {MINIMUM_AGE} years old to use CanvasFlow.</p>
        <p>
          If you use CanvasFlow for a company or another organization, you confirm that you’re
          allowed to accept these terms on its behalf. In that case, “you” means the organization
          too.
        </p>
      </>
    ),
  },
  {
    id: 'your-account',
    title: 'Your account',
    body: (
      <>
        <p>
          You need an account to create boards and workspaces. You can sign up with an email address
          and password, or with Google or GitHub. If you use Google or GitHub, their terms also
          apply to that account.
        </p>
        <ul>
          <li>
            Give us accurate details, including an email address you can get to. We use it for
            things like verifying your account and resetting your password.
          </li>
          <li>Keep your password safe. You’re responsible for what happens under your account.</li>
          <li>An account is for one person. Don’t share your sign-in.</li>
          <li>
            If you think someone else has got into your account, change your password and tell us at{' '}
            {supportEmail} straight away.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'sharing-and-guests',
    title: 'Sharing and guests',
    body: (
      <>
        <p>
          You choose who sees your boards. You can invite people to a board, or create a share link.
          A share link gives anyone who has it the access you picked: viewer or editor. If you allow
          guests on the link, people can use it without an account.
        </p>
        <ul>
          <li>Treat a share link like a key. Only send it to people you want on the board.</li>
          <li>You can turn a link off, or remove someone from a board, at any time.</li>
          <li>You’re responsible for who you share your boards with.</li>
          <li>Everyone you share with, guests included, must follow these terms too.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>Don’t use CanvasFlow to:</p>
        <ul>
          <li>break the law, or help anyone else break it;</li>
          <li>
            upload anything you don’t have the right to share, or that infringes someone’s
            copyright, trademark or other rights;
          </li>
          <li>
            post anything that sexually exploits children, is obscene, or harasses, threatens or
            promotes hatred or violence against anyone;
          </li>
          <li>share someone’s private information without their permission;</li>
          <li>pretend to be someone else, or knowingly spread false information;</li>
          <li>upload malware, or anything else built to harm devices or data;</li>
          <li>
            get into accounts, boards or systems you haven’t been given access to, or get around our
            security or limits;
          </li>
          <li>
            overload or disrupt CanvasFlow, for example with spam, scraping or automated traffic;
          </li>
          <li>copy, resell or reverse-engineer CanvasFlow, except where the law allows it.</li>
        </ul>
        <p>
          If you break these rules, we may remove content or close accounts. See{' '}
          <a href="#closing-your-account">Closing your account</a>.
        </p>
      </>
    ),
  },
  {
    id: 'your-content',
    title: 'Your content',
    body: (
      <>
        <p>
          What you make on CanvasFlow is yours: your boards, drawings, text and images (“your
          content”). We don’t claim ownership of it.
        </p>
        <p>
          To run CanvasFlow, we need your permission to store, copy, sync and display your content.
          That’s what lets us save your boards, keep everyone’s edits in sync, and show a board to
          the people you share it with. You give us that permission by using CanvasFlow, and we use
          it only to run CanvasFlow for you and the people you share with.
        </p>
        <p>
          You’re responsible for your content. Only upload things you have the right to use. We may
          remove content that breaks these terms or the law.
        </p>
      </>
    ),
  },
  {
    id: 'our-rights',
    title: 'Our rights',
    body: (
      <>
        <p>
          CanvasFlow itself (the app, its code, design, name and logo) belongs to {OPERATOR.name}.
          These terms let you use CanvasFlow as described here. They don’t give you any other rights
          to it.
        </p>
        <p>If you send us ideas or feedback, we may use them freely, without owing you anything.</p>
      </>
    ),
  },
  {
    id: 'payments-and-subscriptions',
    title: 'Payments and subscriptions',
    body: (
      <>
        <p>
          CanvasFlow is free to use right now. Our <a href="/#pricing">pricing</a> shows paid plans
          marked “coming soon”: you can’t buy them yet, and nothing on CanvasFlow costs money today.
        </p>
        <p>
          Before we charge for anything, we’ll update these terms with the details: prices, how
          billing and renewals work, how to cancel, and refunds. We’ll never charge you for
          something you haven’t chosen to buy.
        </p>
      </>
    ),
  },
  {
    id: 'closing-your-account',
    title: 'Closing your account',
    body: (
      <>
        {/* [CHECK: the Settings route is only true once Delete account works. Ship this page
            with that feature, or after it.] */}
        <p>
          You can stop using CanvasFlow at any time. To close your account, go to{' '}
          <strong>Settings → Data & Privacy → Delete account</strong>, or email {supportEmail} from
          the address you signed up with.
        </p>
        <p>
          When your account is closed, we delete it, along with the boards you own, within 30 days.
          Boards owned by other people stay with them. If you’ve shared boards you own, save a copy
          for anyone who still needs them.
        </p>
        <p>
          We may suspend or close your account, or remove content, if you break these terms, if the
          law requires it, or to protect CanvasFlow or other people. Where we can, we’ll tell you
          why first and give you a chance to save your boards.
        </p>
        <p>
          We may also change or remove features over time. If we ever shut CanvasFlow down, we’ll
          tell you in advance so you can save your boards.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <>
        <p>
          We work hard to keep CanvasFlow running and your boards safe. But CanvasFlow is provided
          “as is” and “as available”: we can’t promise it will always be available, free of errors,
          or that data will never be lost.
        </p>
        <p>
          Keep your own copy of anything important. In the editor’s menu, <strong>Save to…</strong>{' '}
          saves a copy of a board as a file on your device, and <strong>Export image…</strong> saves
          it as a PNG or SVG.
        </p>
        <p>
          Some laws don’t allow these limits. Where that’s the case, they apply only as far as the
          law allows.
        </p>
      </>
    ),
  },
  {
    id: 'limitation-of-liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p>
          As far as the law allows, we aren’t liable for indirect or knock-on losses from using
          CanvasFlow, or from not being able to use it, such as lost profits, lost data or lost
          business.
        </p>
        <p>
          As far as the law allows, our total liability for any claim about CanvasFlow is limited to
          whichever is greater: what you paid us in the 12 months before the claim, or ₹2,000.
        </p>
        <p>Nothing in these terms limits any liability that the law says can’t be limited.</p>
      </>
    ),
  },
  {
    id: 'changes-to-these-terms',
    title: 'Changes to these terms',
    body: (
      <>
        <p>
          We may update these terms as CanvasFlow changes. The date at the top shows when they last
          changed.
        </p>
        <p>
          If a change is significant, we’ll tell you by email or in the app before it takes effect.
          If you keep using CanvasFlow after that, you accept the new terms. If you don’t, stop
          using CanvasFlow and ask us to close your account.
        </p>
        <p>
          If we set up a company to run CanvasFlow, we may transfer these terms to it, and we’ll
          tell you when we do.
        </p>
      </>
    ),
  },
  {
    id: 'governing-law',
    title: 'Governing law',
    body: (
      <>
        <p>
          These terms are governed by the laws of {OPERATOR.governingLaw}. Any dispute about them
          will be handled by the courts of {OPERATOR.courts}.
        </p>
        <p>
          If you use CanvasFlow as a consumer, you keep any rights your local law gives you that
          can’t be signed away.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact and complaints',
    body: (
      <>
        <p>
          Questions about these terms? Want to report something on CanvasFlow that breaks them?
          Email us at {legalEmail}. For help with your account, email {supportEmail}.
        </p>
        {/* Required of a service run from India: the IT Rules, 2021 ask for a named Grievance
            Officer with published contact details, and set both deadlines below. */}
        <p>
          <strong>Grievance Officer.</strong> Complaints about content or conduct on CanvasFlow go
          to our Grievance Officer, {OPERATOR.name}, at {legalEmail}. We’ll acknowledge your
          complaint within 24 hours and resolve it within 15 days.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      updated={TERMS_VERSION}
      intro={
        <>
          <p>
            These terms are the rules for using CanvasFlow: the website at canvasflowapp.com and the
            editor at app.canvasflowapp.com. By creating an account, or by opening a board someone
            shared with you, you agree to them. If you don’t agree, please don’t use CanvasFlow.
          </p>
          <p>
            We’ve written them in plain language. If anything is unclear, email us at {legalEmail}.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
