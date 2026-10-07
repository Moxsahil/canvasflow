import { useEffect, useId, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { PRESENCE_PALETTE, type PresenceTheme } from '@canvasflow/canvas-engine';
import {
  normalizeUsername,
  USERNAME_MAX_LENGTH,
  usernameProblem,
  type CursorColor,
} from '@canvasflow/types';
import { initialsOf } from '@/lib/initials';
import { cn } from '@/lib/utils';
import {
  checkUsernames,
  type AvatarState,
  type Profile,
  type ProfileState,
  type UsernameCheck,
} from '../profile';
import { usernameCandidates } from '../profile/username-suggestions';
import { PhotoDialog } from './PhotoDialog';
import { useBand, useEscape } from './settings-frame';
import {
  Band,
  INLINE_ACTION,
  InlineTextField,
  ROW_INPUT,
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
 * The name and the username save when their own Save is pressed, the colour
 * the moment it is picked, and the photo once it has been positioned.
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
      <Band title="Identity">
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

        <UsernameField profile={profile} error={error} save={save} />
      </Band>

      <Band title="Presence">
        <CursorColour profile={profile} save={save} theme={theme} editable={editable} />
      </Band>
    </SettingsPage>
  );
}

/** How long typing has to pause before the field asks whether a name is free. */
const USERNAME_CHECK_DELAY_MS = 350;

/**
 * How long an answer about a name is trusted. Long enough that typing back to
 * a name answers at once and asks nothing; short enough that a name somebody
 * has since claimed does not read as free for long. The save decides anyway.
 */
const USERNAME_ANSWER_TTL_MS = 30_000;

interface RememberedAnswer {
  /** Why it cannot be had, or null for free. */
  problem: string | null;
  at: number;
}

/** Keep what the server said about each name it answered for. */
function rememberAnswers(answers: Map<string, RememberedAnswer>, results: UsernameCheck[]) {
  const at = Date.now();
  for (const result of results) {
    if (!result.username) continue;
    answers.set(result.username, {
      problem: result.available ? null : (result.problem ?? 'That username is taken.'),
      at,
    });
  }
}

/** What was said about a name, if it was said recently enough to go on. */
function recallAnswer(
  answers: Map<string, RememberedAnswer>,
  name: string,
): RememberedAnswer | null {
  const known = answers.get(name);
  return known && Date.now() - known.at < USERNAME_ANSWER_TTL_MS ? known : null;
}

/**
 * The username: a pill with the @ already in it, saved by its own tick.
 *
 * It is stored in lower case, so it is typed in lower case too: what is in the
 * field is what will be saved. Once typing pauses the field says whether the
 * name can be had — a rule it breaks, taken, or available. That answer is only
 * advice; the save is what decides, and says so if somebody took the name in
 * between.
 *
 * With none chosen yet, it starts with one made from their name or address, so
 * claiming a name can be a single press. Nobody is given one without pressing.
 *
 * Every answer is remembered for a while, so going back to a name already
 * checked costs nothing; the suggestion's fallbacks are asked about in the
 * same request as the suggestion, and remembered with it.
 */
