import type { Metadata } from 'next';
import { LoginClient } from './login-client';

// Its own title and description, so search results can tell this page from the
// home page and list it under the brand as "Sign in".
export const metadata: Metadata = {
  title: 'Sign in — CanvasFlow',
  description: 'Sign in to CanvasFlow to open your boards and workspaces.',
};

export default function LoginPage() {
  return <LoginClient />;
}
