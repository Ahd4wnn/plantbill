import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MoneyInput } from '../components/MoneyInput';
import { apiGet, apiPost } from '../lib/api';
import { formatRupees } from '../lib/utils';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../context/AuthContext';

interface SessionSummary {
  bill_count: number;
  revenue: number;
  cash_total: number;
  upi_total: number;
  expense_total: number;
}

interface CurrentSessionResponse {
  id: string;
  opened_by: string;
  status: 'open' | 'closed';
  opening_balance: number;
  closing_balance: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  summary: SessionSummary;
}

interface CloseReconciliationResult {
  session: {
    closing_balance: number;
  };
  expected_cash: number;
  variance: number;
}

export const Home = () => {
  const { role } = useAuth();
  const [sessionData, setSessionData] = useState<CurrentSessionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // State A inputs
  const [openingBalance, setOpeningBalance] = useState<string>('');

  // End of Day Modal state
  const [showCloseModal, setShowCloseModal] = useState<boolean>(false);
  const [closingInput, setClosingInput] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [closeReconciliation, setCloseReconciliation] = useState<CloseReconciliationResult | null>(null);

  const navigate = useNavigate();

  // Fetch current session
  const fetchCurrentSession = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet('/api/sessions/current');
      setSessionData(data);
    } catch (err: any) {
      console.error('Failed to resolve active day session:', err);
      setError('Could not retrieve the register session status. Please try refreshing.');
    }
  }, []);

  useEffect(() => {
    fetchCurrentSession().finally(() => setLoading(false));
  }, [fetchCurrentSession]);

  // Handle Opening Register (State A)
  const handleOpenSession = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsedBalance = parseFloat(openingBalance);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      setError('Please enter a valid cash amount (₹0.00 or higher) to start.');
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/api/sessions/open', {
        opening_balance: parsedBalance,
        notes: 'Session started'
      });
      setOpeningBalance('');
      await fetchCurrentSession();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to start the day register.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Closing Register Confirmation
  const handleCloseSession = async () => {
    setError(null);

    const parsedClosing = parseFloat(closingInput);
    if (isNaN(parsedClosing) || parsedClosing < 0) {
      setError('Please enter a valid cash amount for counting.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiPost('/api/sessions/close', {
        closing_balance: parsedClosing,
        notes: closingNotes.trim() || undefined
      });
      setCloseReconciliation(data);
      setShowCloseModal(false);
      setClosingInput('');
      setClosingNotes('');
      await fetchCurrentSession();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to close the day register.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  // Final Close Summary Success Screen
  if (closeReconciliation) {
    const { session, expected_cash, variance } = closeReconciliation;
    return (
      <div className="flex flex-col gap-6 pt-4">
        <Card className="text-center select-none">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-accent">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Register Closed</h1>
          <p className="text-text-secondary text-sm mb-6">The register session has been closed successfully.</p>
          
          <div className="bg-background border border-border rounded-input p-5 flex flex-col gap-3 text-left mb-6">
            <div className="flex justify-between items-center text-sm font-medium">
              <span className="text-text-secondary">Expected Cash:</span>
              <span className="text-text-primary">{formatRupees(expected_cash)}</span>
            </div>
            <div className="flex justify-between items-center text-sm font-medium">
              <span className="text-text-secondary">Counted Cash:</span>
              <span className="text-text-primary">{formatRupees(session.closing_balance)}</span>
            </div>
            <div className="h-px bg-border my-1" />
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-text-secondary">Difference:</span>
              <span className={`text-base font-bold ${variance === 0 ? 'text-accent' : variance > 0 ? 'text-accent' : 'text-danger'}`}>
                {variance > 0 ? '+' : ''}{formatRupees(variance)}
                <span className="text-xs font-semibold block text-right mt-0.5">
                  {variance === 0 ? 'Matches expected' : variance > 0 ? 'Extra cash' : 'Short'}
                </span>
              </span>
            </div>
          </div>

          <Button variant="primary" onClick={() => setCloseReconciliation(null)}>
            Close and return
          </Button>
        </Card>
      </div>
    );
  }

  // Render modal to count cash
  if (showCloseModal && sessionData) {
    const openingBal = Number(sessionData.opening_balance) || 0;
    const cashSales = Number(sessionData.summary.cash_total) || 0;
    const expensesToday = Number(sessionData.summary.expense_total) || 0;
    const expectedCash = openingBal + cashSales - expensesToday;
    const parsedClosing = parseFloat(closingInput) || 0;
    const difference = parsedClosing - expectedCash;

    return (
      <div className="flex flex-col gap-6 pt-4">
        <Card>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-text-primary">End the day</h2>
            <button 
              className="text-text-secondary text-sm font-bold hover:underline"
              onClick={() => {
                setShowCloseModal(false);
                setClosingInput('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>

          {error && (
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-input text-danger text-sm font-semibold mb-5 leading-relaxed">
              {error}
            </div>
          )}

          <div className="bg-background border border-border rounded-input p-5 flex flex-col gap-3 mb-6 select-none">
            <div className="flex justify-between items-center text-sm font-medium">
              <span className="text-text-secondary">Opening Cash:</span>
              <span className="text-text-primary">{formatRupees(openingBal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm font-medium">
              <span className="text-text-secondary">Cash Collected:</span>
              <span className="text-text-primary">{formatRupees(cashSales)}</span>
            </div>
            <div className="flex justify-between items-center text-sm font-medium">
              <span className="text-text-secondary">Expenses Today:</span>
              <span className="text-danger">-{formatRupees(expensesToday)}</span>
            </div>
            <div className="h-px bg-border my-1" />
            <div className="flex justify-between items-center text-base font-bold">
              <span className="text-text-secondary">Expected Cash:</span>
              <span className="text-text-primary">{formatRupees(expectedCash)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <MoneyInput
              label="Count the cash in the drawer and enter it here"
              placeholder="0.00"
              value={closingInput}
              onChange={(e) => setClosingInput(e.target.value)}
              disabled={submitting}
            />

            {closingInput !== '' && (
              <div className="p-4 bg-background border border-border rounded-input flex justify-between items-center select-none">
                <span className="text-sm font-medium text-text-secondary">Difference:</span>
                <span className={`text-base font-bold ${difference === 0 ? 'text-accent' : difference > 0 ? 'text-accent' : 'text-danger'}`}>
                  {difference === 0 ? (
                    'Matches expected'
                  ) : difference > 0 ? (
                    `${formatRupees(difference)} extra`
                  ) : (
                    `${formatRupees(Math.abs(difference))} short`
                  )}
                </span>
              </div>
            )}

            <div className="p-4 bg-danger/5 border border-danger/10 rounded-input text-text-secondary text-sm leading-relaxed mb-1">
              <strong>Caution:</strong> Closing the day is permanent. Ensure all bills are saved before proceeding.
            </div>

            <div className="flex flex-col gap-3">
              <Button 
                variant="primary" 
                onClick={handleCloseSession}
                disabled={submitting || !closingInput}
              >
                {submitting ? 'Closing Day...' : 'Yes, end the day'}
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => {
                  setShowCloseModal(false);
                  setClosingInput('');
                  setError(null);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // STATE A — NO OPEN DAY ("Start the day")
  if (!sessionData) {
    return (
      <div className="flex flex-col gap-6 pt-4">
        {error && (
          <div className="p-4 bg-danger/10 border border-danger/20 rounded-input text-danger text-sm font-semibold leading-relaxed">
            {error}
          </div>
        )}

        <Card>
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight mb-2">Start the day</h1>
          <p className="text-text-secondary text-base mb-6 leading-relaxed">
            Enter the cash in the drawer to begin.
          </p>

          <form onSubmit={handleOpenSession} className="flex flex-col gap-5">
            <MoneyInput
              label="Opening balance (cash)"
              placeholder="0.00"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              disabled={submitting}
            />

            <Button type="submit" disabled={submitting}>
              {submitting ? 'Starting...' : 'Start the day'}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // STATE B — DAY IS OPEN (the daily dashboard)
  const sessionDate = new Date(sessionData.opened_at).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="flex flex-col gap-6 pt-4">
      {error && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-input text-danger text-sm font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {/* Header and status pill */}
      <div className="flex items-center justify-between select-none">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Dashboard</span>
          <h1 className="text-lg font-bold text-text-primary mt-0.5">{sessionDate}</h1>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-accent/10 text-accent border border-accent/20">
          Open
        </span>
      </div>

      {/* Main summary numbers */}
      <Card className="flex flex-col items-center py-8">
        <span className="text-sm font-semibold text-text-secondary select-none mb-1">Revenue Today</span>
        <span className="text-4xl font-extrabold text-text-primary tracking-tight mb-6">
          {formatRupees(sessionData.summary.revenue)}
        </span>

        <div className="w-full grid grid-cols-3 gap-2 border-t border-border pt-6 select-none">
          <div className="flex flex-col items-center border-r border-border px-1">
            <span className="text-[11px] font-semibold text-text-secondary mb-1">Cash Collected</span>
            <span className="text-base font-bold text-text-primary">
              {formatRupees(sessionData.summary.cash_total)}
            </span>
          </div>
          <div className="flex flex-col items-center border-r border-border px-1">
            <span className="text-[11px] font-semibold text-text-secondary mb-1">UPI Collected</span>
            <span className="text-base font-bold text-text-primary">
              {formatRupees(sessionData.summary.upi_total)}
            </span>
          </div>
          <div className="flex flex-col items-center px-1">
            <span className="text-[11px] font-semibold text-text-secondary mb-1">Expenses Today</span>
            <span className="text-base font-bold text-danger">
              {formatRupees(sessionData.summary.expense_total)}
            </span>
          </div>
        </div>

        <div className="w-full flex justify-between items-center border-t border-border mt-6 pt-4 text-xs font-semibold text-text-secondary select-none">
          <span>Bills Count: {sessionData.summary.bill_count}</span>
          <span>Opening cash: {formatRupees(sessionData.opening_balance)}</span>
        </div>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-col gap-3">
        {role === 'admin' && (
          <Button variant="secondary" onClick={() => navigate('/admin')}>
            Admin Dashboard
          </Button>
        )}
        <Button variant="primary" onClick={() => navigate('/bill')}>
          New bill
        </Button>
        <Button variant="secondary" onClick={() => navigate('/expenses')}>
          Expenses
        </Button>
        <Button variant="secondary" onClick={() => navigate('/bills')}>
          View bills
        </Button>
        <Button variant="secondary" onClick={() => setShowCloseModal(true)}>
          End the day
        </Button>
      </div>
    </div>
  );
};

export default Home;
