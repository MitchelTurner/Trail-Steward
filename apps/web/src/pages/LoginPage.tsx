import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { buttonClass, inputClass } from '../ui';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.');
    }
  }

  if (sent)
    return (
      <p>If this email is an editor, a sign-in link is on the way. It expires in 15 minutes.</p>
    );

  return (
    <form className="max-w-md space-y-3" onSubmit={(event) => void submit(event)}>
      <h1 className="text-2xl font-semibold text-navy">Sign in</h1>
      <label className="block text-sm">
        <span className="font-medium text-navy">Email</span>
        <input
          className={inputClass}
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {error ? <p className="text-stale">{error}</p> : null}
      <button className={buttonClass()} type="submit">
        Email me a link
      </button>
    </form>
  );
}