function UsernameField({
  profile,
  error,
  save,
}: {
  profile: Profile | null;
  /** Why the last save failed, from the profile. Shown only for this field's own save. */
  error: string | null;
  save: ProfileState['save'];
}) {
  const id = useId();
  const band = useBand();
  const saved = profile?.username ?? '';
  const isGuest = profile?.isGuest ?? false;
  const editable = profile !== null && !isGuest;
  const personName = profile?.name ?? '';
  const personEmail = profile?.email ?? null;

  const [draft, setDraft] = useState(saved);
  const [suggested, setSuggested] = useState<string | null>(null);
  /** What was last found out about a name, and which name it was. */
  const [check, setCheck] = useState<{ name: string; problem: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const [focused, setFocused] = useState(false);
  const touched = useRef(false);
  const answers = useRef(new Map<string, RememberedAnswer>());

  // Follows the account when it changes elsewhere, until somebody types.
  useEffect(() => {
    if (!touched.current) setDraft(saved);
  }, [saved]);

  // Somebody with no username yet starts with the first free one of a few,
  // all asked about in one request.
  useEffect(() => {
    if (saved || !editable) return;
    const candidates = usernameCandidates({ name: personName, email: personEmail });
    if (candidates.length === 0) return;
    const controller = new AbortController();
    checkUsernames(candidates, controller.signal)
      .then((results) => {
        rememberAnswers(answers.current, results);
        const free = results.find((result) => result.available)?.username;
        if (touched.current || !free) return;
        setSuggested(free);
        setDraft(free);
      })
      // An empty field asks for nothing; it is only missing a head start.
      .catch(() => {});
    return () => controller.abort();
  }, [saved, editable, personName, personEmail]);

  const name = normalizeUsername(draft);
  const dirty = name !== saved;
  // A username can be changed but not taken away again.
  const ruleBroken = dirty ? (name ? usernameProblem(name) : 'Username is required.') : null;

  useEffect(() => {
    if (!dirty || !editable) return;
    // Already asked, and recently: answered at once, with no request.
    const known = ruleBroken ? null : recallAnswer(answers.current, name);
    if (known) {
      setCheck({ name, problem: known.problem });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (ruleBroken) {
        setCheck({ name, problem: ruleBroken });
        return;
      }
      checkUsernames([name], controller.signal)
        .then((results) => {
          rememberAnswers(answers.current, results);
          const answered = recallAnswer(answers.current, name);
          if (answered) setCheck({ name, problem: answered.problem });
        })
        // Offline or overtaken by the next keystroke: the save will still say.
        .catch(() => {});
    }, USERNAME_CHECK_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, dirty, editable, ruleBroken]);

  // Only an answer about the name in the field now. Until one comes, the hint.
  const answer = dirty && check?.name === name ? check : null;

  const revert = () => {
    touched.current = false;
    setDraft(saved);
    setRefused(false);
  };

  const claim = async () => {
    if (busy || !dirty || !editable || answer?.problem) return;
    if (ruleBroken) {
      setCheck({ name, problem: ruleBroken });
      return;
    }
    setBusy(true);
    band?.clear();
    const kept = await save({ username: name });
    setBusy(false);
    setRefused(!kept);
    // Whatever was remembered about it was wrong, or is now; ask again next time.
    if (!kept) {
      answers.current.delete(name);
      return;
    }
    touched.current = false;
    setDraft(name);
    band?.saved();
  };

  useEscape(focused && dirty && !busy ? revert : null);

  const problem = refused ? error : (answer?.problem ?? null);
  const hint = problem ? (
    <span role="alert" className="text-[var(--surface-danger)]">
      {problem}
    </span>
  ) : answer ? (
    <span className="text-[var(--surface-ok)]">
      {name === suggested ? 'Suggested for you, and available' : 'Available'}
    </span>
  ) : isGuest ? (
    'Create an account to choose a username'
  ) : (
    'Yours alone across Canvasflow'
  );

  return (
    <StackedField setting="username" label="Username" htmlFor={id} hint={hint}>
      <span className="relative inline-flex items-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[12px] text-[12.5px] text-[var(--surface-fg-muted)]"
        >
          @
        </span>
        <input
          id={id}
          type="text"
          value={draft}
          placeholder="username"
          disabled={!editable}
          maxLength={USERNAME_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={problem ? true : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            const field = event.target;
            const typed = field.value;
            const next = typed.replace(/^@+/, '').toLowerCase();
            if (next !== typed) {
              // Written into the field here, caret and all, so that React finds
              // it already says this and leaves the caret where it was rather
              // than sending it to the end.
              const at = Math.max(
                0,
                (field.selectionStart ?? typed.length) - (typed.length - next.length),
              );
              field.value = next;
              field.setSelectionRange(at, at);
            }
            touched.current = true;
            setDraft(next);
            setSuggested(null);
            setRefused(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void claim();
            }
          }}
          className={cn(
            ROW_INPUT,
            'pl-[25px]',
            dirty && editable && 'pr-[60px]',
            problem && 'border-[var(--surface-danger-border)]',
          )}
        />
        {dirty && editable && (
          <span className="absolute right-[4px] flex gap-[2px]">
            <button
              type="button"
              aria-label="Cancel"
              title="Cancel"
              disabled={busy}
              onClick={revert}
              className={INLINE_ACTION}
            >
              <X className="size-[14px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={busy ? 'Saving…' : 'Save'}
              title="Save"
              disabled={busy || ruleBroken !== null || Boolean(answer?.problem)}
              onClick={() => void claim()}
              className={cn(INLINE_ACTION, 'text-[var(--surface-accent)]')}
            >
              <Check className="size-[14px]" aria-hidden="true" />
            </button>
          </span>
        )}
      </span>
    </StackedField>
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
            className="size-[32px] shrink-0 rounded-full object-cover"
          />
        ) : (
          // One letter per name, as the share dialog's access list abbreviates people.
          <div className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-accent)] text-[11px] font-semibold text-[var(--surface-on-accent)]">
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
