import React, { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../context/TranslationContext';
import { useApiData } from '../hooks/useApiData';
import { getGridOverview, getBaselines, getFeatureImportance, getFeederForecast } from '../api/client';
import { TableSkeleton, ChartSkeleton } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { truncateHash, getBandColor, displayValue } from '../utils/formatters';
import { Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, ReferenceLine, BarChart, Bar, Cell, ComposedChart } from 'recharts';

export default function GridWatch() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const initialFeeder = searchParams.get('feeder');
  const [selectedFeeder, setSelectedFeeder] = useState(initialFeeder || null);
  const [testOnly, setTestOnly] = useState(true);

  const { data: gridData, loading: gridLoading, error: gridError, retry: gridRetry } = useApiData(getGridOverview);
  const { data: baselines, loading: blLoading, error: blError, retry: blRetry } = useApiData(getBaselines);
  const { data: features, loading: ftLoading, error: ftError, retry: ftRetry } = useApiData(getFeatureImportance);

  const fetchForecast = useCallback(() => {
    if (!selectedFeeder) return Promise.resolve(null);
    return getFeederForecast(selectedFeeder, testOnly);
  }, [selectedFeeder, testOnly]);
  const { data: forecast, loading: fcLoading, error: fcError, retry: fcRetry } = useApiData(fetchForecast, [selectedFeeder, testOnly], { immediate: !!selectedFeeder });

  // Sort feeders by band
  const sortedFeeders = useMemo(() => {
    if (!gridData?.feeders) return [];
    const order = { RED: 0, AMBER: 1, GREEN: 2 };
    return [...gridData.feeders].sort((a, b) => (order[a.grid_risk_band] ?? 3) - (order[b.grid_risk_band] ?? 3));
  }, [gridData]);

  // Feature importance (top 10)
  const topFeatures = useMemo(() => {
    if (!features) return [];
    return [...features].sort((a, b) => (b.importance_gain || 0) - (a.importance_gain || 0)).slice(0, 10);
  }, [features]);

  const summary = gridData?.summary;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Stress Summary */}
      <section data-testid="stress-summary">
        {gridLoading ? (
          <div className="animate-pulse h-10 bg-[#1A1A1A] w-80 rounded-sm" />
        ) : gridError ? (
          <ErrorState message={gridError} onRetry={gridRetry} />
        ) : summary ? (
          <div>
            <div className="text-2xl font-light tracking-tight">
              <span className="text-[#EF4444]">{summary.red_count} RED</span>
              <span className="text-[#525252] mx-3">·</span>
              <span className="text-[#F59E0B]">{summary.amber_count} AMBER</span>
              <span className="text-[#525252] mx-3">·</span>
              <span className="text-[#22C55E]">{summary.green_count} GREEN</span>
            </div>
            <p className="text-xs text-[#525252] mt-1 font-mono">Forecast-driven · {summary.total_feeders} feeders · LightGBM</p>
          </div>
        ) : null}
      </section>

      {/* Feeder Grid */}
      <section>
        <h2 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-4">Feeders</h2>
        {gridLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="animate-pulse bg-[#0A0A0A] border border-[#1A1A1A] h-24 rounded-sm" />)}
          </div>
        ) : sortedFeeders.length === 0 ? (
          <EmptyState message="No feeder data" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedFeeders.slice(0, 15).map((f, i) => (
              <div
                key={f.feeder_id_hash || i}
                onClick={() => setSelectedFeeder(f.feeder_id_hash)}
                className={`bg-[#0A0A0A] border p-4 cursor-pointer hover:-translate-y-[1px] transition-all duration-200 opacity-0 animate-fadeIn ${
                  selectedFeeder === f.feeder_id_hash ? 'border-white' : 'border-[#1A1A1A]'
                } ${f.grid_risk_band === 'RED' ? 'border-l-2 border-l-[#EF4444]' : ''}`}
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'forwards' }}
                data-testid={`feeder-card-${i}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-[#FAFAFA]">{truncateHash(f.feeder_id_hash, 10)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getBandColor(f.grid_risk_band) }} />
                    <span className="text-xs font-mono" style={{ color: getBandColor(f.grid_risk_band) }}>{f.grid_risk_band}</span>
                  </span>
                </div>
                <p className="text-xs text-[#737373] mb-2">{f.locality || '\u2014'}</p>
                <div className="h-1.5 bg-[#1A1A1A] rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all duration-500"
                    style={{
                      width: `${Math.min(f.peak_load_pct || 0, 100)}%`,
                      backgroundColor: getBandColor(f.grid_risk_band),
                    }}
                  />
                </div>
                <span className="text-xs text-[#525252] mt-1 block">Peak: {f.peak_time_ist || '\u2014'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Forecast Chart */}
      {selectedFeeder && (
        <section className="border border-[#1A1A1A] bg-[#0A0A0A] p-6" data-testid="forecast-chart">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-mono text-[#FAFAFA]">Forecast: {truncateHash(selectedFeeder, 12)}</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setTestOnly(true)}
                className={`text-xs px-3 py-1 border transition-colors ${testOnly ? 'border-white text-white' : 'border-[#1A1A1A] text-[#737373] hover:text-white'}`}
              >
                Test Period
              </button>
              <button
                onClick={() => setTestOnly(false)}
                className={`text-xs px-3 py-1 border transition-colors ${!testOnly ? 'border-white text-white' : 'border-[#1A1A1A] text-[#737373] hover:text-white'}`}
              >
                Full History
              </button>
            </div>
          </div>
          {fcLoading ? (
            <ChartSkeleton height="h-64" />
          ) : fcError ? (
            <ErrorState message={fcError} onRetry={fcRetry} />
          ) : !forecast || forecast.length === 0 ? (
            <EmptyState message="No forecast data for this feeder" />
          ) : (
            <div className="h-56 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecast} margin={{ top: 5, right: 16, bottom: 20, left: 5 }}>
                  <XAxis
                    dataKey="timestamp_hour_ist"
                    stroke="#1A1A1A"
                    tick={{ fontSize: 10, fill: '#525252' }}
                    tickFormatter={(v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#1A1A1A" tick={{ fontSize: 10, fill: '#525252' }} label={{ value: 'kWh', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#525252' } }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #1A1A1A', fontSize: 11 }}
                    labelStyle={{ color: '#FAFAFA' }}
                    labelFormatter={(v) => v ? new Date(v).toLocaleString('en-IN') : ''}
                  />
                  <Area dataKey="forecast_p90" stroke="none" fill="#3B82F6" fillOpacity={0.1} />
                  <Area dataKey="forecast_p10" stroke="none" fill="#000000" fillOpacity={1} />
                  <Line type="monotone" dataKey="actual_kwh" stroke="#FAFAFA" strokeWidth={1.5} dot={false} animationDuration={1200} />
                  <Line type="monotone" dataKey="forecast_kwh" stroke="#3B82F6" strokeWidth={1.5} dot={false} animationDuration={1200} />
                  <Line type="monotone" dataKey="baseline_prev_day" stroke="#525252" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="baseline_prev_week" stroke="#525252" strokeWidth={1} strokeDasharray="2 4" dot={false} />
                  {forecast[0]?.feeder_capacity_kw && (
                    <ReferenceLine y={forecast[0].feeder_capacity_kw} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Capacity', fill: '#EF4444', fontSize: 10 }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {/* Baselines + Feature Importance */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Baselines */}
        <div>
          <h2 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-4">{t('Baseline Comparison')}</h2>
          {blLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : blError ? (
            <ErrorState message={blError} onRetry={blRetry} />
          ) : !baselines || baselines.length === 0 ? (
            <EmptyState message="No baseline data" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#525252] text-xs uppercase tracking-wide border-b border-[#1A1A1A]">
                    <th className="text-left py-2 font-normal">Model</th>
                    <th className="text-right py-2 font-normal">MAE (kWh)</th>
                    <th className="text-right py-2 font-normal">RMSE (kWh)</th>
                    <th className="text-right py-2 font-normal">WMAPE (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {baselines.map((b, i) => (
                    <tr key={i} className={`border-b border-[#1A1A1A] ${i === 0 ? 'text-white' : 'text-[#737373]'}`}>
                      <td className="py-2.5 text-xs">{b.model_or_baseline}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{displayValue(b.MAE_kWh)}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{displayValue(b.RMSE_kWh)}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{displayValue(b.WMAPE_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {baselines[0]?.improvement_vs_prev_day_pct && (
                <p className="text-xs text-[#22C55E] mt-2 font-mono">+{baselines[0].improvement_vs_prev_day_pct}% vs Previous Day</p>
              )}
            </div>
          )}
        </div>

        {/* Feature Importance */}
        <div>
          <h2 className="text-sm text-[#737373] uppercase tracking-wide font-mono mb-4">{t('Feature Importance')}</h2>
          {ftLoading ? (
            <ChartSkeleton height="h-64" />
          ) : ftError ? (
            <ErrorState message={ftError} onRetry={ftRetry} />
          ) : topFeatures.length === 0 ? (
            <EmptyState message="No feature data" />
          ) : (
            <div className="h-56 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topFeatures} layout="vertical" margin={{ left: 90, right: 16, top: 5, bottom: 5 }}>
                  <XAxis type="number" stroke="#525252" tick={{ fontSize: 10, fill: '#737373' }} />
                  <YAxis type="category" dataKey="feature_name" stroke="#1A1A1A" tick={{ fontSize: 10, fill: '#737373' }} width={85} />
                  <Tooltip contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #1A1A1A', fontSize: 11 }} />
                  <Bar dataKey="importance_gain" radius={[0, 2, 2, 0]} animationDuration={800}>
                    {topFeatures.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#FAFAFA' : '#737373'} fillOpacity={1 - i * 0.07} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
