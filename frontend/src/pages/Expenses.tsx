import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MoneyInput } from '../components/MoneyInput';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { formatRupees } from '../lib/utils';
import { LoadingScreen } from '../components/LoadingScreen';

interface Expense {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
}

interface ExpenseListResponse {
  expenses: Expense[];
  total_expenses: number;
}

export const Expenses = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSessionOpen, setIsSessionOpen] = useState<boolean>(false);

  // Form states
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Expenses list states
  const [expensesData, setExpensesData] = useState<ExpenseListResponse>({
    expenses: [],
    total_expenses: 0
  });

  // Verify session and fetch expenses
  const checkSessionAndFetchData = useCallback(async () => {
    try {
      const session = await apiGet('/api/sessions/current');
      if (session && session.status === 'open') {
        setIsSessionOpen(true);
        const data = await apiGet('/api/expenses?scope=current');
        setExpensesData(data);
      } else {
        setIsSessionOpen(false);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to verify session status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSessionAndFetchData();
  }, [checkSessionAndFetchData]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSuccess(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter an expense amount greater than 0.');
      return;
    }

    if (!reason.trim()) {
      setError('Please enter a reason for the expense.');
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/api/expenses/', {
        amount: parsedAmount,
        reason: reason.trim()
      });
      setAmount('');
      setReason('');
      setSuccess('Expense recorded successfully.');
      
      // Refresh list
      const data = await apiGet('/api/expenses?scope=current');
      setExpensesData(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to record expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveExpense = async (id: string, expAmount: number, expReason: string) => {
    const confirmed = window.confirm(`Are you sure you want to remove the expense for ₹${expAmount} (${expReason})?`);
    if (!confirmed) return;

    setError(null);
    setSuccess(null);

    try {
      await apiDelete(`/api/expenses/${id}`);
      setSuccess('Expense removed successfully.');
      
      // Refresh list
      const data = await apiGet('/api/expenses?scope=current');
      setExpensesData(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to remove expense.');
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isSessionOpen) {
    return (
      <div className="flex flex-col gap-6 pt-4 max-w-[480px] w-full mx-auto px-4 select-none">
        <Card className="text-center p-8">
          <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-danger/20">
            <span className="text-3xl font-extrabold text-danger">!</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Register Closed</h1>
          <p className="text-text-secondary text-sm mb-6 leading-relaxed">
            Start the day before adding an expense. Please open a register session first.
          </p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Go to Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-4 max-w-[480px] w-full mx-auto px-4 pb-12">
      
      {/* Navigation Header */}
      <div className="flex items-center gap-4 select-none">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 flex items-center justify-center rounded-button bg-white border border-border text-text-primary hover:bg-background active:bg-border transition-colors font-bold text-lg select-none cursor-pointer focus:outline-none"
        >
          ←
        </button>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Register</span>
          <h1 className="text-lg font-bold text-text-primary mt-0.5">Petty Cash Expenses</h1>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-input text-danger text-sm font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-accent/10 border border-accent/20 rounded-input text-accent-dark text-sm font-semibold leading-relaxed">
          {success}
        </div>
      )}

      {/* Expenses Dashboard Summary */}
      <Card className="flex flex-col items-center py-6 select-none bg-white border border-border shadow-soft">
        <span className="text-sm font-semibold text-text-secondary mb-1">Expenses Today</span>
        <span className="text-3xl font-extrabold text-danger tracking-tight">
          {formatRupees(expensesData.total_expenses)}
        </span>
      </Card>

      {/* Record New Expense Form */}
      <Card className="p-5 border border-border bg-white shadow-soft">
        <h2 className="text-base font-bold text-text-primary mb-4 select-none">Record cash taken out</h2>
        <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
          <MoneyInput
            label="Amount taken out"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
          />
          <div className="flex flex-col">
            <label className="text-text-secondary text-sm font-semibold mb-2 select-none">
              Reason / Purpose
            </label>
            <input
              type="text"
              placeholder="e.g. Purchased soil, paid vendor, tea/coffee"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              className="h-[52px] px-4 rounded-input border border-border bg-white text-text-primary text-base font-medium focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
            />
          </div>
          <Button type="submit" disabled={submitting || !amount || !reason.trim()}>
            {submitting ? 'Recording...' : 'Record Expense'}
          </Button>
        </form>
      </Card>

      {/* Recorded Expenses List */}
      <Card className="p-5 border border-border bg-white shadow-soft">
        <h2 className="text-base font-bold text-text-primary mb-4 select-none">Today's Transactions</h2>
        <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
          {expensesData.expenses.length === 0 ? (
            <div className="text-center text-text-secondary text-sm py-8 font-medium select-none">
              No cash expenses recorded today.
            </div>
          ) : (
            expensesData.expenses.map((exp) => {
              const dateObj = new Date(exp.created_at);
              const formattedTime = dateObj.toLocaleTimeString('en-IN', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });
              
              return (
                <div
                  key={exp.id}
                  className="flex justify-between items-center p-3.5 bg-background border border-border rounded-input gap-3"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-sm text-text-primary truncate">
                      {exp.reason}
                    </span>
                    <span className="text-[11px] font-semibold text-text-secondary mt-0.5 select-none">
                      {formattedTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 select-none">
                    <span className="font-bold text-sm text-danger">
                      -{formatRupees(exp.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExpense(exp.id, exp.amount, exp.reason)}
                      className="text-xs font-bold text-danger hover:underline focus:outline-none cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

    </div>
  );
};

export default Expenses;
