import { IconArrowUp, IconPlayerStopFilled } from '@tabler/icons-react';
import { cn } from '../utils/cn';

export type SendButtonProps = {
  state: 'idle' | 'typing' | 'streaming';
};

export function SendButton({ state }: SendButtonProps) {
  const isStreaming = state === 'streaming';
  const isTyping = state === 'typing';

  if (isStreaming) {
    return (
      <div className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-an-send-button-bg transition-transform active:scale-95">
        <IconPlayerStopFilled className="size-3.5 text-an-send-button-color" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex size-8 items-center justify-center rounded-full bg-an-send-button-bg transition-[opacity,transform] active:scale-95',
        isTyping ? 'cursor-pointer' : 'cursor-default opacity-40',
      )}
    >
      <IconArrowUp className="size-4 text-an-send-button-color" />
    </div>
  );
}
