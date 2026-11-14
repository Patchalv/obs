import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { authClient } from './lib/auth-client';
import { SignIn } from './SignIn';

function useServerReachable(): boolean {
  const [reachable, setReachable] = useState(true);
  useEffect(() => {
    api.healthz
      .$get()
      .then((res) => setReachable(res.ok))
      .catch(() => setReachable(false));
  }, []);
  return reachable;
}

export function App() {
  const reachable = useServerReachable();
  const { data: session, isPending } = authClient.useSession();

  return (
    <>
      {!reachable && (
        <p className="banner" role="alert">
          Can’t reach the Ping server. Check your connection, then reload.
        </p>
      )}
      {isPending ? null : session ? <SignedIn name={session.user.name} /> : <SignIn />}
    </>
  );
}

/** Placeholder until the inbox exists. */
function SignedIn({ name }: { name: string }) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    setSigningOut(false);
  }

  return (
    <main className="home">
      <header className="home__bar">
        <span className="home__brand">Ping</span>
        <button
          className="button"
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          Sign out
        </button>
      </header>
      <section className="home__body">
        <h1 className="home__greeting">Signed in as {name}</h1>
        <p className="home__note">Channels, Threads and Pings arrive in the next slices.</p>
      </section>
    </main>
  );
}
