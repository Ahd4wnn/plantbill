import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MoneyInput } from '../components/MoneyInput';
import { apiGet, apiPost } from '../lib/api';
import { formatRupees } from '../lib/utils';
import { LoadingScreen } from '../components/LoadingScreen';

interface LineItem {
  id: string;
  plant_name: string;
  unit_price: string;
  quantity: string;
}

interface SavedBillResponse {
  id: string;
  bill_number: number;
  total: number;
  created_at: string;
  customer_name?: string | null;
  customer_phone?: string | null;
}

export const Bill = () => {
  const navigate = useNavigate();
  const [sessionLoading, setSessionLoading] = useState<boolean>(true);
  const [isSessionOpen, setIsSessionOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Bill States
  const [items, setItems] = useState<LineItem[]>([
    { id: 'item-1', plant_name: 'Plant 1', unit_price: '', quantity: '1' }
  ]);
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'split'>('cash');
  const [cashReceived, setCashReceived] = useState<string>('');

  // Customer details
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [isCustomerExpanded, setIsCustomerExpanded] = useState<boolean>(false);

  // Success Confirmation state
  const [savedBill, setSavedBill] = useState<SavedBillResponse | null>(null);

  // Check if day register session is open on mount
  const checkSession = useCallback(async () => {
    try {
      const data = await apiGet('/api/sessions/current');
      if (data && data.status === 'open') {
        setIsSessionOpen(true);
      } else {
        setIsSessionOpen(false);
      }
    } catch (err) {
      console.error('Failed to verify session status:', err);
      setIsSessionOpen(false);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Line calculations
  const getLineTotal = (item: LineItem): number => {
    const price = parseFloat(item.unit_price) || 0;
    const qty = parseInt(item.quantity) || 0;
    return price * qty;
  };

  // Filter out any line that is effectively empty
  const nonDiscardedItems = items.filter(item => {
    const price = parseFloat(item.unit_price) || 0;
    const isAutoName = /^Plant \d+$/.test(item.plant_name.trim());
    const hasCustomName = item.plant_name.trim() !== '' && !isAutoName;
    const isEmpty = price === 0 && !hasCustomName;
    return !isEmpty;
  });

  const subtotal = nonDiscardedItems.reduce((sum, item) => sum + getLineTotal(item), 0);
  const parsedDiscount = parseFloat(discountAmount) || 0;
  const isDiscountInvalid = parsedDiscount > subtotal;
  
  // Clamped discount for final total calculation
  const activeDiscount = isDiscountInvalid ? subtotal : parsedDiscount;
  const total = Math.max(0, subtotal - activeDiscount);

  // Split calculations
  const parsedCash = parseFloat(cashReceived) || 0;
  const clampedCash = Math.min(Math.max(parsedCash, 0), total);
  const computedUpi = paymentMethod === 'split' ? Math.max(0, total - clampedCash) : 0;

  // Add new plant line auto-numbered
  const handleAddLine = () => {
    const nextIndex = items.length + 1;
    setItems([
      ...items,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        plant_name: `Plant ${nextIndex}`,
        unit_price: '',
        quantity: '1'
      }
    ]);
  };

  // Remove line item
  const handleRemoveLine = (id: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // Change quantity via steppers
  const handleStepperUpdate = (id: string, delta: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          const currentQty = parseInt(item.quantity) || 1;
          const newQty = Math.max(1, currentQty + delta);
          return { ...item, quantity: String(newQty) };
        }
        return item;
      })
    );
  };

  // Direct inputs
  const handleQtyChange = (id: string, val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, '');
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, quantity: cleanVal } : item))
    );
  };

  const handleQtyBlur = (id: string, val: string) => {
    const parsed = parseInt(val) || 1;
    const clamped = Math.max(1, parsed);
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, quantity: String(clamped) } : item))
    );
  };

  const handlePriceChange = (id: string, val: string) => {
    let cleanVal = val.replace(/[^0-9.]/g, '');
    const parts = cleanVal.split('.');
    if (parts.length > 2) {
      cleanVal = parts[0] + '.' + parts.slice(1).join('');
    }
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, unit_price: cleanVal } : item))
    );
  };

  const handleNameChange = (id: string, val: string) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, plant_name: val } : item))
    );
  };

  // Save bill action
  const handleSaveBill = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const payloadItems = nonDiscardedItems.map(item => {
        const uPrice = parseFloat(item.unit_price) || 0;
        const qty = parseInt(item.quantity) || 1;
        return {
          plant_name: item.plant_name.trim() || 'Unspecified Plant',
          unit_price: uPrice,
          quantity: qty,
          total_price: uPrice * qty
        };
      });

      const cashAmt =
        paymentMethod === 'cash'
          ? total
          : paymentMethod === 'upi'
          ? 0
          : clampedCash;

      const upiAmt =
        paymentMethod === 'cash'
          ? 0
          : paymentMethod === 'upi'
          ? total
          : computedUpi;

      const payload = {
        items: payloadItems,
        discount_amount: activeDiscount,
        payment_method: paymentMethod,
        cash_amount: cashAmt,
        upi_amount: upiAmt,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined
      };

      const result = await apiPost('/api/bills', payload);
      setSavedBill(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetBill = () => {
    setItems([{ id: 'item-1', plant_name: 'Plant 1', unit_price: '', quantity: '1' }]);
    setDiscountAmount('');
    setPaymentMethod('cash');
    setCashReceived('');
    setSavedBill(null);
    setError(null);
    setCustomerName('');
    setCustomerPhone('');
    setIsCustomerExpanded(false);
  };

  // Loading indicator
  if (sessionLoading) {
    return <LoadingScreen />;
  }

  // Day register is closed guard
  if (!isSessionOpen) {
    return (
      <div className="flex flex-col gap-6 pt-4 max-w-[480px] w-full mx-auto px-4 select-none">
        <Card className="text-center p-8">
          <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-danger/20">
            <span className="text-3xl font-extrabold text-danger">!</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Register Closed</h1>
          <p className="text-text-secondary text-sm mb-6 leading-relaxed">
            Start the day before billing. Please open a register session first.
          </p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Go to Home
          </Button>
        </Card>
      </div>
    );
  }

  // Bill Success Confirmation screen
  if (savedBill) {
    return (
      <div className="flex flex-col gap-6 pt-4 max-w-[480px] w-full mx-auto px-4 select-none">
        <Card className="text-center p-8">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-accent/20">
            <span className="text-3xl font-extrabold text-accent">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Bill Saved</h1>
          <h2 className="text-lg font-bold text-text-secondary mb-4">
            Bill #{savedBill.bill_number}{savedBill.customer_name ? ` · ${savedBill.customer_name}` : ''}
          </h2>
          <div className="text-sm font-medium text-text-secondary mb-2">Total Amount Billed</div>
          <div className="text-4xl font-extrabold text-text-primary tracking-tight mb-8">
            {formatRupees(savedBill.total)}
          </div>

          <div className="flex flex-col gap-3">
            <Button variant="primary" onClick={handleResetBill}>
              New bill
            </Button>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Back to home
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Validation checking for Submit button active state
  const isBillValid =
    nonDiscardedItems.length > 0 &&
    nonDiscardedItems.every(item => {
      const price = parseFloat(item.unit_price) || 0;
      const qty = parseInt(item.quantity) || 0;
      return price > 0 && qty >= 1 && item.plant_name.trim() !== '';
    }) &&
    total >= 0;

  return (
    <form
      onSubmit={handleSaveBill}
      className="flex flex-col flex-1 max-w-[480px] w-full mx-auto px-4 pt-4 pb-[320px] relative"
    >
      {error && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-input text-danger text-sm font-semibold leading-relaxed mb-4">
          {error}
        </div>
      )}

      {/* Line items list */}
      <div className="flex flex-col gap-4">
        {items.map((item, index) => (
          <Card key={item.id} className="relative flex flex-col gap-4 border border-border p-5">
            {/* Header: Plant Name & Delete button */}
            <div className="flex justify-between items-center gap-3">
              <input
                type="text"
                value={item.plant_name}
                onChange={(e) => handleNameChange(item.id, e.target.value)}
                placeholder={`Plant ${index + 1}`}
                className="h-10 text-lg font-bold text-text-primary bg-transparent border-b border-transparent focus:border-accent focus:outline-none w-full"
                disabled={submitting}
              />
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveLine(item.id)}
                  disabled={submitting}
                  className="text-sm font-bold text-danger hover:underline focus:outline-none h-10 px-3 cursor-pointer shrink-0 select-none"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Inputs: Price & Quantity */}
            <div className="grid grid-cols-2 gap-4">
              <MoneyInput
                label="Unit Price"
                placeholder="0.00"
                value={item.unit_price}
                onChange={(e) => handlePriceChange(item.id, e.target.value)}
                disabled={submitting}
              />

              {/* Quantity Stepper */}
              <div className="flex flex-col w-full">
                <label className="text-text-secondary text-sm font-semibold mb-2 select-none">
                  Quantity
                </label>
                <div className="flex items-center w-full gap-1">
                  <button
                    type="button"
                    onClick={() => handleStepperUpdate(item.id, -1)}
                    disabled={submitting || (parseInt(item.quantity) || 1) <= 1}
                    className="w-12 h-[52px] flex items-center justify-center bg-white border border-border rounded-button text-[20px] font-bold text-text-primary active:bg-border disabled:opacity-40 disabled:pointer-events-none select-none cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={item.quantity}
                    onChange={(e) => handleQtyChange(item.id, e.target.value)}
                    onBlur={(e) => handleQtyBlur(item.id, e.target.value)}
                    disabled={submitting}
                    className="h-[52px] flex-1 min-w-0 text-center rounded-input border border-border bg-white text-text-primary text-[18px] font-medium focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleStepperUpdate(item.id, 1)}
                    disabled={submitting}
                    className="w-12 h-[52px] flex items-center justify-center bg-white border border-border rounded-button text-[20px] font-bold text-text-primary active:bg-border disabled:opacity-40 disabled:pointer-events-none select-none cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Line total display */}
            <div className="flex justify-between items-center border-t border-border/60 pt-3 select-none">
              <span className="text-xs font-semibold text-text-secondary">Line Total:</span>
              <span className="text-base font-bold text-text-primary">
                {formatRupees(getLineTotal(item))}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Add Plant line button */}
      <button
        type="button"
        onClick={handleAddLine}
        disabled={submitting}
        className="h-[52px] w-full mt-4 flex items-center justify-center bg-white border border-border hover:bg-background active:bg-border text-base font-bold text-text-primary rounded-button transition-colors select-none cursor-pointer"
      >
        + Add plant
      </button>

      {/* Collapsible Customer Details Card */}
      <Card className="mt-4 border border-border p-4">
        <button
          type="button"
          onClick={() => setIsCustomerExpanded(!isCustomerExpanded)}
          className="w-full flex items-center justify-between text-sm font-bold text-text-primary hover:text-accent select-none cursor-pointer focus:outline-none"
        >
          <span>{isCustomerExpanded ? '▼ Hide customer details (optional)' : '▶ Add customer details (optional)'}</span>
        </button>
        
        {isCustomerExpanded && (
          <div className="flex flex-col gap-3 mt-4 pt-3 border-t border-border/60">
            <div className="flex flex-col">
              <label className="text-text-secondary text-xs font-semibold mb-1 select-none">
                Customer Name
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={submitting}
                className="h-11 px-3 rounded-input border border-border bg-white text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-text-secondary text-xs font-semibold mb-1 select-none">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                disabled={submitting}
                className="h-11 px-3 rounded-input border border-border bg-white text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Sticky footer block at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-20">
        <div className="max-w-[480px] w-full mx-auto px-4 py-4 flex flex-col gap-4">
          
          {/* Subtotal & Discount row */}
          <div className="flex items-start gap-4">
            <div className="flex-1 flex flex-col justify-center select-none pt-1">
              <span className="text-xs font-semibold text-text-secondary">Subtotal</span>
              <span className="text-base font-bold text-text-primary">
                {formatRupees(subtotal)}
              </span>
            </div>
            
            <div className="w-1/2 flex flex-col">
              <MoneyInput
                label="Discount"
                placeholder="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                disabled={submitting}
                className="h-11"
              />
              {isDiscountInvalid && (
                <span className="text-[11px] font-semibold text-danger mt-1 leading-tight select-none">
                  Discount clamped to ₹{subtotal}
                </span>
              )}
            </div>
          </div>

          {/* Payment Method segments */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-text-secondary select-none">
              Payment Method
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'upi', 'split'] as const).map((mode) => {
                const label = mode === 'cash' ? 'Cash' : mode === 'upi' ? 'UPI' : 'Both';
                const isSelected = paymentMethod === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMethod(mode)}
                    disabled={submitting}
                    className={`h-[48px] rounded-button font-bold text-sm border transition-all select-none cursor-pointer ${
                      isSelected
                        ? 'bg-accent/10 border-accent text-accent-dark font-extrabold'
                        : 'bg-white border-border text-text-primary hover:bg-background active:bg-border'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Split payment specific sub-input */}
          {paymentMethod === 'split' && (
            <div className="flex flex-col gap-3 p-3 bg-background border border-border rounded-input select-none">
              <MoneyInput
                label="Cash received"
                placeholder="0"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                disabled={submitting}
                className="h-10"
              />
              <div className="flex justify-between items-center text-xs font-bold text-text-secondary mt-1">
                <span>UPI:</span>
                <span className="text-accent font-extrabold text-sm">
                  {formatRupees(computedUpi)}
                </span>
              </div>
            </div>
          )}

          {/* Final checkout submit button */}
          <button
            type="submit"
            disabled={submitting || !isBillValid}
            className="h-14 w-full flex items-center justify-center bg-accent hover:bg-accent-dark active:bg-accent-dark text-white font-bold rounded-button disabled:bg-border disabled:text-text-secondary disabled:border-transparent disabled:opacity-50 transition-colors shadow-soft select-none cursor-pointer"
          >
            {submitting
              ? 'Saving bill...'
              : `Save bill · ${formatRupees(total)}`}
          </button>
        </div>
      </div>
    </form>
  );
};

export default Bill;
