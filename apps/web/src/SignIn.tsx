import { type FormEvent, useState } from 'react';
import { authClient } from './lib/auth-client';
import { signInErrorMessage } from './lib/sign-in-error';

export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    const { error: refused } = await authClient.signIn.email({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    setSubmitting(false);
    if (refused) setError(signInErrorMessage(refused));
  }

  return (
    <main className="sign-in">
      <form className="sign-in__form" onSubmit={(e) => void onSubmit(e)}>
        <h1 className="sign-in__title">Sign in to Ping</h1>
        <label className="field">
          <span className="field__label">Email</span>
          <input
            className="field__input"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="field__input"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="sign-in__error" role="alert">
            {error}
          </p>
        )}
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
