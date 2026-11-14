import { useEffect, useState } from 'react';
import { api } from './lib/api';

type ServerState = 'checking' | 'ok' | 'unreachable';

export function App() {
  const [server, setServer] = useState<ServerState>('checking');

  useEffect(() => {
    api.healthz
      .$get()
      .then(async (res) => {
        const body = await res.json();
        setServer(body.status === 'ok' ? 'ok' : 'unreachable');
      })
      .catch(() => setServer('unreachable'));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Ping</h1>
      <p>Placeholder page. Server: {server}</p>
    </main>
  );
}
