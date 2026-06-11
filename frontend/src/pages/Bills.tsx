import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { apiGet } from '../lib/api';
import { formatRupees } from '../lib/utils';
import { LoadingScreen } from '../components/LoadingScreen';

interface BillSummary {
  id: string;
  bill_number: number;
  total_price: number;
  created_at: string;
  item_count: number;
  payment_method: 'cash' | 'upi' | 'split';
}

export const Bills = () => {
  const navigate = useNavigate();
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet('/api/bills?scope=current');
      // Set results directly. Endpoint already orders them descending (newest first).
      setBills(data || []);
    } catch (err: any) {
      console.error('Failed to load bills:', err);
      setError(err.message || 'Could not retrieve today\'s bills.');
    }
  }, []);

  useEffect(() => {
    fetchBills().finally(() => setLoading(false));

    // Refetch when the browser tab gains focus to keep billing data fresh
    window.addEventListener('focus', fetchBills);
    return () => {
      window.removeEventListener('focus', fetchBills);
    };
  }, [fetchBills]);

  if (loading) {
    return <LoadingScreen />;
  }

  const totalRevenue = bills.reduce((sum, b) => sum + Number(b.total_price), 0);

  return (
    <div className="flex flex-col gap-6 pt-4 max-w-[480px] w-full mx-auto px-4 pb-12 select-none">
      
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">History</span>
          <h1 className="text-lg font-bold text-text-primary mt-0.5">Today's bills</h1>
        </div>
        <button
          onClick={fetchBills}
          className="h-10 px-4 flex items-center justify-center bg-white border border-border rounded-button text-sm font-bold text-text-primary hover:bg-background active:bg-border transition-colors cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-input text-danger text-sm font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {/* Aggregate Revenue Card */}
      {bills.length > 0 && (
        <Card className="flex flex-col items-center py-6">
          <span className="text-sm font-semibold text-text-secondary">
            Today's Revenue ({bills.length} {bills.length === 1 ? 'bill' : 'bills'})
          </span>
          <span className="text-3xl font-extrabold text-text-primary tracking-tight mt-1">
            {formatRupees(totalRevenue)}
          </span>
        </Card>
      )}

      {/* List / Empty State */}
      {bills.length === 0 ? (
        <Card className="text-center p-8">
          <h2 className="text-xl font-bold text-text-primary mb-2">No bills yet today</h2>
          <p className="text-text-secondary text-sm mb-6 leading-relaxed">
            You haven't rung up any sales yet today.
          </p>
          <Button variant="primary" onClick={() => navigate('/bill')}>
            New bill
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {bills.map((bill) => {
            const timeObj = new Date(bill.created_at);
            const formattedTime = timeObj.toLocaleTimeString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });

            const paymentLabel =
              bill.payment_method === 'cash'
                ? 'Cash'
                : bill.payment_method === 'upi'
                ? 'UPI'
                : 'Both';

            const pillStyles =
              bill.payment_method === 'cash'
                ? 'bg-text-secondary/10 text-text-secondary border-text-secondary/20'
                : bill.payment_method === 'upi'
                ? 'bg-accent/10 text-accent-dark border-accent/20'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200';

            return (
              <Card
                key={bill.id}
                onClick={() => navigate(`/bills/${bill.id}`)}
                className="flex justify-between items-center p-5 cursor-pointer border border-border hover:border-accent active:bg-background transition-all"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="text-lg font-bold text-text-primary">
                    Bill #{bill.bill_number}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold border ${pillStyles}`}
                    >
                      {paymentLabel}
                    </span>
                    <span className="text-xs font-semibold text-text-secondary">
                      {bill.item_count} {bill.item_count === 1 ? 'plant' : 'plants'} · {formattedTime}
                    </span>
                  </div>
                </div>

                <span className="text-xl font-extrabold text-text-primary">
                  {formatRupees(bill.total_price)}
                </span>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Bills;
