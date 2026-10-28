import { t } from '../i18n';
import { env } from '@/lib/env';

/** What the boards you own take up, from the API gateway. */
export interface StorageUsage {
  /** Boards you own, in every workspace, that are not in the trash. */
  boards: number;
  /** Images placed on those boards. */
  images: number;
  boardBytes: number;
  imageBytes: number;
  /** Shapes saved to your own library. */
  libraryBytes: number;
  totalBytes: number;
  /** What the plan allows, in gigabytes: the largest of the workspaces you're in. */
  allowanceGb?: number;
}

export async function fetchStorageUsage(token: string | null): Promise<StorageUsage> {
  const res = await fetch(`${env.VITE_API_URL}/users/me/storage`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(t('storage.readFailed', { status: res.status }));
  return ((await res.json()) as { data: StorageUsage }).data;
}
