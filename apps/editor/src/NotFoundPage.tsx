import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { NotFoundBoard } from '@canvasflow/ui/not-found-board';
import { useT } from './i18n';

/** An address in the editor that leads nowhere. */
export function NotFoundPage() {
  const t = useT();

  useEffect(() => {
    document.title = `${t('notFound.pageTitle')} — CanvasFlow`;
  }, [t]);

  return (
    <NotFoundBoard
      title={t('notFound.title')}
      body={t('notFound.body')}
      action={{ href: '/', label: t('notFound.back') }}
      labels={{
        shapes: t('notFound.shapes'),
        toolbar: t('notFound.toolbar'),
        drawing: t('notFound.drawing'),
      }}
      renderAction={(children, style) => (
        <Link to="/" style={style}>
          {children}
        </Link>
      )}
    />
  );
}
