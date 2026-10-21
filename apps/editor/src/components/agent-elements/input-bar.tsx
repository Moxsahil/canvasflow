'use client';

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import type { ChatStatus } from 'ai';
import { cn } from './utils/cn';

type InputConfig = {
  inputBarPlaceholder: string;
  attachmentButtonPosition: 'left' | 'right';
  attachmentPreviewStyle: 'thumbnail' | 'chip' | 'hidden';
};

const DEFAULT_INPUT_CONFIG: InputConfig = {
  inputBarPlaceholder: 'Send a message...',
  attachmentButtonPosition: 'left',
  attachmentPreviewStyle: 'thumbnail',
};

import { IconX } from '@tabler/icons-react';
import { SendButton } from './input/send-button';
import { AttachmentButton } from './input/attachment-button';
import { FileAttachment } from './input/file-attachment';
import { useInputTyping } from './input/input-typing';
import { Suggestions, type SuggestionItem } from './input/suggestions';

export type AttachedImage = {
  id: string;
  filename: string;
  url: string;
  size?: number;
};

export type AttachedFile = {
  id: string;
  filename: string;
  size?: number;
};

export type InputBarProps = {
  onSend: (message: { role: 'user'; content: string }) => void;
  status: ChatStatus;
  onStop: () => void;
  placeholder?: string;
  /** Accessible name for the textarea. */
  ariaLabel?: string;
  /** Id of an element that describes the textarea. */
  ariaDescribedBy?: string;
  /** Accessible names for the send and stop button. */
  sendLabel?: string;
  stopLabel?: string;
  /** False holds the message back even with text typed, e.g. while it is too long. */
  canSend?: boolean;
  className?: string;

  // Attachment support
  onAttach?: () => void;
  attachLabel?: string;
  attachedImages?: AttachedImage[];
  attachedFiles?: AttachedFile[];
  onRemoveImage?: (id: string) => void;
  onRemoveFile?: (id: string) => void;
  /** Accessible name of each attachment's remove button. */
  removeAttachmentLabel?: string;
  /** How an attached image shows: a bare thumbnail, or a chip with its name and size. */
  imagePreviewStyle?: 'thumbnail' | 'chip';
  onPaste?: (e: React.ClipboardEvent) => void;
  isDragOver?: boolean;
  /**
   * When true (default) clicking a staged image attachment opens a
   * fullscreen lightbox preview. Set to false to render thumbnails as
   * plain non-interactive previews.
   */
  enableImagePreview?: boolean;

  // Controlled mode
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  suggestions?:
    | SuggestionItem[]
    | {
        items: SuggestionItem[];
        className?: string;
        itemClassName?: string;
      };

  // Typing animation
  typingAnimation?: {
    text: string;
    duration: number;
    image?: string;
    isActive: boolean;
    onComplete: () => void;
  };

  infoBar?: {
    /** Before the words, e.g. the icon of what the bar is about. */
    icon?: React.ReactNode;
    title?: string;
    description?: string;
    /** On the right, before the action, for a control of the caller's own. */
    trailing?: React.ReactNode;
    onClose?: () => void;
    /** Accessible name of the close button. */
    closeLabel?: string;
    position?: 'top' | 'bottom';
    /** Optional primary action rendered on the right (e.g. "Upgrade"). */
    action?: {
      label: string;
      onClick: () => void;
    };
  };

  /** Content rendered on the left of the toolbar, next to the attachment button. */
  leftActions?: React.ReactNode;
  /** Content rendered on the right of the toolbar, before the send button. */
  rightActions?: React.ReactNode;
};

