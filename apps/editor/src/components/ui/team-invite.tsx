import * as React from 'react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Edit3, Crown, Copy, Check, QrCode, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSurfacePortal } from '@/ui/SurfaceDialog';
import {
  SURFACE_INPUT_CLASS,
  SurfaceButton,
  SurfaceCard,
  SurfaceGroupLabel,
  SurfaceHint,
  SurfaceRow,
  SurfaceRowText,
  SurfaceToggle,
} from '@/ui/surface-ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type PermissionLevel = 'can-view' | 'can-edit' | 'admin';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: PermissionLevel;
  isOwner?: boolean;
}

export interface TeamInviteProps {
  className?: string;
  members?: TeamMember[];
  /** The live link, or null when there is no session to link to. */
  link?: string | null;
  live?: boolean;
  copied?: boolean;
  error?: string | null;
  /** What someone arriving on the link may do. Fixed once a session is live. */
  permission: PermissionLevel;
  onPermissionChange?: (permission: PermissionLevel) => void;
  allowGuests?: boolean;
  onAllowGuestsChange?: (value: boolean) => void;
  onCopy?: () => void;
  /** Rendered inside the code panel, behind the button next to the heading. */
  qr?: React.ReactNode;
  onUpdateMemberPermission?: (memberId: string, permission: PermissionLevel) => void;
  onRemoveMember?: (memberId: string) => void;
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  portalContainer?: HTMLElement | null;
}

const permissionOptions = [
  {
    value: 'can-view' as const,
    label: 'Can view',
    description: 'View only access',
    icon: Eye,
  },
  {
    value: 'can-edit' as const,
    label: 'Can edit',
    description: 'Edit and view access',
    icon: Edit3,
  },
] as const;

/** Chosen from the member menu, where it reads as one more thing to set. */
const REMOVE_VALUE = 'remove';

const getPermissionIcon = (permission: PermissionLevel) => {
  switch (permission) {
    case 'can-view':
      return Eye;
    case 'can-edit':
      return Edit3;
    case 'admin':
      return Crown;
    default:
      return Eye;
  }
};

const getPermissionLabel = (permission: PermissionLevel) => {
  switch (permission) {
    case 'can-view':
      return 'Can view';
    case 'can-edit':
      return 'Can edit';
    case 'admin':
      return 'Admin';
    default:
      return 'Can view';
  }
};

