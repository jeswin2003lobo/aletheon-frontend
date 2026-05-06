import React, { useState, useCallback } from 'react';
import { useApiData } from '../hooks/useApiData';
import {
  getEvaluation, getFPAudit, getFPRateBySignal, getThresholds,
  getFeedbackStats, getFeedbackList, submitFeedback,
  sendSMS, sendAlert, getHolidays, translateToKannada, getTranslationCacheStats
} from '../api/client';
import { TableSkeleton, ChartSkeleton } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { displayValue, signalDisplayName, truncateHash } from '../utils/formatters';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Check, AlertCircle } from 'lucide-react';

const TABS = ['Evaluation', 'Thresholds', 'Feedback', 'Notifications', 'Holidays'];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('Evaluation');

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Tabs */}
      <div className="flex gap-6 border-b border-[#1A1A1A]">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 text-sm transition-colors ${activeTab === tab ? 'text-white border-b border-white' : 'text-[#737373] hover:text-[#FAFAFA]'}`}
            data-testid={`settings-tab-${tab.toLowerCase()}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Evaluation' && <EvaluationTab />}
      {activeTab === 'Thresholds' && <ThresholdsTab />}
      {activeTab === 'Feedback' && <FeedbackTab />}
      {activeTab === 'Notifications' && <NotificationsTab />}
      {activeTab === 'Holidays' && <HolidaysTab />}
    </div>
  );
}

