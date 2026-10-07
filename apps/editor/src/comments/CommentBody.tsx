import { splitMentions } from './comment-mentions';
import type { CommentAuthor } from './comment-model';

/**
 * What a comment says, with the people it names marked out. Each reads as it
 * was written — by name, or by username.
 *
 * Every mention looks the same, whoever wrote it and whoever it names: blue
 * text, and nothing behind it. The one blue reads on every bubble a thread
 * has — dark or light, yours or someone else's — in either theme.
 */
export function CommentBody({
  body,
  mentions,
}: {
  body: string;
  mentions: readonly CommentAuthor[];
}) {
  return (
    // Selectable, unlike the rest of the board's chrome: a comment is
    // something people copy out of.
    <p className="m-0 leading-[1.4] break-words whitespace-pre-wrap select-text">
      {splitMentions(body, mentions).map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <span key={index} className="font-medium text-blue-500" data-mention={part.person.id}>
            @{part.written}
          </span>
        ),
      )}
    </p>
  );
}
