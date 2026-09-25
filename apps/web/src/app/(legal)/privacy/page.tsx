import type { Metadata } from 'next';
import { LegalDocument, type LegalSection } from '@/components/legal/legal-document';
import { CONTACT, MINIMUM_AGE, OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — CanvasFlow',
  description: 'What CanvasFlow collects, why, who handles it, and your rights over it.',
};

/** Move this whenever the text below changes: the page tells readers it did. */
const LAST_UPDATED = '2026-09-25';

const privacyEmail = <a href={`mailto:${CONTACT.privacy}`}>{CONTACT.privacy}</a>;
const supportEmail = <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>;

/**
 * Every statement here is one the product keeps today. Google is asked for
 * `openid email profile` and GitHub for `read:user user:email`, and neither
 * provider's tokens are stored. Sessions keep the device and a location from
 * Cloudflare's headers; the audit log keeps the IP address and device.
 * Cleanup jobs remove failed sign-ins and reset requests after 24 hours and
 * email links after 7 days. Nothing yet removes deleted boards, guest rows or
 * the audit log, and there is no way to restore a deleted board — the
 * retention section says exactly that. Change the product, change this.
 */
const SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          CanvasFlow is run by {OPERATOR.name}, an individual based in India (“we”, “us”, “our”). We
          decide how and why your personal data is used. Under India’s Digital Personal Data
          Protection Act, 2023, that makes us its “Data Fiduciary”.
        </p>
        <p>For anything about your privacy, email {privacyEmail}.</p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <>
        <p>Only what CanvasFlow needs to work:</p>
        <ul>
          <li>
            <strong>Your account:</strong> your name, email address and password. We store the
            password only as a one-way hash, so we can’t read it. Also your profile photo if you
            upload one, your cursor colour, and when you agreed to our Terms of Service and which
            version.
          </li>
          <li>
            <strong>If you sign in with Google or GitHub:</strong> your account ID with them, your
            email address, your name and a link to your profile photo. We ask them for nothing more,
            and we don’t keep their access tokens.
          </li>
          <li>
            <strong>What you create:</strong> your boards and everything on them, images you upload,
            board and workspace names, who you share boards with and the access you gave them,
            requests people make to join your boards, and share links (stored only as a hash).
          </li>
          <li>
            <strong>If you join a board as a guest:</strong> the name you type, and which board you
            joined.
          </li>
          <li>
            <strong>Security records:</strong> for each device you sign in on, the device and
            browser, an approximate location (city and country, worked out from your IP address by
            our network provider) and when it was last used. We also keep a security log of
            important events, such as signing in and out, password changes and resets, creating,
            sharing or deleting boards, and changes to workspaces and their members, with the IP
            address and device each came from. Failed sign-in attempts are stored against a
            scrambled (hashed) form of the email address used.
          </li>
        </ul>
        <p>
          We don’t use analytics, advertising or tracking tools, and we don’t buy data about you
          from anyone.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    title: 'How we use it',
    body: (
      <>
        <ul>
          <li>
            <strong>To run your account:</strong> to create it, sign you in and keep you signed in.
          </li>
          <li>
            <strong>To provide CanvasFlow:</strong> to store and sync your boards, and show them to
            you and the people you share them with.
          </li>
          <li>
            <strong>To email you about your account:</strong> to confirm your address, reset your
            password, and warn you about security events such as a password change. We don’t send
            marketing emails.
          </li>
          <li>
            <strong>To keep things secure:</strong> to show you where you’re signed in, stop misuse
            such as password guessing, and investigate problems.
          </li>
          <li>
            <strong>To answer you</strong> when you contact us.
          </li>
          <li>
            <strong>To meet our legal duties,</strong> such as answering lawful requests and keeping
            records the law requires.
          </li>
        </ul>
        <p>
          We use your data only for these purposes. We don’t sell it, use it for advertising, or
          send your boards to AI services.
        </p>
        <p>
          Under the DPDP Act, this is data you give us so you can use CanvasFlow, used only for
          that. If we ever ask for your consent to something else, you’ll be able to withdraw it as
          easily as you gave it.
        </p>
      </>
    ),
  },
  {
    id: 'who-we-share-it-with',
    title: 'Who we share it with',
    body: (
      <>
        <ul>
          <li>
            <strong>People you work with.</strong> The people you share a board with see what’s on
            it, and your name and profile photo while you’re on it together. Your cursor moves live
            on their screens; we don’t save it.
          </li>
          <li>
            <strong>Service providers</strong> that run parts of CanvasFlow for us, and handle your
            data only to do that:
            <ul>
              <li>Vercel, which hosts the website and the editor</li>
              <li>Fly.io, which runs our servers, in Singapore</li>
              <li>Neon, which stores our database, in Singapore</li>
              <li>Cloudflare, which protects our network and stores uploaded images and photos</li>
              <li>Resend, which sends our emails</li>
              <li>Zoho, which hosts the mailbox your emails to us arrive in</li>
              <li>Google and GitHub, only if you sign in with them</li>
            </ul>
          </li>
          <li>
            <strong>When the law requires it,</strong> or to protect the safety and rights of our
            users, the public or CanvasFlow.
          </li>
          <li>
            <strong>If a company takes over CanvasFlow.</strong> If we set up a company to run
            CanvasFlow, as our <a href="/terms">Terms of Service</a> allow, your data moves to it
            under this policy.
          </li>
        </ul>
        <p>We don’t sell or rent your personal data to anyone.</p>
      </>
    ),
  },
  {
    id: 'where-it-is-stored',
    title: 'Where your data is stored',
    body: (
      <>
        <p>
          Our servers and database are in Singapore, and some providers, such as Cloudflare, Vercel
          and Resend, work through networks around the world. So when you use CanvasFlow, your data
          is stored and handled outside India.
        </p>
        <p>
          Indian law allows this, and lets the government restrict transfers to particular
          countries. We’ll follow any such restriction.
        </p>
      </>
    ),
  },
  {
    id: 'how-long-we-keep-it',
    title: 'How long we keep it',
    body: (
      <>
        <ul>
          <li>
            <strong>Your account and the boards you own:</strong> until you close your account. We
            then delete them within 30 days, as our Terms of Service say.
          </li>
          <li>
            <strong>Boards you delete:</strong> hidden from you straight away, but kept until your
            account is closed.
          </li>
          <li>
            <strong>Guest names:</strong> kept with the board the guest joined. They aren’t deleted
            automatically yet.
          </li>
          <li>
            <strong>Signed-in devices:</strong> until you sign out, and never longer than a year.
          </li>
          <li>
            <strong>The security log:</strong> kept to protect accounts, and not deleted
            automatically yet. When an account is closed, its entries stay but are no longer linked
            to it.
          </li>
          <li>
            <strong>Failed sign-in attempts and password-reset requests:</strong> 24 hours.
            Password-reset and email-confirmation links: 7 days.
          </li>
          <li>
            <strong>Emails you send us:</strong> as long as we need them to deal with what you
            asked.
          </li>
        </ul>
        <p>
          Our database provider keeps backups for a short time, so deleted data can remain in a
          backup until it expires.
        </p>
      </>
    ),
  },
  {
    id: 'cookies-and-storage',
    title: 'Cookies and storage on your device',
    body: (
      <>
        <p>
          We use only the cookies CanvasFlow needs to work, none for advertising or analytics, which
          is why there’s no cookie banner:
        </p>
        <ul>
          <li>
            <strong>cf.access</strong> and <strong>cf.refresh</strong> keep you signed in.
          </li>
          <li>
            <strong>cf.guest</strong> keeps a guest on the board they joined, for up to 7 days.
          </li>
          <li>
            <strong>cf.oauth.next</strong> and <strong>cf.oauth.terms</strong> carry a Google or
            GitHub sign-in through the trip to that provider and back, for up to 10 minutes.
          </li>
        </ul>
        <p>
          The editor also keeps copies of the boards you open in your browser, so they keep working
          offline and catch up when you reconnect, along with your editor settings. Clearing your
          browser’s data for CanvasFlow removes them.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-protect-it',
    title: 'How we protect it',
    body: (
      <>
        <ul>
          <li>Every connection to CanvasFlow is encrypted (HTTPS).</li>
          <li>
            Passwords are stored only as one-way hashes, and so are share links and the links in our
            emails.
          </li>
          <li>
            You can see the devices you’re signed in on, and sign out of all of them, in{' '}
            <strong>Settings → Account &amp; Security</strong>.
          </li>
          <li>Repeated sign-in attempts are limited, to stop password guessing.</li>
          <li>Only we can reach the systems that hold your data.</li>
        </ul>
        <p>
          No system is perfectly secure. If a breach affects your personal data, we’ll tell you and
          India’s Data Protection Board, as the law requires.
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Wherever you live, you can:</p>
        <ul>
          <li>
            <strong>See your data:</strong> ask for a summary of the personal data we hold about
            you, and who we’ve shared it with.
          </li>
          <li>
            <strong>Correct it:</strong> change your name and photo in Settings, or ask us to fix
            anything else.
          </li>
          <li>
            <strong>Export your boards:</strong> in the editor’s menu, <strong>Save to…</strong>{' '}
            saves a copy of a board as a file on your device.
          </li>
          <li>
            <strong>Delete it:</strong> close your account in{' '}
            <strong>Settings → Data &amp; Privacy → Delete account</strong>, or ask us to.
          </li>
          <li>
            <strong>Withdraw consent</strong> to anything you consented to.
          </li>
          <li>
            <strong>Nominate someone</strong> to use these rights for you if you die or become
            unable to.
          </li>
        </ul>
        <p>
          To use any of these, email {privacyEmail} from the address on your account, so we know the
          request is yours. We’ll respond as quickly as we can, and within 90 days at most.
        </p>
      </>
    ),
  },
  {
    id: 'complaints',
    title: 'Complaints',
    body: (
      <>
        <p>
          If you’re unhappy with how we’ve handled your data, tell our Grievance Officer,{' '}
          {OPERATOR.name}, at {privacyEmail}. We’ll resolve your complaint within 90 days.
        </p>
        <p>
          If you’re still not satisfied, you can complain to the Data Protection Board of India.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        CanvasFlow is for people {MINIMUM_AGE} and over, as our{' '}
        <a href="/terms">Terms of Service</a> say, so we don’t knowingly collect data from children.
        If you think a child has an account, email {privacyEmail} and we’ll delete it.
      </p>
    ),
  },
  {
    id: 'changes-to-this-policy',
    title: 'Changes to this policy',
    body: (
      <p>
        We’ll update this policy when CanvasFlow changes. The date at the top shows when it last
        changed. If a change is significant, we’ll tell you by email or in the app before it takes
        effect.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        For anything about your privacy or your personal data, email {privacyEmail}. For help with
        your account, email {supportEmail}.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      updated={LAST_UPDATED}
      intro={
        <>
          <p>
            This policy explains what personal data CanvasFlow collects, why, who handles it for us,
            how long we keep it, and the rights you have over it. It covers the website at
            canvasflowapp.com and the editor at app.canvasflowapp.com.
          </p>
          <p>
            <strong>The short version:</strong> we collect what we need to run your account and your
            boards. We don’t sell your data, show ads, or use analytics or tracking tools. You can
            ask to see, correct or delete your data at any time, and save copies of your boards
            whenever you like.
          </p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
