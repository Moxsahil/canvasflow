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
  return <Editor boardId={boardId} />;
}
