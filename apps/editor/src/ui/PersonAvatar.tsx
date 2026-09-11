import { useEffect, useState } from 'react';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';

/**
 * A person, on a surface dialog: their photo, or the letters of their name.
 *
 * The fallback is not only for people who have no photo. A sign-in provider
 * hands out a URL for accounts that never set a picture, and those URLs do not
 * load — so an image that fails has to leave the letters showing rather than a
 * broken frame, and that has to be handled wherever a face is drawn.
 *
 * Size and text size come from the caller, because the rows these sit in are
 * not all the same height; everything else is fixed so that one person looks
 * the same in every list.
 */
export function PersonAvatar({
  url,
  name,
  className,
}: {
  url?: string | null;
  name: string;
  /** At least a size and a text size — `size-[30px] text-[11px]`. */
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A new URL deserves its own attempt: this is the same element when a photo
  // is replaced, and a previous failure would otherwise stick to it.
  useEffect(() => setFailed(false), [url]);

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-raised)] font-medium text-[var(--surface-fg-muted)]',
        className,
      )}
    >
      {url && !failed ? (
        <img src={url} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
