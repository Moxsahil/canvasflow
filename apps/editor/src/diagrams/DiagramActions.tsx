import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, CopyIcon, PencilIcon, RefreshCwIcon } from 'lucide-react';
import { MessageActions, type Reaction } from '@/components/assistant-ui/elements/message-actions';
import {
  ghostButton,
  iconSwap,
  iconSwapIn,
  iconSwapOut,
} from '@/components/assistant-ui/elements/surfaces';
import { cn } from '@/lib/utils';
import { fullDateTime, relativeTime } from '../comments/comment-time';
import { useT } from '../i18n';

type CopyState = 'idle' | 'copied' | 'failed';

/** A copy that says it worked, or that it did not, for a couple of seconds. */
function useCopy(copy: () => Promise<void>) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = () => {
    copy().then(
      () => setState('copied'),
      () => setState('failed'),
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };
  return [state, run] as const;
}

/** "now", "5m ago": kept current while the panel stays open. */
function When({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={fullDateTime(at)}
      className="text-muted-foreground px-1 text-[11px] whitespace-nowrap tabular-nums"
    >
      {relativeTime(at, now)}
    </time>
  );
}

function CopyFailed({ state }: { state: CopyState }) {
  const t = useT();
  return (
    <span role="status" className="text-[11px] text-[var(--surface-danger)]">
      {state === 'failed' ? t('diagrams.copyFailed') : ''}
    </span>
  );
}

const iconButton = cn(
  ghostButton,
  'size-7 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5',
);

/** Under a request: when it was asked, ask it again, put it back in the box, copy it. */
export function RequestActions({
  at,
  text,
  onRetry,
  retryDisabled,
  onEdit,
}: {
  at: number;
  text: string;
  onRetry: () => void;
  retryDisabled: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  const [copy, runCopy] = useCopy(() => navigator.clipboard.writeText(text));
  const copyLabel = copy === 'copied' ? t('diagrams.copied') : t('diagrams.copyText');
  return (
    <div className="flex items-center gap-0.5">
      <CopyFailed state={copy} />
      <When at={at} />
      <button
        type="button"
        className={iconButton}
        disabled={retryDisabled}
        onClick={onRetry}
        aria-label={t('diagrams.retry')}
        title={t('diagrams.retry')}
      >
        <RefreshCwIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={iconButton}
        onClick={onEdit}
        aria-label={t('diagrams.edit')}
        title={t('diagrams.edit')}
      >
        <PencilIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className={cn(
          iconButton,
          'grid place-items-center',
          copy === 'copied' && 'text-emerald-500',
        )}
        onClick={runCopy}
        aria-label={copyLabel}
        title={copyLabel}
      >
        <CopyIcon
          aria-hidden="true"
          className={cn(iconSwap, copy === 'copied' ? iconSwapOut : iconSwapIn)}
        />
        <CheckIcon
          aria-hidden="true"
          className={cn(iconSwap, copy === 'copied' ? iconSwapIn : iconSwapOut)}
        />
      </button>
    </div>
  );
}

/** Under a diagram: copy it as a picture, rate it, draw it again, and when it was drawn. */
export function AnswerActions({
  at,
  reaction,
  onRate,
  onRegenerate,
  regenerateDisabled,
  onCopy,
  trailing,
}: {
  at: number;
  reaction: Reaction;
  onRate: (reaction: Reaction) => void;
  onRegenerate: () => void;
  regenerateDisabled: boolean;
  onCopy: () => Promise<void>;
  /** At the far end of the row: what can be done with the diagram itself. */
  trailing?: ReactNode;
}) {
  const t = useT();
  const [copy, runCopy] = useCopy(onCopy);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <MessageActions
        copied={copy === 'copied'}
        reaction={reaction}
        regenerating={false}
        onCopy={runCopy}
        onReactionChange={onRate}
        onRegenerate={onRegenerate}
        regenerateDisabled={regenerateDisabled}
        labels={{
          copy: t('diagrams.copyImage'),
          copied: t('diagrams.copiedImage'),
          helpful: t('diagrams.helpful'),
          unhelpful: t('diagrams.unhelpful'),
          regenerate: t('diagrams.regenerate'),
        }}
      />
      <When at={at} />
      <CopyFailed state={copy} />
      {trailing && <div className="ml-auto flex items-center gap-1">{trailing}</div>}
    </div>
  );
}
