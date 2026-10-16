import type { Metadata } from 'next';
import { SignupClient } from './signup-client';

// Its own title and description, so search results can tell this page from the
// home page and list it under the brand as "Create your account".
export const metadata: Metadata = {
  title: 'Create your account — CanvasFlow',
  description:
    'Create a CanvasFlow account and start sketching diagrams, wireframes and flowcharts with your team.',
};

export default function SignupPage() {
  return <SignupClient />;
}
