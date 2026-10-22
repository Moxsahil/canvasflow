import type { Metadata } from 'next';
import { LegalDocument, type LegalSection } from '@/components/legal/legal-document';
import { CONTACT, OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Contact — CanvasFlow',
  description: 'Who runs CanvasFlow, and the right address for every question.',
};

/** Move this whenever the text below changes: the page tells readers it did. */
const LAST_UPDATED = '2026-10-22';

const supportEmail = <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>;
const legalEmail = <a href={`mailto:${CONTACT.legal}`}>{CONTACT.legal}</a>;
const privacyEmail = <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a>;

/** Each address here is the one the terms and privacy policy send readers to. */
const SECTIONS: LegalSection[] = [
  {
    id: 'help',
    title: 'Help with CanvasFlow',
    body: (
      <>
        <p>
          For help with your account, your boards or a payment, email {supportEmail}. If you’re
          signed in, write from the address on your account, so we can find it.
        </p>
      </>
    ),
  },
  {
    id: 'payments',
    title: 'Payments and refunds',
    body: (
      <>
        <p>
          For a charge you don’t recognise or think is wrong, or help cancelling a plan, email{' '}
          {supportEmail}. Our <a href="/refunds">Cancellation and Refund Policy</a> explains how
          billing works.
        </p>
      </>
    ),
  },
  {
    id: 'privacy',
    title: 'Privacy',
    body: (
      <>
        <p>
          For questions about your personal data, or to ask for a copy of it or to delete it, email{' '}
          {privacyEmail}. Our <a href="/privacy">Privacy Policy</a> explains what we collect and
          why.
        </p>
      </>
    ),
  },
  {
    id: 'legal',
    title: 'Legal and reports',
    body: (
      <>
        <p>
          For questions about our <a href="/terms">Terms of Service</a>, or to report something on
          CanvasFlow that breaks them, email {legalEmail}.
        </p>
      </>
    ),
  },
  {
    id: 'grievance-officer',
    title: 'Grievance Officer',
    body: (
      <>
        <p>
          Complaints about content, conduct or payments on CanvasFlow go to our Grievance Officer,{' '}
          {OPERATOR.name}, at {legalEmail}. We’ll acknowledge your complaint within 24 hours and
          resolve it within 15 days.
        </p>
      </>
    ),
  },
  {
    id: 'who-runs-canvasflow',
    title: 'Who runs CanvasFlow',
    body: (
      <>
        <p>
          CanvasFlow is run by {OPERATOR.name}, from {OPERATOR.courts}, {OPERATOR.governingLaw}.
        </p>
      </>
    ),
  },
];

export default function ContactPage() {
  return (
    <LegalDocument
      title="Contact"
      updated={LAST_UPDATED}
      intro={
        <p>
          CanvasFlow is run by one person, and every email is read by them. Pick the address below
          that fits your question, and it’ll reach the right place.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
