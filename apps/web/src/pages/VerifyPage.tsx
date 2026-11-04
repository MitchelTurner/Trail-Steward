import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('This sign-in link is not valid.');
      return;
    }
    api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) })
      .then(() => navigate('/admin'))
      .catch(() => setError('This sign-in link is not valid.'));
  }, [params, navigate]);

  return <p>{error || 'Signing you in…'}</p>;
}
