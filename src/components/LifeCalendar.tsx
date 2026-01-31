'use client';

import React, { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';

interface LifeCalendarProps {
  startDate: string;
  endDate: string;
  theme: 'light' | 'dark';
  width: number;
  height: number;
  hasWidgets?: boolean;
  circleSize?: number;
  circleGap?: number;
  padding?: number;
  safeAreaTop?: number;    // Percentage for top safe area
  safeAreaBottom?: number;  // Percentage for bottom safe area
  safeAreaLeft?: number;    // Percentage for left safe area
  safeAreaRight?: number;   // Percentage for right safe area
  onGenerated?: (dataUrl: string) => void;
}

export default function LifeCalendar({
  startDate,
  endDate,
  theme,
  width,
  height,
  hasWidgets = false,
  circleSize = 56,
  circleGap = 24,
  padding = 60,
  safeAreaTop = 0,
  safeAreaBottom = 0,
  safeAreaLeft = 0,
  safeAreaRight = 0,
  onGenerated,
}: LifeCalendarProps) {
  const calendarRef = useRef<HTMLDivElement>(null);
  const [daysPassed, setDaysPassed] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [currentDayIndex, setCurrentDayIndex] = useState(-1);
  const [scaledCircleSize, setScaledCircleSize] = useState(circleSize);
  const [scaledCircleGap, setScaledCircleGap] = useState(circleGap);

  // Calculate widget space (15% of height for iOS widgets)
  const widgetSpace = hasWidgets ? Math.round(height * 0.15) : 0;

  // Calculate safe area offsets in pixels from percentages
  const safeAreaTopPx = Math.round(height * (safeAreaTop / 100));
  const safeAreaBottomPx = Math.round(height * (safeAreaBottom / 100));
  const safeAreaLeftPx = Math.round(width * (safeAreaLeft / 100));
  const safeAreaRightPx = Math.round(width * (safeAreaRight / 100));

  // Calculate effective padding (use larger of device padding or safe areas)
  const effectiveSidePadding = Math.max(padding, safeAreaLeftPx, safeAreaRightPx);

  // Calculate available content area (excluding safe areas)
  const contentWidth = width - safeAreaLeftPx - safeAreaRightPx;

  // Calculate proportional spacing based on screen width
  const headerSpacing = Math.round(contentWidth * 0.08);
  const gridTopOffset = Math.round(contentWidth * 0.08);
  const calendarHeight = height - widgetSpace - safeAreaTopPx - safeAreaBottomPx - gridTopOffset;

  // Calculate circles that fit in a row (horizontally)
  const gapPercent = 0.03; // 3% of screen width for gap (increased 2x)
  const gapPx = Math.round(contentWidth * gapPercent);

  // Try to fit 15 circles per row (as stated in preset)
  const targetCirclesPerRow = 15;
  const circleFromWidth = (contentWidth - (targetCirclesPerRow - 1) * gapPx) / targetCirclesPerRow;

  // Calculate circles per row based on actual width
  const circlesPerRow = Math.floor(contentWidth / (circleFromWidth + gapPx));
  const actualCircleFromWidth = (contentWidth - (circlesPerRow - 1) * gapPx) / circlesPerRow;

  // Calculate circles that fit vertically (assume ~15 rows as per preset)
  const targetRows = Math.ceil(totalDays / targetCirclesPerRow);
  const circleFromHeight = calendarHeight / targetRows;

  // Use smaller circle size to fit
  const finalCircleSize = Math.min(actualCircleFromWidth, circleFromHeight);
  const finalCircleGap = gapPx;

  // Calculate scale factor (no longer needed - using finalCircleSize directly)
  useEffect(() => {
    setScaledCircleSize(Math.max(2, Math.floor(finalCircleSize)));
    setScaledCircleGap(Math.max(1, Math.floor(finalCircleGap)));
  }, [totalDays, finalCircleSize, finalCircleGap]);

  // Calculate circles per row for grid layout
  const effectiveCirclesPerRow = Math.floor(contentWidth / (finalCircleSize + finalCircleGap));

  useEffect(() => {
    // Calculate days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    // Reset time to midnight for accurate calculations
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDaysCalc = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
    const daysPassedCalc = Math.max(0, Math.floor((now.getTime() - start.getTime()) / msPerDay));

    // Only set current day if we're within the date range
    let currentDayIndexCalc = -1;
    if (daysPassedCalc > 0 && daysPassedCalc < totalDaysCalc) {
      currentDayIndexCalc = daysPassedCalc - 1;
    }

    setTotalDays(totalDaysCalc);
    setDaysPassed(daysPassedCalc);
    setCurrentDayIndex(currentDayIndexCalc);

    // Generate image after render
    const timeoutId = setTimeout(() => {
      if (calendarRef.current && onGenerated) {
        toPng(calendarRef.current, {
          width,
          height,
          pixelRatio: 1,
          backgroundColor: theme === 'dark' ? '#1a1a1a' : '#FAFAFA',
        })
          .then((dataUrl) => {
            onGenerated(dataUrl);
          })
          .catch((err) => console.error('Failed to generate image:', err));
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [startDate, endDate, theme, width, height, onGenerated]);

  // Calculate percentage
  const percentage = ((daysPassed / totalDays) * 100).toFixed(1);

  // Generate grid (each circle = one day)
  const generateGrid = () => {
    const grid: React.ReactElement[] = [];

    for (let i = 0; i < totalDays; i++) {
      const isPast = i < currentDayIndex;
      const isCurrent = i === currentDayIndex;
      const isFuture = i > currentDayIndex;

      let bgColor = 'bg-lc-empty';
      if (theme === 'dark') {
        bgColor = isPast ? 'bg-lc-filled-dark' : isCurrent ? 'bg-lc-current' : 'bg-lc-empty-dark';
      } else {
        bgColor = isPast ? 'bg-lc-filled' : isCurrent ? 'bg-lc-current' : 'bg-lc-empty';
      }

      grid.push(
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${bgColor}`}
          style={{
            width: `${scaledCircleSize}px`,
            height: `${scaledCircleSize}px`,
          }}
          title={`Day ${i + 1}`}
        />
      );
    }

    return grid;
  };

  return (
    <div
      ref={calendarRef}
      className={`relative flex flex-col items-center justify-center overflow-hidden ${
        theme === 'dark' ? 'bg-lc-bg-dark' : 'bg-lc-bg'
      }`}
      style={{
        width,
        height: height + widgetSpace,
        paddingTop: widgetSpace + safeAreaTopPx,
        paddingBottom: safeAreaBottomPx,
        paddingLeft: safeAreaLeftPx,
        paddingRight: safeAreaRightPx,
      }}
    >
      {/* Widget area with time */}
      {hasWidgets && widgetSpace > 0 && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between px-6"
          style={{
            height: widgetSpace + 'px',
            paddingTop: safeAreaTopPx + 'px',
            paddingLeft: safeAreaLeftPx + 'px',
            paddingRight: safeAreaRightPx + 'px',
          }}
        >
          <div style={{ fontSize: Math.round(contentWidth * 0.04) + 'px', fontWeight: '600' }} className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </div>
          <div style={{ fontSize: Math.round(contentWidth * 0.025) + 'px' }} className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center" style={{ padding: `${effectiveSidePadding}px` }}>
        {/* Percentage and status */}
        <div className="text-center" style={{ marginBottom: `${headerSpacing * 0.8}px` }}>
          <div
            className={`font-bold ${theme === 'dark' ? 'text-lc-text-orange' : 'text-lc-current'}`}
            style={{ fontSize: Math.round(contentWidth * 0.04) + 'px', marginBottom: Math.round(contentWidth * 0.015) + 'px' }}
          >
            {percentage}%
          </div>
          <div className={theme === 'dark' ? 'text-lc-percent-gray' : 'text-gray-500'} style={{ fontSize: Math.round(contentWidth * 0.012) + 'px' }}>
            {daysPassed} / {totalDays} days
          </div>
        </div>

        {/* Calendar Grid - each circle is one day */}
        <div
          className="flex flex-wrap"
          style={{
            gap: `${scaledCircleGap}px`,
            maxWidth: '100%',
          }}
        >
          {generateGrid()}
        </div>
      </div>
    </div>
  );
}
