import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Editor } from './Editor';
import { UpgradeCompletePage } from './billing/UpgradeCompletePage';
import { UpgradePage } from './billing/UpgradePage';
import { useT } from './i18n';
import {
  LOCAL_BOARD_ID,
  accountWasHere,
  findLandingBoard,
  forgetAccountHere,
  noteCarry,
} from './local';
import { useAppTheme } from './theme';
import { BoardLoading } from './ui/BoardLoading';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/boards/:boardId" element={<EditorRoute />} />
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="/upgrade/complete" element={<UpgradeCompletePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/**
 * The editor's own address: the account's own board for someone signed in,
 * the board kept in this browser for everyone else.
 *
 * A browser no account has been in opens the local board at once — a first
 * visit, a search engine, someone who signed out. One that has had an account
 * asks the gateway first, which renews the session if it needs to; while it
 * answers the pencil loader shows, rather than a board it may leave.
 * Signed in, it goes to that account's board, bringing along anything new on
 * the local board (see carry.ts). Signed out, the local board opens. With no
 * answer at all — offline, say — the local board opens and the note stays, so
 * the next visit asks again.
 */
function HomeRoute() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(accountWasHere);

  useEffect(() => {
    if (!checking) return;
    let cancelled = false;
    void findLandingBoard().then((answer) => {
      if (cancelled) return;
      if (answer.status === 'signed-in') {
        // Copied across only if the local board has something not yet in
        // the account; the account's editor decides, and says so.
        noteCarry();
        navigate(`/boards/${answer.boardId}`, { replace: true });
        return;
      }
      if (answer.status === 'signed-out') forgetAccountHere();
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [checking, navigate]);

  if (checking) return <Opening />;
  return <Editor key={LOCAL_BOARD_ID} boardId={LOCAL_BOARD_ID} local />;
}

/** While the address decides which board to open, on the theme's own background. */
function Opening() {
  useAppTheme();
  return <BoardLoading />;
}

function EditorRoute() {
  const t = useT();
  const { boardId } = useParams<{ boardId: string }>();
  if (!boardId) {
    return <div>{t('app.invalidBoardUrl')}</div>;
  }
  // Keyed by board so switching boards from the sidebar remounts the editor
  // rather than re-pointing it: the camera, the tool machine, the undo stack
  // and the sync connection all belong to the board that built them.
  return <Editor key={boardId} boardId={boardId} />;
}
