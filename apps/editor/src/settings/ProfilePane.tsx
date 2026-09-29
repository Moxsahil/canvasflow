import { useEffect, useRef, useState } from 'react';
import { PRESENCE_PALETTE, type PresenceTheme } from '@canvasflow/canvas-engine';
import type { CursorColor } from '@canvasflow/types';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';
import type { AvatarState, Profile, ProfileState } from '../profile';
import { PhotoDialog } from './PhotoDialog';
import { useBand } from './settings-frame';
import {
  Band,
  ComingSoonTag,
  INPUT,
  InlineTextField,
  SettingRow,
  SettingsButton,
  SettingsPage,
  StackedField,
} from './settings-ui';

interface ProfilePaneProps {
  /** Seeds the name before the profile arrives. Null until the token decodes. */
  user: { name: string; email: string | null } | null;
  /** The account's saved profile, and the way to write to it. */
  account: ProfileState;
  /** The photo, which is stored as bytes rather than as a profile field. */
  avatar: AvatarState;
  /** Each palette colour has a shade per theme; this picks which one is drawn. */
  theme: PresenceTheme;
}

/**
 * Profile: how you appear to the people you share a board with.
 *
 * The name saves when its own Save is pressed, the colour the moment it is
 * picked, and the photo once it has been positioned. The username has nowhere
 * to be saved yet and says so.
 *
 * A guest has no profile to write to, so the live fields are disabled rather
 * than offering a save that would be refused.
 */
export function ProfilePane({ user, account, avatar, theme }: ProfilePaneProps) {
  const { profile, error, save } = account;
  const savedName = profile?.name ?? (user?.name?.trim() || 'Account');
  const editable = profile !== null;

  // The file waiting to be positioned. Set by the picker, cleared when the
  // photo dialog is done with it either way.
  const [picked, setPicked] = useState<File | null>(null);
  // Set when a photo went up from the dialog, so the band can say so.
  const [photoSaved, setPhotoSaved] = useState(false);

  /** What this page refused to send, as against what the server refused. */
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [nameRefused, setNameRefused] = useState(false);

  const saveName = async (next: string) => {
    // An emptied field is a mistake, not a request to be nameless.
    if (next.length === 0) {
      setNameProblem('Display name is required.');
      return false;
    }
    const saved = await save({ name: next });
    setNameRefused(!saved);
    return saved;
  };

  return (
    <SettingsPage
      lead="How you appear to collaborators on shared boards."
      dialog={
        picked && (
          <PhotoDialog
            key="photo"
            file={picked}
            busy={avatar.busy}
            error={avatar.error}
            onCancel={() => setPicked(null)}
            onUse={(blob, mimeType) => {
              void avatar.upload(blob, mimeType).then((uploaded) => {
                // Left open on failure, with the reason under it, so the photo
                // that was just positioned is not lost to a retry.
                if (!uploaded) return;
                setPhotoSaved(true);
                setPicked(null);
              });
            }}
          />
        )
      }
    >
      <Band title="Identity" description="Your photo, your name and the handle people @mention.">
        <PhotoRow
          avatar={avatar}
          name={savedName}
          editable={editable}
          announce={photoSaved}
          onAnnounced={() => setPhotoSaved(false)}
          onPick={setPicked}
        />

        <InlineTextField
          setting="display-name"
          label="Display name"
          hint="Shown on your cursor while collaborating"
          value={savedName}
          placeholder="Your name"
          maxLength={80}
          disabled={!editable}
          onSave={saveName}
          error={nameProblem ?? (nameRefused ? error : null)}
          onEdit={() => {
            setNameProblem(null);
            setNameRefused(false);
          }}
        />

        {/* It says what it is for once it exists, and that it does not yet. */}
        <StackedField
          setting="username"
          label="Username"
          htmlFor="settings-username"
          badge={<ComingSoonTag />}
          hint="Will name you in @mentions and shorter board links"
        >
          <input
            id="settings-username"
            type="text"
            value=""
            placeholder="username"
            aria-label="Username"
            disabled
            readOnly
            className={INPUT}
          />
        </StackedField>
      </Band>

      <Band title="Presence" description="How other people pick you out on a board.">
        <CursorColour profile={profile} save={save} theme={theme} editable={editable} />
      </Band>
    </SettingsPage>
  );
}

