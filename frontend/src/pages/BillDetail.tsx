import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { apiGet } from '../lib/api';
import { formatRupees } from '../lib/utils';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../context/AuthContext';

interface BillItem {
  plant_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

interface BillDetail {
  id: string;
  session_id: string;
  created_by: string;
  discount_amount: number;
  payment_method: 'cash' | 'upi' | 'split';
  cash_amount: number;
  upi_amount: number;
  total_price: number;
  bill_number: number;
  created_at: string;
  items: BillItem[];
  customer_name?: string | null;
  customer_phone?: string | null;
}

interface CustomerBillHistory {
  id: string;
  bill_number: number;
  total: number;
  created_at: string;
  payment_method: 'cash' | 'upi' | 'split';
}

interface CustomerHistoryResponse {
  customer_name: string | null;
  customer_phone: string;
  bills: CustomerBillHistory[];
  total_spent: number;
  bill_count: number;
}

export const BillDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Customer History Modal states
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [historyPhone, setHistoryPhone] = useState<string>('');
  const [historyData, setHistoryData] = useState<CustomerHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const handleShowCustomerHistory = async (phone: string) => {
    setHistoryPhone(phone);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await apiGet(`/api/admin/customers/${phone}`);
      setHistoryData(data);
    } catch (err: any) {
      console.error(err);
      setHistoryError(err.message || 'Failed to load customer history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchBillDetail = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const data = await apiGet(`/api/bills/${id}`);
      setBill(data);
    } catch (err: any) {
      console.error('Failed to load bill detail:', err);
      setError(err.message || 'Transaction receipt not found.');
    }
  }, [id]);

  useEffect(() => {
    fetchBillDetail().finally(() => setLoading(false));
  }, [fetchBillDetail]);

  if (loading) {
    return <LoadingScreen />;
  }

  // Friendly not found state
  if (error || !bill) {
    return (
      <div className="flex flex-col gap-6 pt-4 max-w-[480px] w-full mx-auto px-4 select-none">
        <Card className="text-center p-8">
          <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-danger/20">
            <span className="text-3xl font-extrabold text-danger">!</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Not Found</h1>
          <p className="text-text-secondary text-sm mb-6 leading-relaxed">
            {error || 'The requested transaction receipt could not be found.'}
          </p>
          <Button variant="primary" onClick={() => navigate('/bills')}>
            Back to bills
          </Button>
        </Card>
      </div>
    );
  }

  // Formatting helpers
  const billDate = new Date(bill.created_at);
  const formattedDate = billDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  
  const formattedTime = billDate.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const subtotal = bill.items.reduce((sum, item) => sum + Number(item.total_price), 0);
  const discount = Number(bill.discount_amount);
  const total = Number(bill.total_price);

  return (
    <div className="flex flex-col gap-6 pt-4 max-w-[480px] w-full mx-auto px-4 pb-12">
      
      {/* Receipt Page Wrapper */}
      <Card className="flex flex-col gap-6 border border-border shadow-soft bg-white p-6 relative">
        
        {/* Receipt Header */}
        <div className="flex flex-col items-center text-center select-none">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">
            Receipt
          </span>
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight mb-1">
            Bill #{bill.bill_number}
          </h1>
          <span className="text-xs font-semibold text-text-secondary">
            {formattedDate} · {formattedTime}
          </span>
        </div>

        {/* Dashed divider */}
        <div className="border-t border-dashed border-border" />

        {/* Line Items List */}
        <div className="flex flex-col gap-4">
          {bill.items.map((item, index) => (
            <div key={index} className="flex justify-between items-center text-base">
              <div className="flex flex-col pr-4">
                <span className="font-semibold text-text-primary">
                  {item.plant_name}
                </span>
                <span className="text-xs font-medium text-text-secondary mt-0.5 select-none">
                  {item.quantity} × {formatRupees(item.unit_price)}
                </span>
              </div>
              <span className="font-bold text-text-primary shrink-0 select-none">
                {formatRupees(item.total_price)}
              </span>
            </div>
          ))}
        </div>

        {/* Dashed divider */}
        <div className="border-t border-dashed border-border" />

        {/* Financial Summary */}
        <div className="flex flex-col gap-2.5 text-sm select-none">
          <div className="flex justify-between items-center font-medium">
            <span className="text-text-secondary">Subtotal:</span>
            <span className="text-text-primary">{formatRupees(subtotal)}</span>
          </div>

          {discount > 0 && (
            <div className="flex justify-between items-center font-medium">
              <span className="text-text-secondary">Discount:</span>
              <span className="text-danger">-{formatRupees(discount)}</span>
            </div>
          )}

          <div className="border-t border-border my-1" />

          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-text-primary">Total:</span>
            <span className="text-2xl font-extrabold text-accent tracking-tight">
              {formatRupees(total)}
            </span>
          </div>
        </div>

        {/* Dashed divider */}
        <div className="border-t border-dashed border-border" />

        {/* Payment Breakdown */}
        <div className="flex flex-col gap-2 select-none">
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
            Payment Details
          </span>

          <div className="p-4 bg-background border border-border rounded-input flex flex-col gap-2">
            {bill.payment_method === 'cash' && (
              <div className="flex justify-between items-center text-sm font-semibold">
                <span className="text-text-secondary">Cash Paid:</span>
                <span className="text-text-primary">{formatRupees(total)}</span>
              </div>
            )}

            {bill.payment_method === 'upi' && (
              <div className="flex justify-between items-center text-sm font-semibold">
                <span className="text-text-secondary">UPI Paid:</span>
                <span className="text-text-primary">{formatRupees(total)}</span>
              </div>
            )}

            {bill.payment_method === 'split' && (
              <>
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-text-secondary">Cash Received:</span>
                  <span className="text-text-primary">{formatRupees(bill.cash_amount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-text-secondary">UPI Received:</span>
                  <span className="text-accent font-extrabold">{formatRupees(bill.upi_amount)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Customer Details (Optional) */}
        {(bill.customer_name || bill.customer_phone) && (
          <>
            <div className="border-t border-dashed border-border" />
            <div className="flex flex-col gap-2 select-none">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Customer Details
              </span>
              <div className="p-4 bg-background border border-border rounded-input flex flex-col gap-2">
                {bill.customer_name && (
                  <div className="flex justify-between items-center text-sm font-semibold">
                    <span className="text-text-secondary">Name:</span>
                    <span className="text-text-primary">{bill.customer_name}</span>
                  </div>
                )}
                {bill.customer_phone && (
                  <div className="flex justify-between items-start text-sm font-semibold">
                    <span className="text-text-secondary">Phone:</span>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-text-primary">{bill.customer_phone}</span>
                      {role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleShowCustomerHistory(bill.customer_phone!)}
                          className="text-xs font-bold text-accent hover:underline cursor-pointer focus:outline-none"
                        >
                          View purchase history
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

      </Card>

      {/* Navigation Return Button */}
      <Button variant="secondary" onClick={() => navigate('/bills')}>
        Back to bills
      </Button>

      {/* Customer Purchase History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <Card className="max-w-[440px] w-full bg-white p-6 shadow-xl border border-border flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 select-none">
              <h3 className="text-lg font-bold text-text-primary">
                Customer Purchase History
              </h3>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-text-secondary hover:text-text-primary font-bold text-xl select-none cursor-pointer focus:outline-none"
              >
                ✕
              </button>
            </div>
            
            <div className="border-b border-border pb-3 mb-4 select-none">
              {historyLoading ? (
                <div className="text-sm font-medium text-text-secondary">Loading details for {historyPhone}...</div>
              ) : historyData ? (
                <div className="flex flex-col gap-1.5">
                  <div className="text-sm font-semibold text-text-primary">
                    Name: <span className="font-extrabold text-accent-dark">{historyData.customer_name || 'N/A'}</span>
                  </div>
                  <div className="text-sm font-semibold text-text-primary">
                    Phone: <span className="font-bold">{historyData.customer_phone}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-text-secondary mt-1">
                    <span>Visits: {historyData.bill_count}</span>
                    <span>Total Spent: {formatRupees(historyData.total_spent)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm font-medium text-danger">{historyError || 'No customer data loaded.'}</div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-0">
              {historyLoading ? (
                <div className="text-center text-text-secondary text-sm py-8 font-medium">Fetching transactions...</div>
              ) : historyData && historyData.bills.length > 0 ? (
                historyData.bills.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setHistoryOpen(false);
                      navigate(`/bills/${item.id}`);
                    }}
                    className="w-full text-left p-3.5 bg-background border border-border hover:border-accent hover:bg-accent/5 rounded-input transition-all cursor-pointer flex justify-between items-center gap-3"
                  >
                    <div className="flex flex-col gap-1 select-none">
                      <span className="font-bold text-sm text-text-primary">
                        Bill #{item.bill_number}
                      </span>
                      <span className="text-[11px] font-semibold text-text-secondary">
                        {new Date(item.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-extrabold text-sm text-text-primary">
                        {formatRupees(item.total)}
                      </span>
                      <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
                        {item.payment_method}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                !historyLoading && (
                  <div className="text-center text-text-secondary text-sm py-8 font-medium select-none">
                    No matching bills found.
                  </div>
                )
              )}
            </div>
          </Card>
        </div>
      )}

    </div>
  );
};

export default BillDetail;
