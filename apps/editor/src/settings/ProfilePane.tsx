import { useState } from 'react';
import { CURSOR_COLORS } from './settings-sections';
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
  /** Seeds the fields. Null until the token decodes, as elsewhere. */
  user: { name: string; email: string | null } | null;
  onClose: () => void;
}

/**
 * Profile: how you appear to the people you share a board with.
 *
 * Nothing here persists yet. The fields hold their edits for as long as the
 * dialog is open and are dropped when it closes — there is no profile endpoint
 * to send them to, and a Save that silently did nothing would be worse than one
 * that plainly closes.
 */
export function ProfilePane({ user, onClose }: ProfilePaneProps) {
  const name = user?.name?.trim() || 'Account';

  const [displayName, setDisplayName] = useState(name);
  const [username, setUsername] = useState('');
  const [cursorColor, setCursorColor] = useState<string>(CURSOR_COLORS[0]);

  return (
    <SettingsPane
      title="Profile"
      subtitle="How you appear to collaborators on shared boards."
      onClose={onClose}
    >
      <GroupLabel>Identity</GroupLabel>
      <Card>
        {/* The avatar row is taller than the rest — 16px of padding against
            their 15px — because the 52px circle sets the height. */}
        <div className="flex w-full items-center gap-[16px] px-[18px] py-[16px]">
          <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--settings-accent)] text-[20px] font-semibold text-[var(--settings-on-accent)]">
            {name.charAt(0).toUpperCase()}
          </div>
          <RowText title="Profile photo" hint="JPG, PNG or GIF. 2 MB max." />
          <div className="flex shrink-0 items-start gap-[8px]">
            <SecondaryButton>Upload</SecondaryButton>
            <GhostButton>Remove</GhostButton>
          </div>
        </div>

        <Row>
          <RowText title="Display name" hint="Shown on your cursor while collaborating" />
          <TextField
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Your name"
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
            {CURSOR_COLORS.map((color) => {
              const selected = color === cursorColor;
              return (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={color}
                  onClick={() => setCursorColor(color)}
                  style={{ backgroundColor: color }}
                  // The ring is drawn outside the circle rather than added to
                  // its size, so picking a colour cannot nudge the row. It
                  // takes the foreground colour so it reads against the card
                  // in either theme — near-white on dark, near-black on light.
                  className={`size-[22px] rounded-full focus-visible:outline-none ${
                    selected ? 'ring-2 ring-[var(--settings-fg)]' : ''
                  } focus-visible:ring-2 focus-visible:ring-[var(--settings-fg)]`}
                />
              );
            })}
          </div>
        </Row>
      </Card>
    </SettingsPane>
  );
}
