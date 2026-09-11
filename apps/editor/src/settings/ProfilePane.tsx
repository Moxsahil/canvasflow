import { useEffect, useRef, useState } from 'react';
import { PRESENCE_PALETTE, type PresenceTheme } from '@canvasflow/canvas-engine';
import type { CursorColor } from '@canvasflow/types';
import { initialsOf } from '@/lib/initials';
import { AvatarCropper } from '../profile/AvatarCropper';
import type { AvatarState, ProfileState } from '../profile';
import {
  Card,
  GhostButton,
  GroupLabel,
  Row,
  RowText,
  SecondaryButton,
  SettingsPane,
  TextField,
} from './settings-ui';

interface ProfilePaneProps {
  /** Seeds the fields before the profile arrives. Null until the token decodes. */
  user: { name: string; email: string | null } | null;
  /** The account's saved profile, and the way to write to it. */
  account: ProfileState;
  /** The photo, which is stored as bytes rather than as a profile field. */
  avatar: AvatarState;
  /** Each palette colour has a shade per theme; this picks which one is drawn. */
  theme: PresenceTheme;
  onClose: () => void;
}

/**
 * Profile: how you appear to the people you share a board with.
 *
 * The display name and the cursor colour are saved to the account. The rest —
 * the photo, the username, the email — have no endpoint behind them yet and
 * are left as they were, holding their edits for as long as the dialog is open
 * and dropping them when it closes.
 *
 * A guest has no profile to load, so the two live fields are disabled rather
 * than offering a save that would be refused.
 */
