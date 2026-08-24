import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Editor } from './Editor';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/boards/:boardId" element={<EditorRoute />} />
        <Route path="*" element={<Navigate to="/boards/dev-local" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function EditorRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  if (!boardId) {
    return <div>Invalid board URL</div>;
  }
  // Keyed by board so switching boards from the sidebar remounts the editor
  // rather than re-pointing it: the camera, the tool machine, the undo stack
  // and the sync connection all belong to the board that built them.
  return <Editor key={boardId} boardId={boardId} />;
}
