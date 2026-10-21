import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/elements/thread.aui';
import { useT } from '../i18n';
import type { DiagramEntry } from './diagram-history';
import type { DiagramRun } from './useDiagramPanel';

/** The id of the answer that stands for the diagram being written. */
export const RUN_ANSWER = 'run';
/** The id of the answer that carries a notice (the month used up, and so on). */
export const NOTICE_ANSWER = 'notice';

const AnswerContext = createContext<(id: string) => ReactNode>(() => null);
const RequestContext = createContext<(id: string) => ReactNode>(() => null);
const WelcomeContext = createContext<ReactNode>(null);

/**
 * The conversation in the diagrams panel: each request as the user's message,
 * each diagram as the answer to it. The words are the thread's; every answer
 * is drawn by `answer`, given the answer's id — an entry's id, RUN_ANSWER or
 * NOTICE_ANSWER — and the actions under each request by `request`, given the
 * same id. The box to ask in stays the panel's own, below the thread.
 */
export function DiagramThread({
  entries,
  run,
  notice,
  answer,
  request,
  welcome,
}: {
  entries: readonly DiagramEntry[];
  run: DiagramRun | null;
  /** Whether there is a notice to show after the conversation. */
  notice: boolean;
  answer: (id: string) => ReactNode;
  request: (id: string) => ReactNode;
  /** What an empty conversation shows. */
  welcome: ReactNode;
}) {
  const t = useT();
  const changeLabel = t('diagrams.changeLabel');

  const messages = useMemo(() => {
    const asked = (id: string, description: string, change: boolean): ThreadMessageLike => ({
      id: `${id}:ask`,
      role: 'user',
      content: description,
      ...(change ? { metadata: { custom: { label: changeLabel } } } : {}),
    });
    const answered = (id: string, running = false): ThreadMessageLike => ({
      id,
      role: 'assistant',
      content: [],
      status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
    });
    const list: ThreadMessageLike[] = entries.flatMap((entry) => [
      asked(entry.id, entry.description, Boolean(entry.changeOf)),
      answered(entry.id),
    ]);
    if (run) {
      list.push(
        asked(RUN_ANSWER, run.description, Boolean(run.changeOf)),
        answered(RUN_ANSWER, run.status === 'running'),
      );
    }
    if (notice) list.push(answered(NOTICE_ANSWER));
    return list;
  }, [entries, run, notice, changeLabel]);

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    isRunning: run?.status === 'running',
    convertMessage: (message) => message,
    // Asking goes through the panel's own box, never the thread's.
    onNew: async () => {},
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AnswerContext.Provider value={answer}>
        <RequestContext.Provider value={request}>
          <WelcomeContext.Provider value={welcome}>
            <Thread
              composer={null}
              autoFocus={false}
              branches={false}
              maxWidth="60rem"
              components={{ AssistantMessage: Answer, UserActions: Request, Welcome }}
              labels={{
                scrollToBottom: t('diagrams.scrollToBottom'),
                showMore: t('diagrams.showMore'),
                showLess: t('diagrams.showLess'),
              }}
            />
          </WelcomeContext.Provider>
        </RequestContext.Provider>
      </AnswerContext.Provider>
    </AssistantRuntimeProvider>
  );
}

function Answer() {
  const answer = useContext(AnswerContext);
  const id = useAuiState((s) => s.message.id);
  return (
    <MessagePrimitive.Root data-role="assistant" className="min-w-0 px-2">
      {answer(id)}
    </MessagePrimitive.Root>
  );
}

function Request() {
  const request = useContext(RequestContext);
  const id = useAuiState((s) => s.message.id);
  return request(id.replace(/:ask$/, ''));
}

function Welcome() {
  return <div className="mb-6 px-2">{useContext(WelcomeContext)}</div>;
}
