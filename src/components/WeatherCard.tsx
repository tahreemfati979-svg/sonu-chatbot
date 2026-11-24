import React, { useState } from 'react';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  ExternalLink,
  Sun,
  Umbrella,
  Wind,
} from 'lucide-react';
import type { WeatherCategory, WeatherReport } from '../types/chat';

interface WeatherCardProps {
  reports: WeatherReport[];
}

function WeatherIcon({
  category,
  className = 'h-5 w-5',
}: {
  category: WeatherCategory;
  className?: string;
}) {
  switch (category) {
    case 'clear':
      return <Sun className={`${className} text-amber-500`} />;
    case 'partly-cloudy':
      return <CloudSun className={`${className} text-amber-400`} />;
    case 'fog':
      return <CloudFog className={`${className} text-slate-400`} />;
    case 'rain':
      return <CloudRain className={`${className} text-blue-500`} />;
    case 'snow':
      return <CloudSnow className={`${className} text-sky-400`} />;
    case 'storm':
      return <CloudLightning className={`${className} text-indigo-500`} />;
    default:
      return <Cloud className={`${className} text-slate-400`} />;
  }
}

function formatShortDay(dateStr: string, idx: number): string {
  if (idx === 0) return 'Today';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(dt);
  } catch {
    return dateStr;
  }
}

function toDisplayTemp(tempC: number, unit: 'C' | 'F'): number {
  return unit === 'C' ? tempC : Math.round((tempC * 9) / 5 + 32);
}

export const WeatherCard: React.FC<WeatherCardProps> = React.memo(({ reports }) => {
  const [unit, setUnit] = useState<'C' | 'F'>('C');

  if (!reports || reports.length === 0) return null;

  return (
    <div className="mb-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Live Weather Forecast</span>
        <div
          className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-[#0B0F17]"
          role="group"
          aria-label="Temperature unit"
        >
          <button
            type="button"
            onClick={() => setUnit('C')}
            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
              unit === 'C'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            °C
          </button>
          <button
            type="button"
            onClick={() => setUnit('F')}
            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
              unit === 'F'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            °F
          </button>
        </div>
      </div>

      <div
        className={`grid gap-3 ${
          reports.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {reports.map((report) => (
          <div
            key={report.location}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#0E1420]"
          >
            {/* Header + Current Condition */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-sm font-semibold text-slate-900 dark:text-white">
                  {report.location}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {report.current.condition}
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">
                    Feels like {toDisplayTemp(report.current.feelsLikeC, unit)}°{unit}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <WeatherIcon category={report.current.category} className="h-7 w-7" />
                <span className="font-display text-2xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white">
                  {toDisplayTemp(report.current.tempC, unit)}°{unit}
                </span>
              </div>
            </div>

            {/* Key Metrics Row */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200/80 pt-3 text-xs text-slate-600 tabular-nums dark:border-slate-800 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Umbrella className="h-3.5 w-3.5 text-blue-500" />
                Rain {report.current.rainChanceToday}%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Droplets className="h-3.5 w-3.5 text-sky-500" />
                Humidity {report.current.humidity}%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wind className="h-3.5 w-3.5 text-slate-400" />
                Wind {report.current.windKmh} km/h
              </span>
            </div>

            {/* 7-Day Forecast Strip */}
            {report.daily.length > 0 && (
              <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                <div className="grid grid-cols-7 gap-1 text-center">
                  {report.daily.slice(0, 7).map((day, idx) => (
                    <div
                      key={day.date}
                      className="flex flex-col items-center gap-1 py-1"
                      title={`${day.date}: ${day.condition}, Rain ${day.rainChance}%`}
                    >
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {formatShortDay(day.date, idx)}
                      </span>
                      <WeatherIcon category={day.category} className="h-4 w-4" />
                      <span className="text-[11px] font-medium text-slate-900 tabular-nums dark:text-slate-100">
                        {toDisplayTemp(day.tempMaxC, unit)}°
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums dark:text-slate-500">
                        {toDisplayTemp(day.tempMinC, unit)}°
                      </span>
                      <span className="text-[10px] text-blue-600 tabular-nums dark:text-blue-400">
                        {day.rainChance}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attribution */}
            <div className="mt-2 flex items-center justify-end text-[11px] text-slate-400 dark:text-slate-500">
              <a
                href={report.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <span>Source: {report.sourceName}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

WeatherCard.displayName = 'WeatherCard';
