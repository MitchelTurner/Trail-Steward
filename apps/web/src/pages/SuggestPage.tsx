import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { buttonClass, inputClass } from '../ui';

export function SuggestPage() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [fax, setFax] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/suggestions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: params.get('type') || 'general',
          targetId: params.get('id') || undefined,
          message,
          proposedUrl: url,
          submitterName: name,
          submitterEmail: email,
          fax,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.');
    }
  }

  if (done) return <p>Thank you. An editor will look at this.</p>;

  return (
    <form className="max-w-xl space-y-3" onSubmit={(event) => void submit(event)}>
      <h1 className="text-2xl font-semibold text-navy">Suggest a correction</h1>
      <label className="block text-sm">
        <span className="font-medium text-navy">What should change?</span>
        <textarea
          className={inputClass}
          required
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-navy">A better link, if you have one</span>
        <input
          className={inputClass}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-navy">Your name (optional)</span>
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-navy">Your email (optional)</span>
        <input
          className={inputClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="absolute left-[-9999px]" aria-hidden="true">
        Fax
        <input
          tabIndex={-1}
          autoComplete="off"
          value={fax}
          onChange={(event) => setFax(event.target.value)}
        />
      </label>
      {error ? <p className="text-stale">{error}</p> : null}
      <button className={buttonClass()} type="submit">
        Send
      </button>
    </form>
  );
}