const TeamInvite = React.forwardRef<HTMLDivElement, TeamInviteProps>(function TeamInvite(
  {
    className,
    members = [],
    link = null,
    live = false,
    copied = false,
    error = null,
    permission,
    onPermissionChange,
    allowGuests = true,
    onAllowGuestsChange,
    onCopy,
    qr,
    onUpdateMemberPermission,
    onRemoveMember,
    portalContainer,
    ...props
  },
  ref,
) {
  const [showCode, setShowCode] = useState(false);
  // Inside a dialog its menus belong to that dialog's backdrop; outside one
  // this is null and the caller's own container is used.
  const surfacePortal = useSurfacePortal();
  const menuContainer = surfacePortal ?? portalContainer;

  /** Two letters for a member with no avatar image. */
  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const handleUpdatePermission = (memberId: string, value: string) => {
    if (value === REMOVE_VALUE) {
      onRemoveMember?.(memberId);
      return;
    }
    onUpdateMemberPermission?.(memberId, value as PermissionLevel);
  };

  return (
    // Two columns rather than one: the link and its settings on the left, who
    // can reach the board on the right. Stacked, showing the QR or joining a
    // few people pushed the buttons off the bottom and made it a dialog you
    // had to scroll to finish using.
    <div
      ref={ref}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-[18px]',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-[8px]">
        <SurfaceGroupLabel>Session link</SurfaceGroupLabel>
        <SurfaceCard>
          {/* Wider than a row's right-hand control can be: a URL elided to
              240px is one you cannot check before sending. */}
          <div className="flex w-full items-center gap-[8px] px-[18px] py-[14px]">
            <input
              readOnly
              placeholder={
                live ? 'Link created in another browser' : 'Start a session to get a link'
              }
              value={link ?? ''}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Session link"
              className={SURFACE_INPUT_CLASS}
            />
            <SurfaceButton onClick={onCopy} disabled={!link}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </SurfaceButton>
          </div>

          <SurfaceRow>
            <SurfaceRowText
              title="Anyone with the link"
              hint={live ? 'Fixed once the session starts' : 'What someone joining may do'}
            />
            <Select
              value={permission}
              disabled={live}
              onValueChange={(value) => onPermissionChange?.(value as PermissionLevel)}
            >
              <SelectTrigger
                className="h-[34px] w-[136px] text-xs"
                aria-label="What people who join can do"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={menuContainer}>
                {permissionOptions.map((option) => {
                  const IconComponent = option.icon;
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <IconComponent size={14} />
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </SurfaceRow>

          <SurfaceRow>
            <SurfaceRowText title="Allow guests" hint="People without an account can join" />
            <SurfaceToggle
              label="Allow people without an account"
              on={allowGuests}
              onChange={(next) => !live && onAllowGuestsChange?.(next)}
            />
          </SurfaceRow>

          {qr && link ? (
            <SurfaceRow>
              <SurfaceRowText title="QR code" hint="Scan to open on another device" />
              <SurfaceButton onClick={() => setShowCode((open) => !open)} aria-expanded={showCode}>
                <QrCode size={13} />
                {showCode ? 'Hide' : 'Show'}
              </SurfaceButton>
            </SurfaceRow>
          ) : null}
        </SurfaceCard>

        {/* Below the card rather than inside it: a 128px square in a row makes
            the row four times the height of its neighbours. */}
        <AnimatePresence initial={false}>
          {qr && link && showCode ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex justify-center rounded-[12px] border border-[var(--surface-border)] bg-[var(--surface-card)] p-[14px]">
                {qr}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error && <SurfaceHint tone="danger">{error}</SurfaceHint>}
      </div>

      <div className="flex min-w-0 flex-col gap-[8px]">
        <SurfaceGroupLabel>Access</SurfaceGroupLabel>
        {members.length === 0 ? (
          <SurfaceCard>
            <p className="px-[18px] py-[14px] text-[12px] text-[var(--surface-fg-muted)]">
              Only you, for now.
            </p>
          </SurfaceCard>
        ) : (
          // Four people fit; the rest are a scroll away inside the card, so a
          // busy board grows this list rather than the dialog around it. The
          // cut deliberately lands mid-row: with the scrollbar hidden, the
          // half-visible face is the only thing saying there are more.
          <SurfaceCard className="no-scrollbar max-h-[316px] overflow-y-auto">
            {members.map((member) => {
              const PermissionIcon = getPermissionIcon(member.role);
              return (
                <SurfaceRow key={member.id} className="gap-[12px]">
                  <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[11px] font-medium text-[var(--surface-fg-muted)]">
                    {getInitials(member.name)}
                  </span>
                  <SurfaceRowText title={member.name} hint={member.email} />
                  {member.isOwner ? (
                    <span className="flex shrink-0 items-center gap-[5px] rounded-[6px] border border-[var(--surface-border)] px-[8px] py-[4px] text-[11px] text-[var(--surface-fg-muted)]">
                      <Crown size={11} aria-hidden="true" />
                      Owner
                    </span>
                  ) : (
                    <Select
                      value={member.role}
                      onValueChange={(value) => handleUpdatePermission(member.id, value)}
                    >
                      <SelectTrigger
                        className="h-[30px] w-[122px] text-xs"
                        aria-label={`Role for ${member.name}`}
                      >
                        <div className="flex items-center gap-1">
                          <PermissionIcon size={12} />
                          <span className="truncate">{getPermissionLabel(member.role)}</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent container={menuContainer}>
                        {permissionOptions.map((option) => {
                          const IconComponent = option.icon;
                          return (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <IconComponent size={14} />
                                <div>
                                  <p className="font-medium">{option.label}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {option.description}
                                  </p>
                                </div>
                              </div>
                            </SelectItem>
                          );
                        })}
                        {onRemoveMember && (
                          <>
                            <SelectSeparator />
                            <SelectItem
                              value={REMOVE_VALUE}
                              className="text-destructive focus:text-destructive"
                            >
                              <div className="flex items-center gap-2">
                                <Trash2 size={14} />
                                <span>Remove from board</span>
                              </div>
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </SurfaceRow>
              );
            })}
          </SurfaceCard>
        )}
      </div>
    </div>
  );
});

export { TeamInvite };
