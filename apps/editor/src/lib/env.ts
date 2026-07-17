interface Env {
  VITE_API_URL: string;
  VITE_WEB_URL: string;
}

function loadEnv(): Env {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl || typeof apiUrl !== 'string') {
    throw new Error('VITE_API_URL is not set.');
  }
  const webUrl = import.meta.env.VITE_WEB_URL;
  if (!webUrl || typeof webUrl !== 'string') {
    throw new Error('VITE_WEB_URL is not set.');
  }
  return { VITE_API_URL: apiUrl, VITE_WEB_URL: webUrl };
}

export const env = loadEnv();