function EvaluationTab() {
  const { data: evalData, loading: evalLoading, error: evalError, retry: evalRetry } = useApiData(getEvaluation);
  const { data: fpAudit, loading: fpLoading, error: fpError, retry: fpRetry } = useApiData(getFPAudit);
  const { data: fpRate, loading: frLoading, error: frError, retry: frRetry } = useApiData(getFPRateBySignal);

  const bestF1 = evalData ? Math.max(...evalData.map(e => e.f1_score || 0)) : 0;

  return (
    <div className="space-y-8">
      {/* Evaluation Table */}
      <div>
        <h3 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-3">Model Evaluation</h3>
        {evalLoading ? <TableSkeleton rows={6} cols={7} /> : evalError ? <ErrorState message={evalError} onRetry={evalRetry} /> : !evalData?.length ? <EmptyState message="No evaluation data" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#525252] text-xs uppercase border-b border-[#1A1A1A]">
                  <th className="text-left py-2 font-normal">Slice</th>
                  <th className="text-right py-2 font-normal">Precision</th>
                  <th className="text-right py-2 font-normal">Recall</th>
                  <th className="text-right py-2 font-normal">F1</th>
                  <th className="text-right py-2 font-normal">TP</th>
                  <th className="text-right py-2 font-normal">FP</th>
                  <th className="text-right py-2 font-normal">FN</th>
                </tr>
              </thead>
              <tbody>
                {evalData.map((row, i) => (
                  <tr key={i} className={`border-b border-[#1A1A1A] ${row.f1_score === bestF1 ? 'text-white' : 'text-[#737373]'}`}>
                    <td className="py-2.5 text-xs">{displayValue(row.evaluation_slice)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.precision)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.recall)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.f1_score)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.true_positives)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.false_positives)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.false_negatives)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FP Audit */}
      <div>
        <h3 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-3">False Positive Audit</h3>
        {fpLoading ? <TableSkeleton rows={4} cols={4} /> : fpError ? <ErrorState message={fpError} onRetry={fpRetry} /> : !fpAudit?.length ? <EmptyState message="No FP audit data" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#525252] text-xs uppercase border-b border-[#1A1A1A]">
                  <th className="text-left py-2 font-normal">Bucket</th>
                  <th className="text-right py-2 font-normal">Count</th>
                  <th className="text-right py-2 font-normal">%</th>
                  <th className="text-left py-2 font-normal">Proves</th>
                </tr>
              </thead>
              <tbody>
                {fpAudit.map((row, i) => (
                  <tr key={i} className="border-b border-[#1A1A1A] text-[#737373]">
                    <td className="py-2.5 text-xs text-[#FAFAFA]">{displayValue(row.bucket)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.count)}</td>
                    <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.percentage)}%</td>
                    <td className="py-2.5 text-xs">{displayValue(row.what_it_proves)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FP Rate by Signal */}
      <div>
        <h3 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-3">FP Rate by Signal</h3>
        {frLoading ? <ChartSkeleton height="h-48" /> : frError ? <ErrorState message={frError} onRetry={frRetry} /> : !fpRate?.length ? <EmptyState message="No FP rate data" /> : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fpRate.map(r => ({ ...r, name: signalDisplayName(r.signal_name) }))} layout="vertical" margin={{ left: 100, right: 20 }}>
                <XAxis type="number" stroke="#525252" tick={{ fontSize: 10, fill: '#737373' }} />
                <YAxis type="category" dataKey="name" stroke="#1A1A1A" tick={{ fontSize: 10, fill: '#737373' }} width={95} />
                <Tooltip contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #1A1A1A', fontSize: 11 }} />
                <Bar dataKey="false_positive_rate_pct" radius={[0, 2, 2, 0]} fill="#737373" animationDuration={600} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function ThresholdsTab() {
  const { data, loading, error, retry } = useApiData(getThresholds);

  return (
    <div>
      <h3 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-3">Signal Thresholds</h3>
      {loading ? <TableSkeleton rows={8} cols={6} /> : error ? <ErrorState message={error} onRetry={retry} /> : !data?.length ? <EmptyState message="No threshold data" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#525252] text-xs uppercase border-b border-[#1A1A1A]">
                <th className="text-left py-2 font-normal">Signal</th>
                <th className="text-right py-2 font-normal">Old</th>
                <th className="text-right py-2 font-normal">New</th>
                <th className="text-left py-2 font-normal">Reason</th>
                <th className="text-left py-2 font-normal">Changed By</th>
                <th className="text-left py-2 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-[#1A1A1A] text-[#737373]">
                  <td className="py-2.5 text-xs text-[#FAFAFA]">{signalDisplayName(row.signal_name)}</td>
                  <td className="py-2.5 text-right font-mono text-xs">{displayValue(row.old_threshold)}</td>
                  <td className="py-2.5 text-right font-mono text-xs text-[#FAFAFA]">{displayValue(row.new_threshold)}</td>
                  <td className="py-2.5 text-xs">{displayValue(row.reason)}</td>
                  <td className="py-2.5 text-xs">{displayValue(row.changed_by)}</td>
                  <td className="py-2.5 text-xs font-mono">{row.changed_at ? new Date(row.changed_at).toLocaleDateString() : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FeedbackTab() {
  const { data: stats, loading: sLoading } = useApiData(getFeedbackStats);
  const { data: list, loading: lLoading, error: lError, retry: lRetry, refetch } = useApiData(getFeedbackList);
  const [form, setForm] = useState({ case_id: '', meter_id_hash: '', inspector_id: '', feedback_type: 'CONFIRMED_THEFT', finding: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const result = await submitFeedback(form);
      setSubmitResult({ success: true, message: `Submitted: ${result.case_id || form.case_id}` });
      setForm({ case_id: '', meter_id_hash: '', inspector_id: '', feedback_type: 'CONFIRMED_THEFT', finding: '', notes: '' });
      refetch();
    } catch (e) {
      setSubmitResult({ success: false, message: e.message || 'Failed to submit' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="flex gap-4 text-sm font-mono">
          <span className="text-[#737373]">Total: <span className="text-[#FAFAFA]">{stats.total_feedback}</span></span>
          {stats.by_type && Object.entries(stats.by_type).map(([k, v]) => (
            <span key={k} className="text-[#525252]">{k}: {v}</span>
          ))}
        </div>
      )}

      {/* Submit Form */}
      <form onSubmit={handleSubmit} className="border border-[#1A1A1A] p-4 space-y-3">
        <h4 className="text-sm text-[#737373] uppercase tracking-wide font-mono">Submit Feedback</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Case ID" value={form.case_id} onChange={e => setForm(prev => ({ ...prev, case_id: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]" required />
          <input placeholder="Meter ID" value={form.meter_id_hash} onChange={e => setForm(prev => ({ ...prev, meter_id_hash: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]" required />
          <input placeholder="Inspector ID" value={form.inspector_id} onChange={e => setForm(prev => ({ ...prev, inspector_id: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.feedback_type} onChange={e => setForm(prev => ({ ...prev, feedback_type: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none">
            <option value="CONFIRMED_THEFT">Confirmed Theft</option>
            <option value="FALSE_POSITIVE">False Positive</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
            <option value="METER_FAULT">Meter Fault</option>
            <option value="LEGITIMATE_USE">Legitimate Use</option>
          </select>
          <input placeholder="Finding" value={form.finding} onChange={e => setForm(prev => ({ ...prev, finding: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]" required />
        </div>
        <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} className="w-full bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252] h-20 resize-none" />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting} className="text-xs px-4 py-2 bg-white text-black hover:bg-[#E0E0E0] disabled:opacity-50 transition-colors">
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
          {submitResult && (
            <span className={`text-xs flex items-center gap-1 ${submitResult.success ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
              {submitResult.success ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {submitResult.message}
            </span>
          )}
        </div>
      </form>

      {/* Recent Feedback */}
      <div>
        <h4 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-3">Recent Feedback</h4>
        {lLoading ? <TableSkeleton rows={5} cols={5} /> : lError ? <ErrorState message={lError} onRetry={lRetry} /> : !list?.length ? <EmptyState message="No feedback yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#525252] text-xs uppercase border-b border-[#1A1A1A]">
                  <th className="text-left py-2 font-normal">Case</th>
                  <th className="text-left py-2 font-normal">Type</th>
                  <th className="text-left py-2 font-normal">Finding</th>
                  <th className="text-left py-2 font-normal">Inspector</th>
                  <th className="text-left py-2 font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(list) ? list : []).slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-[#1A1A1A] text-[#737373]">
                    <td className="py-2 text-xs font-mono text-[#FAFAFA]">{truncateHash(row.case_id, 10)}</td>
                    <td className="py-2 text-xs">{displayValue(row.feedback_type)}</td>
                    <td className="py-2 text-xs">{displayValue(row.finding)}</td>
                    <td className="py-2 text-xs">{displayValue(row.inspector_id)}</td>
                    <td className="py-2 text-xs font-mono">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [smsForm, setSmsForm] = useState({ message: '', phone_numbers: '' });
  const [alertForm, setAlertForm] = useState({ case_id: '', meter_id: '', priority: 'P1', reason: '' });
  const [smsResult, setSmsResult] = useState(null);
  const [alertResult, setAlertResult] = useState(null);
  const [smsSending, setSmsSending] = useState(false);
  const [alertSending, setAlertSending] = useState(false);

  const handleSMS = async (e) => {
    e.preventDefault();
    setSmsSending(true);
    setSmsResult(null);
    try {
      const result = await sendSMS(smsForm);
      setSmsResult({ success: result.sent !== false, message: result.error || `Message sent: "${result.message_sent}"` });
    } catch (e) {
      setSmsResult({ success: false, message: e.message });
    } finally {
      setSmsSending(false);
    }
  };

  const handleAlert = async (e) => {
    e.preventDefault();
    setAlertSending(true);
    setAlertResult(null);
    try {
      const result = await sendAlert(alertForm);
      setAlertResult({ success: result.sent !== false, message: result.error || 'Alert sent successfully' });
    } catch (e) {
      setAlertResult({ success: false, message: e.message });
    } finally {
      setAlertSending(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* SMS Form */}
      <form onSubmit={handleSMS} className="border border-[#1A1A1A] p-4 space-y-3">
        <h4 className="text-sm text-[#737373] uppercase tracking-wide font-mono">Send SMS</h4>
        <textarea placeholder="Message" value={smsForm.message} onChange={e => setSmsForm(prev => ({ ...prev, message: e.target.value }))} className="w-full bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252] h-20 resize-none" required />
        <input placeholder="Phone numbers (optional, comma-separated)" value={smsForm.phone_numbers} onChange={e => setSmsForm(prev => ({ ...prev, phone_numbers: e.target.value }))} className="w-full bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]" />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={smsSending} className="text-xs px-4 py-2 bg-white text-black hover:bg-[#E0E0E0] disabled:opacity-50 transition-colors">{smsSending ? 'Sending...' : 'Send SMS'}</button>
          {smsResult && (
            <span className={`text-xs ${smsResult.success ? 'text-[#22C55E]' : 'text-[#F59E0B]'}`}>{smsResult.message}</span>
          )}
        </div>
      </form>

      {/* Alert Form */}
      <form onSubmit={handleAlert} className="border border-[#1A1A1A] p-4 space-y-3">
        <h4 className="text-sm text-[#737373] uppercase tracking-wide font-mono">Send Alert</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Case ID" value={alertForm.case_id} onChange={e => setAlertForm(prev => ({ ...prev, case_id: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]" required />
          <input placeholder="Meter ID" value={alertForm.meter_id} onChange={e => setAlertForm(prev => ({ ...prev, meter_id: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]" required />
          <select value={alertForm.priority} onChange={e => setAlertForm(prev => ({ ...prev, priority: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none">
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <input placeholder="Reason" value={alertForm.reason} onChange={e => setAlertForm(prev => ({ ...prev, reason: e.target.value }))} className="bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]" required />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={alertSending} className="text-xs px-4 py-2 bg-white text-black hover:bg-[#E0E0E0] disabled:opacity-50 transition-colors">{alertSending ? 'Sending...' : 'Send Alert'}</button>
          {alertResult && (
            <span className={`text-xs ${alertResult.success ? 'text-[#22C55E]' : 'text-[#F59E0B]'}`}>{alertResult.message}</span>
          )}
        </div>
      </form>
    </div>
  );
}

function HolidaysTab() {
  const { data: holidays, loading: hLoading, error: hError, retry: hRetry } = useApiData(useCallback(() => getHolidays({ year: 2025 }), []));
  const { data: cacheStats } = useApiData(getTranslationCacheStats);
  const [transInput, setTransInput] = useState('');
  const [transResult, setTransResult] = useState(null);
  const [transLoading, setTransLoading] = useState(false);

  const handleTranslate = async (e) => {
    e.preventDefault();
    if (!transInput.trim()) return;
    setTransLoading(true);
    try {
      const result = await translateToKannada(transInput);
      setTransResult(result);
    } catch (e) {
      setTransResult({ error: e.message });
    } finally {
      setTransLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Holidays */}
      <div>
        <h3 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-1">Karnataka Holidays</h3>
        {holidays && <p className="text-xs text-[#525252] mb-3 font-mono">{holidays.count} holidays · Calendarific API · Karnataka (in-ka)</p>}
        {hLoading ? <TableSkeleton rows={8} cols={3} /> : hError ? <ErrorState message={hError} onRetry={hRetry} /> : !holidays?.holidays?.length ? <EmptyState message="No holidays data (API key may not be configured)" /> : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#000]">
                <tr className="text-[#525252] text-xs uppercase border-b border-[#1A1A1A]">
                  <th className="text-left py-2 font-normal">Date</th>
                  <th className="text-left py-2 font-normal">Name</th>
                  <th className="text-left py-2 font-normal">Type</th>
                </tr>
              </thead>
              <tbody>
                {holidays.holidays.map((h, i) => (
                  <tr key={i} className="border-b border-[#1A1A1A] text-[#737373]">
                    <td className="py-2 text-xs font-mono">{h.date}</td>
                    <td className="py-2 text-xs text-[#FAFAFA]">{h.name}</td>
                    <td className="py-2 text-xs">{h.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Translation Tester */}
      <div className="border border-[#1A1A1A] p-4 space-y-3">
        <h4 className="text-sm text-[#737373] uppercase tracking-wide font-mono">Translation Tester</h4>
        <form onSubmit={handleTranslate} className="flex gap-2">
          <input
            placeholder="Enter English text..."
            value={transInput}
            onChange={e => setTransInput(e.target.value)}
            className="flex-1 bg-[#000] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-2 outline-none focus:border-[#525252]"
          />
          <button type="submit" disabled={transLoading} className="text-xs px-4 py-2 bg-white text-black hover:bg-[#E0E0E0] disabled:opacity-50 transition-colors">
            {transLoading ? '...' : 'Translate'}
          </button>
        </form>
        {transResult && (
          <div className="text-sm">
            {transResult.error ? (
              <p className="text-[#F59E0B]">{transResult.error}</p>
            ) : (
              <div className="space-y-1">
                <p className="text-[#737373]">English: <span className="text-[#FAFAFA]">{transResult.english}</span></p>
                <p className="text-[#737373]">Kannada: <span className="text-[#FAFAFA]">{transResult.kannada}</span></p>
              </div>
            )}
          </div>
        )}
        {cacheStats && (
          <p className="text-xs text-[#525252] font-mono">{cacheStats.cached_translations} translations cached</p>
        )}
      </div>
    </div>
  );
}