export function ProfilePane({ user, account, avatar, theme, onClose }: ProfilePaneProps) {
  const { profile, saving, error, save } = account;
  const fallbackName = user?.name?.trim() || 'Account';

  // The file waiting to be positioned. Set by the picker, cleared when the
  // cropper is done with it either way.
  const [picked, setPicked] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.name ?? fallbackName);
  const [username, setUsername] = useState('');
  const [cursorColor, setCursorColor] = useState<CursorColor | null>(profile?.cursorColor ?? null);
  /** What this pane refused to send, as against what the server refused. */
  const [formError, setFormError] = useState<string | null>(null);

  // The dialog can open before the profile has arrived. Seeded once when it
  // does and never again, so a slow response cannot overwrite what has been
  // typed in the meantime.
  const seeded = useRef(profile !== null);
  useEffect(() => {
    if (!profile || seeded.current) return;
    seeded.current = true;
    setDisplayName(profile.name);
    setCursorColor(profile.cursorColor);
  }, [profile]);

  const editable = profile !== null && !saving;
  const trimmedName = displayName.trim();
  const nameChanged = profile !== null && trimmedName.length > 0 && trimmedName !== profile.name;
  const colorChanged = profile !== null && cursorColor !== profile.cursorColor;

  const handleSave = () => {
    // An emptied field is a mistake, not a request to be nameless — and it is
    // the one edit that would otherwise close the dialog having saved nothing,
    // because an empty name is never sent.
    if (profile !== null && trimmedName.length === 0) {
      setFormError('Display name is required.');
      return;
    }

    // Nothing to send — a guest's pane, or one nobody touched — so this stays
    // the plain close the footer has always been.
    if (!nameChanged && !colorChanged) {
      onClose();
      return;
    }

    void save({
      ...(nameChanged ? { name: trimmedName } : {}),
      ...(colorChanged ? { cursorColor } : {}),
    }).then((saved) => {
      // A refusal keeps the dialog open with its message in the footer, so the
      // text that was rejected is still there to fix.
      if (saved) onClose();
    });
  };

  // One letter per name, as the share dialog's access list abbreviates people.
  const letters = initialsOf(trimmedName || fallbackName);

  // A photo that will not load leaves the letters showing rather than a broken
  // image. Sign-in providers issue a URL even for an account that never set a
  // picture, and those are the ones that fail.
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [avatar.url]);

  const handleUse = (blob: Blob, mimeType: string) => {
    void avatar.upload(blob, mimeType).then((uploaded) => {
      // Left open on failure, with the message under it, so the photo that was
      // just positioned is not lost to a retry.
      if (uploaded) setPicked(null);
    });
  };

  return (
    <SettingsPane
      title="Profile"
      subtitle="How you appear to collaborators on shared boards."
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
      error={formError ?? avatar.error ?? error}
      overlay={
        picked && (
          <AvatarCropper
            file={picked}
            busy={avatar.busy}
            onCancel={() => setPicked(null)}
            onUse={handleUse}
          />
        )
      }
    >
      <GroupLabel>Identity</GroupLabel>
      <Card>
        {/* The avatar row is taller than the rest — 16px of padding against
            their 15px — because the 52px circle sets the height. */}
        <div className="flex w-full items-center gap-[16px] px-[18px] py-[16px]">
          {avatar.url && !photoFailed ? (
            <img
              src={avatar.url}
              alt=""
              onError={() => setPhotoFailed(true)}
              className="size-[52px] shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[16px] font-medium text-[var(--surface-fg-muted)]">
              {letters}
            </div>
          )}
          <RowText title="Profile photo" hint="JPG, PNG or WebP. 2 MB max." />
          <div className="flex shrink-0 items-start gap-[8px]">
            {/* The real control is this input; the button is what it looks
                like. A bare file input cannot be styled to match the row, and
                replacing it with a scripted picker would lose the keyboard. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                // Cleared so that choosing the same file twice still counts as
                // a change; without it a cancelled crop cannot be reopened.
                event.target.value = '';
                if (file) setPicked(file);
              }}
            />
            <SecondaryButton
              disabled={!editable || avatar.busy}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload
            </SecondaryButton>
            <GhostButton
              disabled={!editable || avatar.busy || !avatar.url}
              onClick={() => {
                void avatar.remove();
              }}
            >
              Remove
            </GhostButton>
          </div>
        </div>

        <Row>
          <RowText title="Display name" hint="Shown on your cursor while collaborating" />
          <TextField
            label="Display name"
            value={displayName}
            onChange={(next) => {
              setFormError(null);
              setDisplayName(next);
            }}
            placeholder="Your name"
            disabled={!editable}
          />
        </Row>

        <Row>
          <RowText title="Email" hint="Sign-in address and invite destination" />
          {/* The design shows the address nowhere on this row — the button is
              the whole control, and the address itself lives in the account
              menu that opened this dialog. */}
          <SecondaryButton>Change</SecondaryButton>
        </Row>

        <Row>
          <RowText title="Username" hint="Used in board URLs and @mentions" />
          <TextField
            label="Username"
            value={username}
            onChange={setUsername}
            placeholder="username"
          />
        </Row>
      </Card>

      <GroupLabel>Presence</GroupLabel>
      <Card>
        <Row>
          <RowText title="Cursor colour" hint="Identifies you in real time on shared boards" />
          <div
            role="radiogroup"
            aria-label="Cursor colour"
            className="flex shrink-0 items-center gap-[9px]"
          >
            {/* The board's own palette rather than a second list of hexes, so
                the swatch is the colour collaborators will actually see — each
                entry carries a shade for each theme. Until one is picked the
                colour comes from the account id, and no swatch is marked. */}
            {PRESENCE_PALETTE.map((entry) => {
              const selected = entry.name === cursorColor;
              return (
                <button
                  key={entry.name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={entry.name}
                  disabled={!editable}
                  onClick={() => setCursorColor(entry.name)}
                  style={{ backgroundColor: theme === 'dark' ? entry.dark : entry.light }}
                  // The ring is drawn outside the circle rather than added to
                  // its size, so picking a colour cannot nudge the row. It
                  // takes the foreground colour so it reads against the card
                  // in either theme — near-white on dark, near-black on light.
                  className={`size-[22px] rounded-full focus-visible:outline-none disabled:opacity-60 ${
                    selected ? 'ring-2 ring-[var(--surface-fg)]' : ''
                  } focus-visible:ring-2 focus-visible:ring-[var(--surface-fg)]`}
                />
              );
            })}
          </div>
        </Row>
      </Card>
    </SettingsPane>
  );
}
