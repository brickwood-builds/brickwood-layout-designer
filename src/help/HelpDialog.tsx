import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { HELP_CONTEXT, HELP_TOPICS, findTopics, type HelpContext } from './topics';

/** Searchable help, opened on the topic for the current screen. */
export function HelpDialog({ context, onClose }: { context: HelpContext; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [topicId, setTopicId] = useState<string>(HELP_CONTEXT[context]);
  const results = findTopics(query);
  const topic = HELP_TOPICS.find((t) => t.id === topicId) ?? HELP_TOPICS[0]!;
  return (
    <Modal title="Help" onClose={onClose} wide>
      <div className="help">
        <nav className="help-nav" aria-label="Help topics">
          <input type="search" placeholder="Search help" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search help" />
          <ul>
            {results.map((t) => (
              <li key={t.id}>
                <button type="button" className={t.id === topic.id ? 'link current' : 'link'} onClick={() => setTopicId(t.id)}>
                  {t.title}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="muted">No topics match.</li>}
          </ul>
        </nav>
        <article className="help-body" aria-label={topic.title}>
          <h3>{topic.title}</h3>
          {topic.body.map((p, i) => (p.startsWith('• ') ? <p key={i} className="bullet">{p.slice(2)}</p> : <p key={i}>{p}</p>))}
        </article>
      </div>
    </Modal>
  );
}

/** "?" button plus the ? / F1 shortcut. */
export function HelpButton({ context }: { context: HelpContext }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select') || document.querySelector('dialog[open]')) return;
      if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button type="button" className="help-btn" aria-label="Help" title="Help (?)" onClick={() => setOpen(true)}>
        ?
      </button>
      {open && <HelpDialog context={context} onClose={() => setOpen(false)} />}
    </>
  );
}
