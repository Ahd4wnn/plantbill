import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

export const Login = () => {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // If already signed in, redirect to home page
  if (session) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err: any) {
      console.error('Login submission failed:', err);
      setError('Wrong email or password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center py-12">
      <div className="text-center mb-8 select-none">
        <h1 className="text-4xl font-extrabold text-accent tracking-tight mb-2">PlantBill</h1>
        <p className="text-text-secondary text-base">Shop Invoicing made simple</p>
      </div>

      <Card>
        <h2 className="text-xl font-bold text-text-primary mb-6">Sign in</h2>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-input text-danger text-sm font-semibold leading-relaxed">
              {error}
            </div>
          )}

          <Input
            label="Email address"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />

          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />

          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default Login;