export const InputBar = memo(function InputBar({
  onSend,
  status,
  onStop,
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  sendLabel = 'Send',
  stopLabel = 'Stop',
  canSend = true,
  className,
  onAttach,
  attachLabel,
  attachedImages = [],
  attachedFiles = [],
  onRemoveImage,
  onRemoveFile,
  removeAttachmentLabel,
  imagePreviewStyle,
  onPaste,
  isDragOver,
  enableImagePreview = true,
  value: controlledValue,
  onChange: controlledOnChange,
  disabled,
  autoFocus,
  suggestions = [],
  typingAnimation,
  infoBar,
  leftActions,
  rightActions,
}: InputBarProps) {
  const [internalInput, setInternalInput] = useState('');
  const [isInfoBarOpen, setIsInfoBarOpen] = useState(true);
  const isControlled = controlledValue !== undefined;
  const input = isControlled ? controlledValue : internalInput;
  const setInput = useCallback(
    (v: string) => {
      if (isControlled) {
        controlledOnChange?.(v);
      } else {
        setInternalInput(v);
      }
    },
    [isControlled, controlledOnChange],
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const config = DEFAULT_INPUT_CONFIG;

  const isStreaming = status === 'streaming' || status === 'submitted';
  const isTyping = typingAnimation?.isActive ?? false;

  const { displayedText, showImage } = useInputTyping(
    typingAnimation?.text ?? '',
    typingAnimation?.duration ?? 2000,
    isTyping,
    typingAnimation?.onComplete ?? (() => {}),
  );

  const effectivePlaceholder = placeholder ?? config.inputBarPlaceholder;

  const showAttach = Boolean(onAttach);
  const attachRight = config.attachmentButtonPosition === 'right';

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0';
    const nextHeight = Math.min(el.scrollHeight, 120);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
    el.style.overflowX = 'hidden';
  }, [input]);

  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus();
  }, [autoFocus]);

  const hasContextItems = attachedImages.length > 0 || attachedFiles.length > 0;

  // An attachment alone is something to send, with or without words.
  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && !hasContextItems) || isStreaming || disabled || !canSend) return;
    onSend({ role: 'user', content: trimmed });
    setInput('');
  }, [input, hasContextItems, isStreaming, disabled, canSend, onSend, setInput]);

  const handleInfoBarClose = useCallback(() => {
    setIsInfoBarOpen(false);
    infoBar?.onClose?.();
  }, [infoBar]);

  const infoBarPosition = infoBar?.position ?? 'top';
  const shouldShowInfoBar = Boolean(infoBar && (infoBar.title || infoBar.description));
  const infoBarData = infoBar ?? {};

  const infoBarNode = shouldShowInfoBar ? (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3 h-[34px]',
        'transition-all duration-150 ease-out overflow-hidden',
        isInfoBarOpen ? 'opacity-100 max-h-[34px]' : 'opacity-0 max-h-0',
        infoBarPosition === 'top'
          ? 'rounded-t-an-input-border-radius'
          : 'rounded-b-an-input-border-radius',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs text-an-foreground">
        {infoBarData.icon}
        <span className="min-w-0 truncate">
          {infoBarData.title && <span className="font-medium">{infoBarData.title}</span>}
          {infoBarData.description && (
            <span className="text-an-foreground-muted/80">
              {infoBarData.title ? ` ${infoBarData.description}` : infoBarData.description}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {infoBarData.trailing}
        {infoBarData.action && (
          <button
            type="button"
            onClick={infoBarData.action.onClick}
            className="h-6 px-2 rounded-[4px] text-xs font-medium bg-an-primary-color text-an-send-button-color hover:bg-an-primary-color/90 active:scale-[0.98] transition-[background-color,transform] duration-150"
          >
            {infoBarData.action.label}
          </button>
        )}
        {infoBarData.onClose && (
          <button
            type="button"
            onClick={handleInfoBarClose}
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-an-foreground-muted/70 hover:text-an-foreground hover:bg-an-background-secondary"
            aria-label={infoBarData.closeLabel ?? 'Close'}
            title={infoBarData.closeLabel}
          >
            <IconX className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  ) : null;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const hasInput = input.trim().length > 0 || hasContextItems;
  const showContextItems = hasContextItems && config.attachmentPreviewStyle !== 'hidden';
  const imageDisplayMode =
    (imagePreviewStyle ?? config.attachmentPreviewStyle) === 'thumbnail' ? 'image-only' : 'chip';

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('button, textarea')) {
      textareaRef.current?.focus();
    }
  }, []);

  const handleSuggestionSelect = useCallback(
    (item: SuggestionItem) => {
      if (disabled || isStreaming) return;
      setInput(item.value ?? item.label);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      });
    },
    [disabled, isStreaming, setInput],
  );

  const suggestionItems = Array.isArray(suggestions) ? suggestions : (suggestions?.items ?? []);
  const suggestionsClassName = Array.isArray(suggestions) ? undefined : suggestions?.className;
  const suggestionItemClassName = Array.isArray(suggestions)
    ? undefined
    : suggestions?.itemClassName;

  return (
    <div className={cn('shrink-0 px-3 pb-3', className)}>
      <div className="mx-auto max-w-an">
        <div
          className={cn(
            'flex flex-col gap-0',
            shouldShowInfoBar ? 'bg-an-background-tertiary rounded-an-input-border-radius' : null,
          )}
        >
          {infoBarPosition === 'top' && infoBarNode}
          <div
            className={cn(
              'relative cursor-text rounded-an-input-border-radius bg-an-input-background shadow-2xs ring-1 ring-foreground/10',
              isDragOver && 'ring-2 ring-an-primary-color',
            )}
            onClick={handleContainerClick}
          >
            {/* Context items (attached images/files) */}
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-200 ease-out grid-rows-[0fr]',
                showContextItems && 'grid-rows-[1fr]',
              )}
            >
              <div className="overflow-hidden">
                {showContextItems && (
                  <div className="flex flex-wrap items-center gap-[6px] px-an-context-padding pt-an-context-padding pb-0.5">
                    {attachedImages.map((img) => (
                      <FileAttachment
                        key={img.id}
                        id={img.id}
                        filename={img.filename}
                        size={img.size}
                        isImage
                        url={img.url}
                        display={imageDisplayMode}
                        enableImagePreview={enableImagePreview}
                        onRemove={onRemoveImage ? () => onRemoveImage(img.id) : undefined}
                        removeLabel={removeAttachmentLabel}
                      />
                    ))}
                    {attachedFiles.map((file) => (
                      <FileAttachment
                        key={file.id}
                        id={file.id}
                        filename={file.filename}
                        size={file.size}
                        onRemove={onRemoveFile ? () => onRemoveFile(file.id) : undefined}
                        removeLabel={removeAttachmentLabel}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Typing animation image */}
            {isTyping && typingAnimation?.image && showImage && (
              <div className="flex gap-2 flex-wrap px-3 pt-3">
                <div className="relative overflow-hidden shrink-0 w-16 h-16 rounded-md">
                  <img src={typingAnimation.image} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
            )}

            {/* Text input or typing animation text */}
            <div className="pt-3 pb-0 pr-3 pl-3.5 min-h-[44px]">
              {isTyping ? (
                <div className="w-full text-[14px] leading-[1.6] text-an-foreground-muted">
                  <span>{displayedText}</span>
                  <span className="inline-block w-[2px] h-[1em] ml-px align-text-bottom bg-an-foreground animate-an-blink" />
                </div>
              ) : (
                <>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={onPaste}
                    placeholder={effectivePlaceholder}
                    aria-label={ariaLabel}
                    aria-describedby={ariaDescribedBy}
                    disabled={disabled}
                    rows={1}
                    className={cn(
                      'peer w-full resize-none bg-transparent border-0 outline-none text-[14px] leading-[1.6] text-an-foreground placeholder:text-an-input-placeholder-color',
                      'overflow-hidden',
                      disabled && 'opacity-50 cursor-not-allowed',
                    )}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-an-input-border-radius outline-2 outline-an-input-focus-outline opacity-0 transition-opacity duration-75 peer-focus-visible:opacity-100 peer-focus:opacity-100 z-20 ease-in-out" />
                </>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 px-2 pt-1 pb-2">
              <div className="flex items-center gap-1 min-w-0">
                {!attachRight && showAttach && onAttach && (
                  <AttachmentButton onClick={onAttach} label={attachLabel} />
                )}
                {leftActions}
              </div>
              <div className="flex items-center gap-1">
                {rightActions}
                {attachRight && showAttach && onAttach && (
                  <AttachmentButton onClick={onAttach} label={attachLabel} />
                )}
                {/* Send / Stop button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isStreaming) {
                      onStop();
                    } else if (hasInput) {
                      handleSubmit();
                    }
                  }}
                  disabled={!isStreaming && (!hasInput || disabled || !canSend)}
                  aria-label={isStreaming ? stopLabel : sendLabel}
                  className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-an-primary-color disabled:cursor-default"
                >
                  <SendButton
                    state={
                      isStreaming
                        ? 'streaming'
                        : hasInput && !disabled && canSend
                          ? 'typing'
                          : 'idle'
                    }
                  />
                </button>
              </div>
            </div>
          </div>
          {suggestionItems.length > 0 && (
            <Suggestions
              items={suggestionItems}
              onSelect={handleSuggestionSelect}
              disabled={disabled || isStreaming}
              className={cn('mt-4 px-3', suggestionsClassName)}
              itemClassName={suggestionItemClassName}
            />
          )}
          {infoBarPosition === 'bottom' && infoBarNode}
        </div>
      </div>
    </div>
  );
});
