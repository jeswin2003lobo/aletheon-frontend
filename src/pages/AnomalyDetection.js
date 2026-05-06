import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../context/TranslationContext';
import { useApiData } from '../hooks/useApiData';
import { getAnomalyOverview, getActionSheet, getAnomalyScores, getSignalSummary, getActionSheetCase } from '../api/client';
import { TableSkeleton, ChartSkeleton } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import Pagination from '../components/Pagination';
import { formatINR, truncateHash, getPriorityColor, signalDisplayName, displayValue } from '../utils/formatters';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { X, MapPin } from 'lucide-react';

const DETECTOR_SIGNALS = ['sig_peer_drift', 'sig_sudden_drop', 'sig_billing_cycle_drop', 'sig_tamper_event', 'sig_after_hours_commercial', 'sig_comm_failure', 'sig_reading_plateau', 'sig_pf_register'];
const SUPPRESSOR_SIGNALS = ['sig_genuine_low_usage_context', 'sig_solar_export_normal', 'sig_ev_consistent_night_pattern'];

export default function AnomalyDetection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('action');
  const [actionPage, setActionPage] = useState(1);
  const [metersPage, setMetersPage] = useState(1);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [meterFilters, setMeterFilters] = useState({});
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseDetail, setCaseDetail] = useState(null);
  const [caseLoading, setCaseLoading] = useState(false);

  const { data: overview, loading: ovLoading, error: ovError, retry: ovRetry } = useApiData(getAnomalyOverview);
  const { data: signals, loading: sigLoading, error: sigError, retry: sigRetry } = useApiData(getSignalSummary);

  const fetchAction = useCallback(() => getActionSheet({ page: actionPage, page_size: 50, priority: priorityFilter || undefined, team: teamFilter || undefined }), [actionPage, priorityFilter, teamFilter]);
  const { data: actionData, loading: actLoading, error: actError, retry: actRetry } = useApiData(fetchAction, [actionPage, priorityFilter, teamFilter]);

  const fetchMeters = useCallback(() => getAnomalyScores({ page: metersPage, page_size: 50, ...meterFilters }), [metersPage, meterFilters]);
  const { data: metersData, loading: metLoading, error: metError, retry: metRetry } = useApiData(fetchMeters, [metersPage, meterFilters], { immediate: activeTab === 'meters' });

  useEffect(() => {
    if (activeTab === 'meters' && !metersData) {
      metRetry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Derive teams from action data
  const teams = useMemo(() => {
    if (!actionData?.data) return [];
    return [...new Set(actionData.data.map(d => d.recommended_team).filter(Boolean))];
  }, [actionData]);

  // Compute suppressed count from tier_distribution
  const suppressedCount = useMemo(() => {
    if (!overview?.tier_distribution) return 0;
    return Object.entries(overview.tier_distribution)
      .filter(([k]) => /SUPPRESS|PREVENT|CONTEXT/i.test(k))
      .reduce((sum, [, v]) => sum + v, 0);
  }, [overview]);

  // Signal chart data
  const signalChartData = useMemo(() => {
    if (!signals) return [];
    return DETECTOR_SIGNALS
      .map(key => ({ name: signalDisplayName(key), value: signals[key] || 0, key }))
      .sort((a, b) => b.value - a.value);
  }, [signals]);

  const suppressorData = useMemo(() => {
    if (!signals) return [];
    return SUPPRESSOR_SIGNALS.map(key => ({ name: signalDisplayName(key), value: signals[key] || 0 }));
  }, [signals]);

  // Handle case click
  const handleCaseClick = async (row) => {
    setSelectedCase(row);
    setCaseLoading(true);
    try {
      const detail = await getActionSheetCase(row.case_id);
      setCaseDetail(detail);
    } catch (e) {
      setCaseDetail(null);
    } finally {
      setCaseLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Stat Row */}
      <section data-testid="anomaly-stats">
        {ovLoading ? (
          <div className="animate-pulse h-6 bg-[#1A1A1A] w-96 rounded-sm" />
        ) : ovError ? (
          <ErrorState message={ovError} onRetry={ovRetry} />
        ) : overview ? (
          <div className="flex flex-wrap gap-4 text-sm font-mono">
            <span className="text-[#737373]">Active: <span className="text-[#FAFAFA]">{overview.active_meters}</span></span>
            <span className="text-[#737373]">·</span>
            <span className="text-[#737373]">P1: <span className="text-[#EF4444]">{overview.p1_cases}</span></span>
            <span className="text-[#737373]">·</span>
            <span className="text-[#737373]">P2: <span className="text-[#F59E0B]">{overview.p2_cases}</span></span>
            <span className="text-[#737373]">·</span>
            <span className="text-[#737373]">P3: <span className="text-[#3B82F6]">{overview.p3_cases}</span></span>
            <span className="text-[#737373]">·</span>
            <span className="text-[#737373]">Suppressed: <span className="text-[#525252]">{suppressedCount}</span></span>
          </div>
        ) : null}
      </section>

      {/* Tabs */}
      <section>
        <div className="flex gap-6 border-b border-[#1A1A1A] mb-4">
          <button
            onClick={() => setActiveTab('action')}
            className={`pb-2 text-sm transition-colors ${activeTab === 'action' ? 'text-white border-b border-white' : 'text-[#737373] hover:text-[#FAFAFA]'}`}
            data-testid="tab-action"
          >
            Action Sheet
          </button>
          <button
            onClick={() => setActiveTab('meters')}
            className={`pb-2 text-sm transition-colors ${activeTab === 'meters' ? 'text-white border-b border-white' : 'text-[#737373] hover:text-[#FAFAFA]'}`}
            data-testid="tab-meters"
          >
            All Meters
          </button>
        </div>

        {activeTab === 'action' && (
          <div>
            {/* Filters */}
            <div className="flex gap-3 mb-4">
              <select
                value={priorityFilter}
                onChange={(e) => { setPriorityFilter(e.target.value); setActionPage(1); }}
                className="bg-[#0A0A0A] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-1.5 outline-none focus:border-[#525252]"
                data-testid="filter-priority"
              >
                <option value="">All Priority</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
              <select
                value={teamFilter}
                onChange={(e) => { setTeamFilter(e.target.value); setActionPage(1); }}
                className="bg-[#0A0A0A] border border-[#1A1A1A] text-sm text-[#FAFAFA] px-3 py-1.5 outline-none focus:border-[#525252]"
                data-testid="filter-team"
              >
                <option value="">All Teams</option>
                {teams.map(team => <option key={team} value={team}>{team}</option>)}
              </select>
            </div>

            {/* Action Sheet Table */}
            {actLoading ? (
              <TableSkeleton rows={10} cols={8} />
            ) : actError ? (
              <ErrorState message={actError} onRetry={actRetry} />
            ) : !actionData?.data?.length ? (
              <EmptyState message="No action items found" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[#525252] text-xs uppercase tracking-wide border-b border-[#1A1A1A]">
                        <th className="text-left py-2 font-normal">Case ID</th>
                        <th className="text-left py-2 font-normal">{t('Priority')}</th>
                        <th className="text-left py-2 font-normal">Locality</th>
                        <th className="text-right py-2 font-normal">{t('Risk Score')}</th>
                        <th className="text-right py-2 font-normal">{t('Confidence')}</th>
                        <th className="text-left py-2 font-normal">Fingerprint</th>
                        <th className="text-left py-2 font-normal">Team</th>
                        <th className="text-right py-2 font-normal">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionData.data.map((row, i) => (
                        <tr
                          key={row.case_id || i}
                          className="border-b border-[#1A1A1A] hover:bg-[#0A0A0A] cursor-pointer transition-colors"
                          onClick={() => handleCaseClick(row)}
                          data-testid={`action-row-${i}`}
                        >
                          <td className="py-2.5 font-mono text-xs text-[#FAFAFA]">{truncateHash(row.case_id, 12)}</td>
                          <td className="py-2.5">
                            <span
                              className={`text-xs font-mono px-2 py-0.5 rounded-sm ${row.priority === 'P1' ? 'animate-pulse-slow' : ''}`}
                              style={{ backgroundColor: getPriorityColor(row.priority) + '20', color: getPriorityColor(row.priority) }}
                            >
                              {row.priority}
                            </span>
                          </td>
                          <td className="py-2.5 text-[#737373]">{displayValue(row.locality)}</td>
                          <td className="py-2.5 text-right font-mono text-[#FAFAFA]">{displayValue(row.risk_score)}</td>
                          <td className="py-2.5 text-right font-mono text-[#FAFAFA]">{row.confidence_pct != null ? `${row.confidence_pct}%` : '\u2014'}</td>
                          <td className="py-2.5 text-[#737373] text-xs font-mono">{truncateHash(row.alert_fingerprint, 10)}</td>
                          <td className="py-2.5 text-[#737373]">{displayValue(row.recommended_team)}</td>
                          <td className="py-2.5 text-right font-mono text-[#FAFAFA]">{row.estimated_revenue_impact_inr ? formatINR(row.estimated_revenue_impact_inr) : '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={actionPage}
                  pageSize={50}
                  totalRecords={actionData.pagination?.total_records}
                  onPageChange={setActionPage}
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'meters' && (
          <div>
            {metLoading ? (
              <TableSkeleton rows={10} cols={7} />
            ) : metError ? (
              <ErrorState message={metError} onRetry={metRetry} />
            ) : !metersData?.data?.length ? (
              <EmptyState message="No meter data found" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[#525252] text-xs uppercase tracking-wide border-b border-[#1A1A1A]">
                        <th className="text-left py-2 font-normal">Meter ID</th>
                        <th className="text-left py-2 font-normal">Locality</th>
                        <th className="text-left py-2 font-normal">Category</th>
                        <th className="text-right py-2 font-normal">{t('Risk Score')}</th>
                        <th className="text-left py-2 font-normal">Tier</th>
                        <th className="text-left py-2 font-normal">{t('Priority')}</th>
                        <th className="text-right py-2 font-normal">Signals</th>
                        <th className="text-right py-2 font-normal">IF Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metersData.data.map((row, i) => (
                        <tr
                          key={row.meter_id_hash || i}
                          className={`border-b border-[#1A1A1A] hover:bg-[#0A0A0A] transition-colors ${row.priority === 'P1' ? 'border-l-2 border-l-[#EF4444]' : ''}`}
                          data-testid={`meter-row-${i}`}
                        >
                          <td className="py-2.5 font-mono text-xs text-[#FAFAFA]">{truncateHash(row.meter_id_hash)}</td>
                          <td className="py-2.5 text-[#737373]">{displayValue(row.locality)}</td>
                          <td className="py-2.5 text-[#737373]">{displayValue(row.consumer_category)}</td>
                          <td className="py-2.5 text-right font-mono text-[#FAFAFA]">{displayValue(row.risk_score)}</td>
                          <td className="py-2.5 text-xs text-[#737373]">{displayValue(row.risk_tier)}</td>
                          <td className="py-2.5">
                            {row.priority && (
                              <span className="text-xs font-mono px-2 py-0.5 rounded-sm" style={{ backgroundColor: getPriorityColor(row.priority) + '20', color: getPriorityColor(row.priority) }}>
                                {row.priority}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-right font-mono text-[#737373]">{displayValue(row.independent_signal_count)}</td>
                          <td className="py-2.5 text-right font-mono text-[#737373]">{displayValue(row.isolation_forest_score)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={metersPage}
                  pageSize={50}
                  totalRecords={metersData.pagination?.total_records}
                  onPageChange={setMetersPage}
                />
              </>
            )}
          </div>
        )}
      </section>

      {/* Signal Analysis */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-4">Signal Triggers (Detectors)</h2>
          {sigLoading ? (
            <ChartSkeleton height="h-72" />
          ) : sigError ? (
            <ErrorState message={sigError} onRetry={sigRetry} />
          ) : signalChartData.length === 0 ? (
            <EmptyState message="No signal data" />
          ) : (
            <div className="h-64 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signalChartData} layout="vertical" margin={{ left: 80, right: 16, top: 5, bottom: 5 }}>
                  <XAxis type="number" stroke="#525252" tick={{ fontSize: 10, fill: '#737373' }} />
                  <YAxis type="category" dataKey="name" stroke="#1A1A1A" tick={{ fontSize: 10, fill: '#737373' }} width={75} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #1A1A1A', fontSize: 12 }}
                    labelStyle={{ color: '#FAFAFA' }}
                  />
                  <Bar dataKey="value" radius={[0, 2, 2, 0]} animationDuration={800}>
                    {signalChartData.map((entry, i) => (
                      <Cell key={i} fill={i === 0 ? '#FAFAFA' : '#737373'} fillOpacity={1 - i * 0.08} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-4">Suppressor Signals</h2>
          {sigLoading ? (
            <ChartSkeleton height="h-72" />
          ) : suppressorData.length === 0 ? (
            <EmptyState message="No suppressor data" />
          ) : (
            <div className="space-y-4 pt-4">
              {suppressorData.map((s, i) => (
                <div key={s.name} className="opacity-0 animate-fadeIn" style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'forwards' }}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#737373]">{s.name}</span>
                    <span className="font-mono text-[#FAFAFA]">{s.value}</span>
                  </div>
                  <div className="h-2 bg-[#1A1A1A] rounded-sm overflow-hidden">
                    <div className="h-full bg-[#525252] rounded-sm transition-all duration-700" style={{ width: `${Math.min((s.value / (Math.max(...suppressorData.map(x => x.value)) || 1)) * 100, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Slide-over Panel */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="case-panel">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedCase(null)} />
          <div className="relative w-full max-w-full md:max-w-lg bg-[#0A0A0A] border-l border-[#1A1A1A] overflow-y-auto p-4 md:p-6 animate-slideIn">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base text-white font-mono">{selectedCase.case_id}</h3>
              <button onClick={() => setSelectedCase(null)} className="text-[#737373] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {caseLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="animate-pulse h-6 bg-[#1A1A1A] rounded-sm" />)}
              </div>
            ) : caseDetail ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-[#525252] text-xs">Priority</span><p className="font-mono" style={{ color: getPriorityColor(caseDetail.priority) }}>{caseDetail.priority}</p></div>
                  <div><span className="text-[#525252] text-xs">Locality</span><p className="text-[#FAFAFA]">{displayValue(caseDetail.locality)}</p></div>
                  <div><span className="text-[#525252] text-xs">Risk Score</span><p className="font-mono text-[#FAFAFA]">{displayValue(caseDetail.risk_score)}</p></div>
                  <div><span className="text-[#525252] text-xs">Confidence</span><p className="font-mono text-[#FAFAFA]">{caseDetail.confidence_pct ? `${caseDetail.confidence_pct}%` : '\u2014'}</p></div>
                  <div><span className="text-[#525252] text-xs">Team</span><p className="text-[#FAFAFA]">{displayValue(caseDetail.recommended_team)}</p></div>
                  <div><span className="text-[#525252] text-xs">Revenue</span><p className="font-mono text-[#FAFAFA]">{caseDetail.estimated_revenue_impact_inr ? formatINR(caseDetail.estimated_revenue_impact_inr) : '\u2014'}</p></div>
                </div>
                {caseDetail.alert_fingerprint && (
                  <div><span className="text-[#525252] text-xs">Fingerprint</span><p className="font-mono text-xs text-[#737373] break-all">{caseDetail.alert_fingerprint}</p></div>
                )}
                {caseDetail.recommended_action && (
                  <div><span className="text-[#525252] text-xs">Action</span><p className="text-[#FAFAFA]">{caseDetail.recommended_action}</p></div>
                )}
              </div>
            ) : (
              <p className="text-[#525252] text-sm">Unable to load case details</p>
            )}

            <div className="flex gap-3 mt-6 pt-4 border-t border-[#1A1A1A]">
              <button
                onClick={() => navigate(`/map?meter=${selectedCase.meter_id_hash}`)}
                className="flex items-center gap-2 px-3 py-2 text-xs border border-[#1A1A1A] text-[#737373] hover:text-white hover:border-[#525252] transition-colors"
              >
                <MapPin className="w-3 h-3" /> View on Map
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