/** The photo and the ways to change it. Upload opens the dialog that positions it. */
function PhotoRow({
  avatar,
  name,
  editable,
  announce,
  onAnnounced,
  onPick,
}: {
  avatar: AvatarState;
  name: string;
  editable: boolean;
  /** A photo just went up from the dialog: say so once. */
  announce: boolean;
  onAnnounced: () => void;
  onPick: (file: File) => void;
}) {
  const band = useBand();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A photo that will not load leaves the letters showing rather than a broken
  // image. Sign-in providers issue a URL even for an account that never set a
  // picture, and those are the ones that fail.
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [avatar.url]);

  useEffect(() => {
    if (!announce) return;
    band?.saved();
    onAnnounced();
  }, [announce, band, onAnnounced]);

  return (
    <SettingRow
      setting="photo"
      title="Profile photo"
      hint="JPG, PNG or WebP. 2 MB max."
      leading={
        avatar.url && !photoFailed ? (
          <img
            src={avatar.url}
            alt=""
            onError={() => setPhotoFailed(true)}
            className="size-[40px] shrink-0 rounded-full object-cover"
          />
        ) : (
          // One letter per name, as the share dialog's access list abbreviates people.
          <div className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-wash)] text-[13px] font-medium text-[var(--surface-fg-muted)]">
            {initialsOf(name)}
          </div>
        )
      }
    >
      {/* The real control is this input; the button is what it looks like. A
          bare file input cannot be styled to match the row, and replacing it
          with a scripted picker would lose the keyboard. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          // Cleared so that choosing the same file twice still counts as a
          // change; without it a cancelled crop cannot be reopened.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
      <SettingsButton
        disabled={!editable || avatar.busy}
        onClick={() => fileInputRef.current?.click()}
      >
        Upload
      </SettingsButton>
      <SettingsButton
        variant="ghost"
        disabled={!editable || avatar.busy || !avatar.url}
        onClick={() => {
          void avatar.remove().then((removed) => {
            if (removed) band?.saved();
            else band?.failed(avatar.error ?? 'That did not go through. Try again.');
          });
        }}
      >
        Remove
      </SettingsButton>
    </SettingRow>
  );
}

/**
 * The swatches, which save as they are picked.
 *
 * They are the board's own palette rather than a second list of hexes, so the
 * swatch is the colour collaborators actually see. Until one is picked the
 * colour comes from the account id, and no swatch is marked.
 */
function CursorColour({
  profile,
  save,
  theme,
  editable,
}: {
  profile: Profile | null;
  save: ProfileState['save'];
  theme: PresenceTheme;
  editable: boolean;
}) {
  const band = useBand();
  const saved = profile?.cursorColor ?? null;
  const [picked, setPicked] = useState<CursorColor | null>(saved);
  const [busy, setBusy] = useState(false);

  // Follows the account when it changes elsewhere, but never mid-save.
  useEffect(() => {
    if (!busy) setPicked(saved);
  }, [saved, busy]);

  const choose = async (next: CursorColor) => {
    if (next === picked || busy) return;
    const before = picked;
    setPicked(next);
    setBusy(true);
    band?.clear();
    const kept = await save({ cursorColor: next });
    setBusy(false);
    if (kept) {
      band?.saved();
    } else {
      setPicked(before);
      band?.failed('That colour did not save. Try again.');
    }
  };

  return (
    <StackedField
      setting="cursor-colour"
      label="Cursor colour"
      hint="Identifies you in real time on shared boards"
    >
      <div
        role="radiogroup"
        aria-label="Cursor colour"
        className="flex items-center gap-[8px] py-[3px] pl-[3px]"
      >
        {PRESENCE_PALETTE.map((entry) => {
          const selected = entry.name === picked;
          return (
            <button
              key={entry.name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={entry.name}
              disabled={!editable}
              onClick={() => void choose(entry.name)}
              style={{ backgroundColor: theme === 'dark' ? entry.dark : entry.light }}
              // The ring is drawn outside the circle rather than added to its
              // size, so picking a colour cannot nudge the row. It takes the
              // foreground colour so it reads in either theme.
              className={cn(
                'size-[20px] rounded-full ring-offset-2 ring-offset-[var(--surface-panel)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-60',
                selected && 'ring-2 ring-[var(--surface-fg)]',
              )}
            />
          );
        })}
      </div>
    </StackedField>
  );
}
