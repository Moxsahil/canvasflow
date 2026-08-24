import * as React from 'react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Eye, Edit3, Crown, Copy, Check, Play, Square, QrCode, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
  teamName: string;
  teamLogo?: string;
  totalMembers: number;
  members?: TeamMember[];
  /** The live link, or null when there is no session to link to. */
  link?: string | null;
  live?: boolean;
  busy?: boolean;
  copied?: boolean;
  error?: string | null;
  /** What someone arriving on the link may do. Fixed once a session is live. */
  permission: PermissionLevel;
  onPermissionChange?: (permission: PermissionLevel) => void;
  allowGuests?: boolean;
  onAllowGuestsChange?: (value: boolean) => void;
  onStart?: () => void;
  onStop?: () => void;
  onCopy?: () => void;
  /** Rendered inside the code panel, behind the button next to the heading. */
  qr?: React.ReactNode;
  onUpdateMemberPermission?: (memberId: string, permission: PermissionLevel) => void;
  onRemoveMember?: (memberId: string) => void;
  onCancel?: () => void;
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
    teamName,
    teamLogo,
    totalMembers,
    members = [],
    link = null,
    live = false,
    busy = false,
    copied = false,
    error = null,
    permission,
    onPermissionChange,
    allowGuests = true,
    onAllowGuestsChange,
    onStart,
    onStop,
    onCopy,
    qr,
    onUpdateMemberPermission,
    onRemoveMember,
    onCancel,
    portalContainer,
    ...props
  },
  ref,
) {
  const [showCode, setShowCode] = useState(false);

  const handleUpdatePermission = (memberId: string, value: string) => {
    if (value === REMOVE_VALUE) {
      onRemoveMember?.(memberId);
      return;
    }
    onUpdateMemberPermission?.(memberId, value as PermissionLevel);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card ref={ref} className={cn('w-full max-w-lg', className)} {...props}>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <Avatar className="h-12 w-12">
              <AvatarImage src={teamLogo} alt={teamName} />
              <AvatarFallback className="bg-primary text-sm font-medium text-primary-foreground">
                {getInitials(teamName)}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg font-semibold">{teamName}</CardTitle>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users size={14} />
              {totalMembers} {totalMembers === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/* Share this board section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Invite Members</Label>
            {link && qr && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCode((open) => !open)}
                aria-expanded={showCode}
              >
                <QrCode size={14} />
                {showCode ? 'Hide code' : 'Show code'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                readOnly
                placeholder={
                  live ? 'Link created in another browser' : 'Start a session to get a link'
                }
                value={link ?? ''}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Session link"
                className="h-9"
              />
            </div>
            <div>
              <Select
                value={permission}
                disabled={live}
                onValueChange={(value) => onPermissionChange?.(value as PermissionLevel)}
              >
                <SelectTrigger className="h-9 text-xs" aria-label="What people who join can do">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent container={portalContainer}>
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
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showCode && qr && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex justify-center rounded-ele border border-border p-3">{qr}</div>
              </motion.div>
            )}
          </AnimatePresence>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allowGuests}
              disabled={live}
              onChange={(event) => onAllowGuestsChange?.(event.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Allow people without an account
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="ml-auto flex w-fit justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCopy}
              disabled={!link}
              className="h-9 flex-1"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button
              onClick={live ? onStop : onStart}
              loading={busy}
              size="sm"
              className="h-9 flex-1"
            >
              {live ? <Square size={14} /> : <Play size={14} />}
              {live ? 'Stop session' : 'Start session'}
            </Button>
          </div>
        </div>

        {/* Access section */}
        {members.length > 0 && (
          <>
            <div className="flex flex-col gap-4">
              <Label className="text-base font-medium">Access</Label>

              <div className="flex flex-col gap-3">
                <AnimatePresence>
                  {members.map((member) => {
                    const PermissionIcon = getPermissionIcon(member.role);

                    return (
                      <motion.div
                        key={member.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3 rounded-ele p-2 transition-colors hover:bg-accent"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatar} alt={member.name} />
                          <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{member.name}</p>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {member.isOwner ? (
                            <Badge
                              variant="outline"
                              className="border-border text-xs normal-case tracking-normal text-muted-foreground"
                            >
                              <Crown size={12} className="mr-1" />
                              Owner
                            </Badge>
                          ) : (
                            <Select
                              value={member.role}
                              onValueChange={(value) => handleUpdatePermission(member.id, value)}
                            >
                              <SelectTrigger
                                className="h-8 text-xs"
                                aria-label={`Role for ${member.name}`}
                              >
                                <div className="flex items-center gap-1">
                                  <PermissionIcon size={12} />
                                  <span className="truncate">
                                    {getPermissionLabel(member.role)}
                                  </span>
                                </div>
                              </SelectTrigger>
                              <SelectContent container={portalContainer}>
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
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        {onCancel && (
          <>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={onCancel}>Done</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});

export { TeamInvite };
