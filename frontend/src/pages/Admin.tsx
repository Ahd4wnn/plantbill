import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { apiGet, apiGetBlob } from '../lib/api';
import { formatRupees } from '../lib/utils';
import { LoadingScreen } from '../components/LoadingScreen';

interface AdminSummary {
  session_date: string;
  status: 'open' | 'closed';
  opening_balance: number;
  closing_balance: number | null;
  bill_count: number;
  revenue: number;
  cash_total: number;
  upi_total: number;
  discount_total: number;
  expected_cash: number;
  variance: number | null;
}

interface HistoricalDay {
  session_date: string;
  status: 'open' | 'closed';
  bill_count: number;
  revenue: number;
  cash_total: number;
  upi_total: number;
  variance: number | null;
}

interface HistoricalRangeResponse {
  days: HistoricalDay[];
  total_revenue: number;
  total_bills: number;
  total_cash: number;
  total_upi: number;
}

interface AdminBillSummary {
  id: string;
  bill_number: number;
  session_date: string;
  total: number;
  payment_method: 'cash' | 'upi' | 'split';
  cash_amount: number;
  upi_amount: number;
  item_count: number;
  created_at: string;
}

export const Admin = () => {
  const navigate = useNavigate();
  const topRef = useRef<HTMLDivElement>(null);

  // States
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [rangeData, setRangeData] = useState<HistoricalRangeResponse | null>(null);
  
  // Bills view state for selected date
  const [viewingBills, setViewingBills] = useState<boolean>(false);
  const [billsForDate, setBillsForDate] = useState<AdminBillSummary[]>([]);
  
  const [summaryLoading, setSummaryLoading] = useState<boolean>(true);
  const [rangeLoading, setRangeLoading] = useState<boolean>(true);
  const [billsLoading, setBillsLoading] = useState<boolean>(false);
  
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [billsError, setBillsError] = useState<string | null>(null);

  // Export states
  const [exportingDaily, setExportingDaily] = useState<boolean>(false);
  const [exportingBills, setExportingBills] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Export handlers
  const handleExportDaily = async () => {
    setExportingDaily(true);
    setExportError(null);
    try {
      const { blob, filename } = await apiGetBlob('/api/admin/export/daily');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setExportError(err.message || 'Failed to export daily summary.');
    } finally {
      setExportingDaily(false);
    }
  };

  const handleExportBills = async () => {
    setExportingBills(true);
    setExportError(null);
    try {
      const { blob, filename } = await apiGetBlob(`/api/admin/export/bills?date=${selectedDate}`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setExportError(err.message || 'Failed to export bills.');
    } finally {
      setExportingBills(false);
    }
  };

  // 1. Fetch Selected Date Summary
  const fetchSummary = useCallback(async (dateStr: string) => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await apiGet(`/api/admin/summary?date=${dateStr}`);
      setSummary(data);
    } catch (err: any) {
      console.error(err);
      setSummaryError(err.message || 'Failed to load summary for this date.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // 2. Fetch Recent 30 Days aggregations
  const fetchRange = useCallback(async () => {
    setRangeLoading(true);
    setRangeError(null);
    try {
      const data = await apiGet('/api/admin/days');
      setRangeData(data);
    } catch (err: any) {
      console.error(err);
      setRangeError(err.message || 'Failed to load historical days.');
    } finally {
      setRangeLoading(false);
    }
  }, []);

  // 3. Fetch Bills for Selected Date (when requested)
  const fetchBillsForSelectedDate = useCallback(async (dateStr: string) => {
    setBillsLoading(true);
    setBillsError(null);
    try {
      const data = await apiGet(`/api/admin/bills?date=${dateStr}`);
      setBillsForDate(data || []);
    } catch (err: any) {
      console.error(err);
      setBillsError(err.message || 'Failed to load bills for this date.');
    } finally {
      setBillsLoading(false);
    }
  }, []);

  // Loaders
  useEffect(() => {
    fetchSummary(selectedDate);
  }, [selectedDate, fetchSummary]);

  useEffect(() => {
    fetchRange();
  }, [fetchRange]);

  // If viewingBills flag changes, load bills
  useEffect(() => {
    if (viewingBills) {
      fetchBillsForSelectedDate(selectedDate);
    }
  }, [viewingBills, selectedDate, fetchBillsForSelectedDate]);

  // Adjust Date (Previous / Next)
  const handleAdjustDate = (offsetDays: number) => {
    setViewingBills(false);
    const dateObj = new Date(selectedDate);
    dateObj.setDate(dateObj.getDate() + offsetDays);
    setSelectedDate(dateObj.toISOString().split('T')[0]);
  };

  // Tapping a recent day in history sets the summary and scrolls up
  const handleSelectRecentDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    setViewingBills(false);
    // Smooth scroll to top summary div
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Format date helper (Mon, 9 Jun 2026)
  const formatDateFriendly = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    return dateObj.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (summaryLoading && rangeLoading) {
    return <LoadingScreen />;
  }

  return (
    <div ref={topRef} className="flex flex-col gap-6 pt-4 max-w-[480px] w-full mx-auto px-4 pb-12">
      
      {/* Title */}
      <div className="flex flex-col select-none">
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Dashboard</span>
        <h1 className="text-lg font-bold text-text-primary mt-0.5">Admin Area</h1>
      </div>

      {/* Date Navigation Bar */}
      <Card className="flex flex-col gap-4 p-4 border border-border">
        <label className="text-xs font-bold text-text-secondary uppercase select-none">
          Select Day
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAdjustDate(-1)}
            className="h-11 px-3 bg-white border border-border rounded-button text-sm font-bold text-text-primary active:bg-border select-none cursor-pointer"
          >
            ← Prev
          </button>
          
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setViewingBills(false);
              setSelectedDate(e.target.value);
            }}
            className="h-11 flex-1 px-3 border border-border rounded-input text-base font-semibold text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-accent"
          />

          <button
            onClick={() => handleAdjustDate(1)}
            className="h-11 px-3 bg-white border border-border rounded-button text-sm font-bold text-text-primary active:bg-border select-none cursor-pointer"
          >
            Next →
          </button>
        </div>
      </Card>

      {/* Selected Day View (Main Summary OR Bills List Toggle) */}
      {viewingBills ? (
        // BILLS LIST FOR CHOSEN DATE
        <Card className="flex flex-col gap-4 border border-border p-5">
          <div className="flex justify-between items-center select-none">
            <h2 className="text-base font-bold text-text-primary">
              Bills for {formatDateFriendly(selectedDate)}
            </h2>
            <button
              onClick={() => setViewingBills(false)}
              className="text-sm font-bold text-accent hover:underline focus:outline-none cursor-pointer"
            >
              Back to Summary
            </button>
          </div>

          <div className="border-t border-border my-1" />

          {billsLoading ? (
            <div className="text-center py-6 text-sm text-text-secondary">Loading bills...</div>
          ) : billsError ? (
            <div className="p-3 bg-danger/10 text-danger text-sm rounded-input font-medium">
              {billsError}
            </div>
          ) : billsForDate.length === 0 ? (
            <div className="text-center py-6 text-sm text-text-secondary select-none">
              No bills found for this date.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {billsForDate.map((bill) => {
                const billTime = new Date(bill.created_at).toLocaleTimeString('en-IN', {
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
                  <div
                    key={bill.id}
                    onClick={() => navigate(`/bills/${bill.id}`)}
                    className="flex justify-between items-center p-4 cursor-pointer border border-border rounded-input hover:border-accent active:bg-background transition-all"
                  >
                    <div className="flex flex-col gap-1 select-none">
                      <span className="text-sm font-bold text-text-primary">
                        Bill #{bill.bill_number}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${pillStyles}`}>
                          {paymentLabel}
                        </span>
                        <span className="text-[11px] font-medium text-text-secondary">
                          {bill.item_count} items · {billTime}
                        </span>
                      </div>
                    </div>
                    <span className="text-base font-extrabold text-text-primary">
                      {formatRupees(bill.total)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        // SELECTED DATE SUMMARY VIEW
        <div>
          {summaryLoading ? (
            <div className="text-center py-6 text-sm text-text-secondary select-none">
              Loading summary...
            </div>
          ) : summaryError ? (
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-input text-danger text-sm font-semibold select-none">
              {summaryError}
            </div>
          ) : !summary ? (
            <Card className="text-center py-8 select-none">
              <span className="text-3xl font-extrabold text-text-secondary block mb-2">∅</span>
              <h2 className="text-lg font-bold text-text-primary mb-1">No Register Session</h2>
              <p className="text-text-secondary text-sm leading-relaxed">
                No register session was active on {formatDateFriendly(selectedDate)}.
              </p>
            </Card>
          ) : (
            <Card className="flex flex-col gap-5 border border-border p-6">
              
              {/* Header Status & Date */}
              <div className="flex justify-between items-center select-none">
                <span className="text-sm font-bold text-text-primary">
                  {formatDateFriendly(selectedDate)}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    summary.status === 'open'
                      ? 'bg-accent/10 text-accent-dark border-accent/20'
                      : 'bg-text-secondary/10 text-text-secondary border-text-secondary/20'
                  }`}
                >
                  {summary.status === 'open' ? 'Open' : 'Closed'}
                </span>
              </div>

              {/* Revenue Hero Block */}
              <div className="flex flex-col items-center py-4 border-y border-border/60 select-none">
                <span className="text-xs font-bold text-text-secondary uppercase">Revenue</span>
                <span className="text-3xl font-extrabold text-text-primary tracking-tight mt-1">
                  {formatRupees(summary.revenue)}
                </span>
                <span className="text-xs font-semibold text-text-secondary mt-1">
                  {summary.bill_count} {summary.bill_count === 1 ? 'bill' : 'bills'} saved
                </span>
              </div>

              {/* Financial Breakdowns */}
              <div className="flex flex-col gap-3 text-sm font-medium select-none">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Cash Sales:</span>
                  <span className="text-text-primary">{formatRupees(summary.cash_total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">UPI Sales:</span>
                  <span className="text-text-primary">{formatRupees(summary.upi_total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Discounts Applied:</span>
                  <span className="text-danger font-semibold">-{formatRupees(summary.discount_total)}</span>
                </div>

                <div className="border-t border-border/50 my-1" />

                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Opening Cash:</span>
                  <span className="text-text-primary">{formatRupees(summary.opening_balance)}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Expected Cash:</span>
                  <span className="text-text-primary">{formatRupees(summary.expected_cash)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Closing Cash:</span>
                  <span className="text-text-primary">
                    {summary.closing_balance !== null
                      ? formatRupees(summary.closing_balance)
                      : 'Not closed yet'}
                  </span>
                </div>

                {summary.variance !== null && (
                  <div className="flex justify-between items-center border-t border-border/50 pt-2.5">
                    <span className="text-text-secondary">Variance (Discrepancy):</span>
                    <span
                      className={`font-bold ${
                        summary.variance === 0
                          ? 'text-accent'
                          : summary.variance > 0
                          ? 'text-accent'
                          : 'text-danger'
                      }`}
                    >
                      {summary.variance > 0 ? '+' : ''}
                      {formatRupees(summary.variance)}
                      <span className="text-[10px] font-semibold block text-right mt-0.5">
                        {summary.variance === 0
                          ? 'Balanced'
                          : summary.variance > 0
                          ? 'Surplus'
                          : 'Short'}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* View Bills Button */}
              {summary.bill_count > 0 && (
                <button
                  type="button"
                  onClick={() => setViewingBills(true)}
                  className="h-12 w-full mt-2 flex items-center justify-center bg-white border border-border hover:bg-background active:bg-border text-sm font-bold text-text-primary rounded-button transition-colors select-none cursor-pointer"
                >
                  View all bills for this day
                </button>
              )}

            </Card>
          )}
        </div>
      )}

      {/* Export Reports Section */}
      {!viewingBills && (
        <Card className="flex flex-col gap-4 border border-border p-5">
          <div className="flex flex-col select-none">
            <h2 className="text-base font-bold text-text-primary">Export Reports</h2>
            <p className="text-xs text-text-secondary mt-1">
              Download daily register summaries and bill details as spreadsheets (CSV).
            </p>
          </div>

          <div className="border-t border-border my-1" />

          <div className="flex flex-col gap-3">
            <div>
              <button
                type="button"
                disabled={exportingDaily}
                onClick={handleExportDaily}
                className="flex items-center justify-center gap-2 h-14 w-full bg-white border border-border hover:bg-background active:bg-border disabled:bg-background disabled:text-text-secondary disabled:cursor-not-allowed text-base font-bold text-text-primary rounded-button transition-colors select-none cursor-pointer"
              >
                {exportingDaily ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-text-secondary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Exporting Daily Summary...</span>
                  </>
                ) : (
                  <span>Download Daily Sales Summary</span>
                )}
              </button>
              <p className="text-[11px] text-text-secondary leading-normal select-none mt-1.5 px-1">
                Downloads a spreadsheet showing opening/closing balances, revenue, cash/UPI split, and variance for the last 30 days.
              </p>
            </div>

            <div className="mt-2">
              <button
                type="button"
                disabled={exportingBills}
                onClick={handleExportBills}
                className="flex items-center justify-center gap-2 h-14 w-full bg-white border border-border hover:bg-background active:bg-border disabled:bg-background disabled:text-text-secondary disabled:cursor-not-allowed text-base font-bold text-text-primary rounded-button transition-colors select-none cursor-pointer"
              >
                {exportingBills ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-text-secondary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Exporting Bills...</span>
                  </>
                ) : (
                  <span>Download Bills for {formatDateFriendly(selectedDate)}</span>
                )}
              </button>
              <p className="text-[11px] text-text-secondary leading-normal select-none mt-1.5 px-1">
                Downloads a spreadsheet showing all individual transactions, item details, payment methods, subtotals, and discounts for the selected day.
              </p>
            </div>
          </div>
          
          {exportError && (
            <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-input font-medium select-none">
              {exportError}
            </div>
          )}
        </Card>
      )}

      {/* History 30 days list */}
      <div className="flex flex-col gap-4 select-none">
        
        <div className="flex flex-col border-t border-border pt-6">
          <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
            History (Last 30 days)
          </h2>
        </div>

        {rangeLoading ? (
          <div className="text-center py-6 text-sm text-text-secondary">Loading history...</div>
        ) : rangeError ? (
          <div className="p-3 bg-danger/10 text-danger text-sm rounded-input font-medium">
            {rangeError}
          </div>
        ) : !rangeData || rangeData.days.length === 0 ? (
          <Card className="text-center py-6 text-sm text-text-secondary">
            No historical session data found.
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            
            {/* Range Totals header */}
            <Card className="bg-background border border-border p-4 flex flex-col gap-3 font-semibold text-sm">
              <div className="text-xs font-bold text-text-secondary uppercase tracking-widest border-b border-border/60 pb-1.5">
                Range Totals
              </div>
              <div className="flex justify-between items-center text-text-secondary">
                <span>Total Revenue:</span>
                <span className="text-text-primary font-bold">{formatRupees(rangeData.total_revenue)}</span>
              </div>
              <div className="flex justify-between items-center text-text-secondary">
                <span>Total Bills Count:</span>
                <span className="text-text-primary font-bold">{rangeData.total_bills} bills</span>
              </div>
              <div className="flex justify-between items-center text-text-secondary">
                <span>Cash Portion:</span>
                <span className="text-text-primary font-bold">{formatRupees(rangeData.total_cash)}</span>
              </div>
              <div className="flex justify-between items-center text-text-secondary">
                <span>UPI Portion:</span>
                <span className="text-text-primary font-bold">{formatRupees(rangeData.total_upi)}</span>
              </div>
            </Card>

            {/* List of days */}
            <div className="flex flex-col gap-3">
              {rangeData.days.map((day) => {
                const isShortage = day.variance !== null && day.variance < 0;
                
                return (
                  <Card
                    key={day.session_date}
                    onClick={() => handleSelectRecentDay(day.session_date)}
                    className="flex justify-between items-center p-4 border border-border hover:border-accent active:bg-background transition-all cursor-pointer"
                  >
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold text-text-primary">
                        {formatDateFriendly(day.session_date)}
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-text-secondary">
                        <span>{day.bill_count} bills</span>
                        <span>·</span>
                        <span>Cash: {formatRupees(day.cash_total)}</span>
                        <span>·</span>
                        <span>UPI: {formatRupees(day.upi_total)}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-base font-extrabold text-text-primary">
                        {formatRupees(day.revenue)}
                      </span>
                      {day.variance !== null && day.variance !== 0 && (
                        <span className={`text-[10px] font-bold ${isShortage ? 'text-danger' : 'text-accent'}`}>
                          {day.variance > 0 ? '+' : ''}{formatRupees(day.variance)} {isShortage ? 'short' : 'surplus'}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

          </div>
        )}

      </div>

    </div>
  );
};

export default Admin;
