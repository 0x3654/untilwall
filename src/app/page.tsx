'use client';

import { useState, useEffect } from 'react';
import DateInput from '@/components/DateInput';
import { DEVICE_PRESETS } from '@/types';

// Helper functions to convert between DD.MM.YYYY and YYYY-MM-DD
const dmyToIso = (day: string, month: string, year: string): string => {
  const d = day.padStart(2, '0');
  const m = month.padStart(2, '0');
  return `${year}-${m}-${d}`;
};

const isoToDmy = (isoDate: string): { day: string; month: string; year: string } => {
  const [year, month, day] = isoDate.split('-');
  return { day, month, year };
};

// Get current year bounds
const getCurrentYearBounds = () => {
  const now = new Date();
  const year = now.getFullYear();
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
};

// Cookie helpers
const getSettingsFromCookie = () => {
  if (typeof window === 'undefined') return null;
  const match = document.cookie.match(/(^|;) ?untilwall_settings=([^;]*)(;|$)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[2]));
  } catch {
    return null;
  }
};

const saveSettingsToCookie = (settings: any) => {
  if (typeof window === 'undefined') return;
  const value = encodeURIComponent(JSON.stringify(settings));
  const oneYear = 365 * 24 * 60 * 60;
  document.cookie = `untilwall_settings=${value}; path=/; max-age=${oneYear}; SameSite=Lax`;
};

export default function Home() {
  const currentYearBounds = getCurrentYearBounds();
  const startDmy = isoToDmy(currentYearBounds.startDate);
  const endDmy = isoToDmy(currentYearBounds.endDate);

  // Load settings from cookie on mount
  const savedSettings = getSettingsFromCookie();

  const [startDay, setStartDay] = useState(savedSettings?.startDay || startDmy.day);
  const [startMonth, setStartMonth] = useState(savedSettings?.startMonth || startDmy.month);
  const [startYear, setStartYear] = useState(savedSettings?.startYear || startDmy.year);
  const [endDay, setEndDay] = useState(savedSettings?.endDay || endDmy.day);
  const [endMonth, setEndMonth] = useState(savedSettings?.endMonth || endDmy.month);
  const [endYear, setEndYear] = useState(savedSettings?.endYear || endDmy.year);

  const [hasWidgets, setHasWidgets] = useState(savedSettings?.hasWidgets ?? false);
  const [ringStyle, setRingStyle] = useState(savedSettings?.ringStyle ?? 1); // 1 = filled (default), 0 = ring
  const [showText, setShowText] = useState(savedSettings?.showText ?? true); // Show bottom text (default)
  const [elapsedMode, setElapsedMode] = useState(savedSettings?.elapsedMode ?? false); // false = until, true = elapsed
  const [goalText, setGoalText] = useState(savedSettings?.goalText || ''); // Goal text to display at top
  const [selectedDevice, setSelectedDevice] = useState(savedSettings?.deviceIndex !== undefined ? DEVICE_PRESETS[savedSettings.deviceIndex] : DEVICE_PRESETS[0]);
  const [isCustomDevice, setIsCustomDevice] = useState(false);
  const [customWidth, setCustomWidth] = useState(1290);
  const [customHeight, setCustomHeight] = useState(2796);
  const [buttonText, setButtonText] = useState('1. Get link');
  const [imageUrl, setImageUrl] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [hideOverlay, setHideOverlay] = useState(false); // Hide overlay in preview only (not saved)
  const [previewLoading, setPreviewLoading] = useState(false); // Preview loading state
  const [stats, setStats] = useState<any>(null); // Stats data
  const [dateError, setDateError] = useState<string | null>(null); // Date validation error

  // Color customization
  const [bgColor, setBgColor] = useState(savedSettings?.bgColor ?? '#1a1a1a');
  const [pastColor, setPastColor] = useState(savedSettings?.pastColor ?? '#ffffff');
  const [currentColor, setCurrentColor] = useState(savedSettings?.currentColor ?? '#ff6b35');
  const [futureColor, setFutureColor] = useState(savedSettings?.futureColor ?? '#2a2a2a');
  const [goalColor, setGoalColor] = useState(savedSettings?.goalColor ?? savedSettings?.currentColor ?? '#ff6b35'); // Default to currentColor

  // Scale per style
  const [dotScale, setDotScale] = useState(savedSettings?.dotScale ?? 1.0);

  // Collapsible states
  const [colorsExpanded, setColorsExpanded] = useState(false);
  const [offsetsExpanded, setOffsetsExpanded] = useState(false);

  // Default scale per style
  const getDefaultScaleForStyle = (style: number): number => {
    if (style === 6) return 1.3; // Dachshund
    if (style === 9) return 2.0; // Emo
    if (style === 10) return 0.6; // Gold
    if (style === 11) return 1.0; // New style
    return 1.0; // Default for others
  };

  // Track visitor on page load (client-side)
  useEffect(() => {
    const trackVisit = async () => {
      // Check if visitor_id cookie exists
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`.split(`; ${name}=`).pop()?.split(';').shift();
        return value;
      };

      const setCookie = (name: string, value: string, days: number) => {
        const expires = new Date();
        expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
        document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
      };

      let visitorId = getCookie('visitor_id');

      if (!visitorId) {
        // Generate visitor ID on client
        visitorId = crypto.randomUUID();
        setCookie('visitor_id', visitorId, 365);

        // Send to server for tracking
        try {
          await fetch('/api/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visitorId })
          });
          console.log('Tracked new visitor:', visitorId);
        } catch (err) {
          console.error('Failed to track visit:', err);
        }
      }
    };

    trackVisit();

    // Load stats
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Failed to fetch stats:', err));
  }, []);

  // Safe area offsets (in percentages) - use device defaults if available
  const defaultSafeArea = selectedDevice.defaultSafeArea || { top: 0, bottom: 0, left: 0, right: 0 };
  const [offsetTop, setOffsetTop] = useState(savedSettings?.offsetTop ?? defaultSafeArea.top ?? 0);
  const [offsetBottom, setOffsetBottom] = useState(savedSettings?.offsetBottom ?? defaultSafeArea.bottom ?? 0);
  const [offsetLeft, setOffsetLeft] = useState(savedSettings?.offsetLeft ?? defaultSafeArea.left ?? 0);
  const [offsetRight, setOffsetRight] = useState(savedSettings?.offsetRight ?? defaultSafeArea.right ?? 0);
  const [goalTextTopOffset, setGoalTextTopOffset] = useState(savedSettings?.goalTextTopOffset ?? 0); // Goal text top offset (%)

  // Save settings to cookie whenever any parameter changes
  useEffect(() => {
    const deviceIndex = DEVICE_PRESETS.findIndex(d => d.name === selectedDevice.name);
    const settings = {
      deviceIndex,
      startDay, startMonth, startYear,
      endDay, endMonth, endYear,
      hasWidgets,
      ringStyle,
      dotScale,
      showText,
      elapsedMode,
      goalText,
      offsetTop, offsetBottom, offsetLeft, offsetRight,
      goalTextTopOffset,
      bgColor, pastColor, currentColor, futureColor, goalColor
    };
    saveSettingsToCookie(settings);
  }, [selectedDevice, startDay, startMonth, startYear, endDay, endMonth, endYear, hasWidgets, ringStyle, dotScale, showText, elapsedMode, goalText, offsetTop, offsetBottom, offsetLeft, offsetRight, goalTextTopOffset, bgColor, pastColor, currentColor, futureColor, goalColor]);

  // Update offsets when device or widgets change
  useEffect(() => {
    if (hasWidgets) {
      // Xs widgets: top=20, bottom=20, left=15, right=15
      if (selectedDevice.name.includes('iPhone Xs')) {
        setOffsetTop(20);
        setOffsetBottom(20);
        setOffsetLeft(15);
        setOffsetRight(15);
      } else {
        // Other devices widgets: top=15, bottom=25, left=10, right=10
        setOffsetTop(15);
        setOffsetBottom(25);
        setOffsetLeft(10);
        setOffsetRight(10);
      }
    } else {
      const safeArea = selectedDevice.defaultSafeArea || { top: 0, bottom: 0, left: 0, right: 0 };
      setOffsetTop(safeArea.top ?? 0);
      setOffsetBottom(safeArea.bottom ?? 0);
      setOffsetLeft(safeArea.left ?? 0);
      setOffsetRight(safeArea.right ?? 0);
    }
  }, [selectedDevice, hasWidgets]);

  // Helper: detect if text contains emoji (to trigger PNG preview for consistency)
  const hasEmoji = (text: string): boolean => {
    // Detect emoji and other non-ASCII characters that render differently in browser vs server
    return /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2B50}]|[\u{203C}]|[\u{2049}]|[\u{00A9}]|[\u{00AE}]|[\u{2122}]|[\u{23F3}]|[\u{24C2}]|[\u{23E9}-\u{23FA}]|[\u{1F170}-\u{1F251}]/u.test(text);
  };

  // Build ISO dates from parts

  // Get current device dimensions (custom or preset)
  const currentDevice = isCustomDevice
    ? { name: 'Custom', width: customWidth, height: customHeight, type: 'iphone' as const, defaultSafeArea: { top: 0, bottom: 0, left: 0, right: 0 } }
    : selectedDevice;

  // Build ISO dates from parts
  const startDate = dmyToIso(startDay, startMonth, startYear);
  const endDate = dmyToIso(endDay, endMonth, endYear);

  // Validate dates: start date should not be after end date
  useEffect(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (start.getTime() > end.getTime()) {
      setDateError('Start date must be before end date. Please swap the dates or use "Elapsed" mode.');
    } else {
      setDateError(null);
    }
  }, [startDate, endDate]);

  // Update preview image when parameters change (with debounce)
  useEffect(() => {
    setPreviewLoading(true);

    const timeoutId = setTimeout(() => {
      // Use PNG for preview when emoji detected in goal text (ensures consistency with server rendering)
      const format = hasEmoji(goalText) ? 'png' : 'svg';

      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        has_widgets: hasWidgets.toString(),
        ring_style: ringStyle.toString(),
        elapsed_mode: elapsedMode.toString(),
        show_text: showText ? '1' : '0',
        goal_text: goalText,
        goal_color: goalColor,
        goal_text_top_offset: goalTextTopOffset.toString(),
        width: currentDevice.width.toString(),
        height: currentDevice.height.toString(),
        offset_top: offsetTop.toString(),
        offset_bottom: offsetBottom.toString(),
        offset_left: offsetLeft.toString(),
        offset_right: offsetRight.toString(),
        dot_scale: dotScale.toString(),
        bg_color: bgColor,
        past_color: pastColor,
        current_color: currentColor,
        future_color: futureColor,
        format, // Use SVG for faster preview, PNG when emoji detected
        t: Date.now().toString(), // Prevent caching
      });
      const url = `/goal?${params.toString()}`;
      setImageUrl(url);

      // Set loading to false when image loads
      const img = new Image();
      img.onload = () => setPreviewLoading(false);
      img.onerror = () => setPreviewLoading(false); // Also hide on error
      img.src = url;
    }, 300); // 300ms debounce (faster response)

    return () => clearTimeout(timeoutId);
  }, [startDate, endDate, hasWidgets, ringStyle, showText, elapsedMode, goalText, selectedDevice, isCustomDevice, customWidth, customHeight, offsetTop, offsetBottom, offsetLeft, offsetRight, goalTextTopOffset, dotScale, bgColor, pastColor, currentColor, futureColor, goalColor]);

  const shareUrl = async () => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      has_widgets: hasWidgets.toString(),
      ring_style: ringStyle.toString(),
      elapsed_mode: elapsedMode.toString(),
      show_text: showText ? '1' : '0',
      goal_text: goalText,
      goal_color: goalColor,
      goal_text_top_offset: goalTextTopOffset.toString(),
      width: currentDevice.width.toString(),
      height: currentDevice.height.toString(),
      offset_top: offsetTop.toString(),
      offset_bottom: offsetBottom.toString(),
      offset_left: offsetLeft.toString(),
      offset_right: offsetRight.toString(),
      dot_scale: dotScale.toString(),
      bg_color: bgColor,
      past_color: pastColor,
      current_color: currentColor,
      future_color: futureColor,
    });
    const url = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/goal?${params.toString()}`;

    try {
      // Try modern clipboard API first
      await navigator.clipboard.writeText(url);
      setButtonText('Copied to clipboard!');
      setTimeout(() => setButtonText('1. Get link'), 2000);
    } catch (err) {
      // Fallback for older browsers and iOS Safari
      try {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          setButtonText('Copied to clipboard!');
          setTimeout(() => setButtonText('1. Get link'), 2000);
        } else {
          setButtonText('Failed to copy');
          setTimeout(() => setButtonText('1. Get link'), 2000);
        }
      } catch (fallbackErr) {
        console.error('Failed to copy to clipboard:', fallbackErr);
        setButtonText('Failed to copy');
        setTimeout(() => setButtonText('1. Get link'), 2000);
      }
    }
  };

  // Calculate preview scale to fit in container
  const [containerSize, setContainerSize] = useState({ width: 650, height: 750 });
  useEffect(() => {
    const updateSize = () => {
      // Increase container width for better preview size, especially for landscape devices
      const maxWidth = Math.min(650, (window.innerWidth - 32) / 2 - 32);
      setContainerSize({ width: maxWidth, height: 750 });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Calculate scale to fit device in container
  const deviceAspectRatio = currentDevice.width / currentDevice.height;
  const containerAspectRatio = containerSize.width / containerSize.height;

  let scaleWidth;
  if (deviceAspectRatio > containerAspectRatio) {
    // Device is wider, fit to width
    scaleWidth = containerSize.width;
  } else {
    // Device is taller, fit to height
    scaleWidth = containerSize.height * deviceAspectRatio;
  }

  const scale = scaleWidth / currentDevice.width;

  // Get overlay image based on device and widget settings
  const getOverlayImage = (): string | null => {
    if (isCustomDevice) return null; // No overlay for custom devices
    if (selectedDevice.name.includes('iPhone 15 Pro Max')) {
      return hasWidgets ? '/overlay/15promax_widget.png' : '/overlay/15promax.png';
    }
    if (selectedDevice.name.includes('iPhone Xs')) {
      return hasWidgets ? '/overlay/Xs_widget.png' : '/overlay/Xs.png';
    }
    if (selectedDevice.name.includes('iPad Pro 13" Portrait')) {
      return hasWidgets ? '/overlay/ipad 13 portrait_widget.png' : '/overlay/ipad 13 portrait.png';
    }
    if (selectedDevice.name.includes('iPad Pro 13" Landscape')) {
      return hasWidgets ? '/overlay/ipad 13 landscape_widget.png' : '/overlay/ipad 13 landscape.png';
    }
    return null;
  };

  return (
    <main className="min-h-screen bg-lc-bg-dark flex flex-col">
      <div className="container mx-auto px-4 py-6 md:py-8 flex-grow">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-8" style={{ color: '#ff6b35' }}>
          Until Wall
        </h1>

        <div className="grid lg:grid-cols-2 gap-4 md:gap-8 max-w-7xl mx-auto items-start">
          {/* Controls */}
          <div className="rounded-2xl shadow-xl p-4 md:p-6 space-y-4 md:space-y-6" style={{ backgroundColor: '#2a2a2a' }}>
            <div>
              <label className="block text-sm font-medium mb-2 text-white">
                Goal
              </label>
              <textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                placeholder="Set your goal"
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-white focus:outline-none resize-none"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
              />
            </div>

            <DateInput
              label="Start Date (DD.MM.YYYY)"
              day={startDay}
              month={startMonth}
              year={startYear}
              onDayChange={setStartDay}
              onMonthChange={setStartMonth}
              onYearChange={setStartYear}
            />

            <DateInput
              label="End Date (DD.MM.YYYY)"
              day={endDay}
              month={endMonth}
              year={endYear}
              onDayChange={setEndDay}
              onMonthChange={setEndMonth}
              onYearChange={setEndYear}
            />

            {dateError && (
              <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(255, 107, 53, 0.1)', border: '1px solid #ff6b35' }}>
                <p style={{ color: '#ff6b35' }}>{dateError}</p>
              </div>
            )}

            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer text-white">
                <input
                  type="checkbox"
                  checked={hasWidgets}
                  onChange={(e) => setHasWidgets(e.target.checked)}
                  className="w-5 h-5 rounded"
                  style={{ accentColor: '#ff6b35' }}
                />
                <span className="text-sm font-medium">space for widgets</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-white">
                <input
                  type="checkbox"
                  checked={showText}
                  onChange={(e) => setShowText(e.target.checked)}
                  className="w-5 h-5 rounded"
                  style={{ accentColor: '#ff6b35' }}
                />
                <span className="text-sm font-medium">bottom text</span>
              </label>
              <div className={`flex items-center gap-4 ${showText ? '' : 'opacity-50'}`} style={{ transition: 'opacity 0.2s' }}>
                <label className={`flex items-center gap-2 ${showText ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                  <input
                    type="radio"
                    name="elapsedMode"
                    checked={!elapsedMode}
                    onChange={() => setElapsedMode(false)}
                    className="w-4 h-4"
                    disabled={!showText}
                    style={{ accentColor: '#ff6b35' }}
                  />
                  <span className="text-sm text-white">Until</span>
                </label>
                <label className={`flex items-center gap-2 ${showText ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                  <input
                    type="radio"
                    name="elapsedMode"
                    checked={elapsedMode}
                    onChange={() => setElapsedMode(true)}
                    className="w-4 h-4"
                    disabled={!showText}
                    style={{ accentColor: '#ff6b35' }}
                  />
                  <span className="text-sm text-white">Elapsed</span>
                </label>
              </div>
            </div>

            <div>
              <label className="flex items-baseline gap-2 mb-2">
                <span className="text-sm font-medium text-white">Dot style</span>
                <span className="text-xs text-lc-percent-gray">
                  {ringStyle === 1 ? ' Solid circles' :
                   ringStyle === 0 ? ' Ring circles' :
                   ringStyle === 2 ? ' For your heartshearts❤️‍🩹' :
                   ringStyle === 3 ? ' Oops' :
                   ringStyle === 4 ? ' Save save' :
                   ringStyle === 5 ? ' Need more gold' :
                   ringStyle === 6 ? ' Sooooo looooooooooooooooooong' :
                   ringStyle === 7 ? ' Just God' :
                   ringStyle === 8 ? ' Leave your mark' :
                   ringStyle === 9 ? ' Please don\'t die' :
                   ringStyle === 10 ? ' Stability' :
                   ringStyle === 11 ? ' Only for Koza-dereza! Exclusively' : '⚪️ Solid circles'}
                </span>
              </label>
              <select
                value={ringStyle.toString()}
                onChange={(e) => setRingStyle(parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium text-white focus:outline-none"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
              >
                <option value="1">⚪️ Solid</option>
                <option value="0">⭕ Ring</option>
                <option value="2">❤️ Hearts</option>
                <option value="3">💩 Poop</option>
                <option value="4">🐷 Piggy</option>
                <option value="5">💰 Money</option>
                <option value="6">🐕 Dachshund</option>
                <option value="7">🐱 Cat</option>
                <option value="8">🐾 Paw</option>
                <option value="9">👻 Ghost</option>
                <option value="10">🥇 Gold</option>
                <option value="11">🚙 Pink G-Wagen</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white">
                Scale ({dotScale.toFixed(1)}x) <span className="text-xs text-lc-percent-gray font-normal">(default: {getDefaultScaleForStyle(ringStyle)}x for this style)</span>
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={dotScale}
                onChange={(e) => setDotScale(parseFloat(e.target.value))}
                className="w-full"
                style={{ accentColor: '#ff6b35' }}
              />
              <p className="text-xs mt-1 text-lc-percent-gray">
                Adjust icon size (0.5x - 2.0x)
              </p>
            </div>

            <details open={colorsExpanded} onToggle={(e) => setColorsExpanded(e.currentTarget.open)}>
              <summary className="cursor-pointer text-sm font-medium mb-2 flex items-center justify-between" style={{ color: '#ff6b35' }}>
                Colors & Offsets
                <span style={{ color: '#ff6b35' }}>{colorsExpanded ? '▼' : '▶'}</span>
              </summary>
              <div className="space-y-4 mt-2">
                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Colors</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-white w-20">Background</label>
                      <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
                      <input type="text" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="flex-1 px-2 py-1 rounded text-white text-sm" style={{ backgroundColor: '#1a1a1a' }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-white w-20">Past</label>
                      <input type="color" value={pastColor} onChange={(e) => setPastColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
                      <input type="text" value={pastColor} onChange={(e) => setPastColor(e.target.value)} className="flex-1 px-2 py-1 rounded text-white text-sm" style={{ backgroundColor: '#1a1a1a' }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-white w-20">Current</label>
                      <input type="color" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
                      <input type="text" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="flex-1 px-2 py-1 rounded text-white text-sm" style={{ backgroundColor: '#1a1a1a' }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-white w-20">Future</label>
                      <input type="color" value={futureColor} onChange={(e) => setFutureColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
                      <input type="text" value={futureColor} onChange={(e) => setFutureColor(e.target.value)} className="flex-1 px-2 py-1 rounded text-white text-sm" style={{ backgroundColor: '#1a1a1a' }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-white w-20">Goal</label>
                      <input type="color" value={goalColor} onChange={(e) => setGoalColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer" />
                      <input type="text" value={goalColor} onChange={(e) => setGoalColor(e.target.value)} className="flex-1 px-2 py-1 rounded text-white text-sm" style={{ backgroundColor: '#1a1a1a' }} />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Offsets (%)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-lc-percent-gray mb-1">Top</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={offsetTop === 0 ? '' : offsetTop}
                        onChange={(e) => setOffsetTop(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 rounded text-white text-sm focus:outline-none"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        min={-100}
                        max={100}
                        step={1}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-lc-percent-gray mb-1">Bottom</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={offsetBottom === 0 ? '' : offsetBottom}
                        onChange={(e) => setOffsetBottom(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 rounded text-white text-sm focus:outline-none"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        min={-100}
                        max={100}
                        step={1}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-lc-percent-gray mb-1">Left</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={offsetLeft === 0 ? '' : offsetLeft}
                        onChange={(e) => setOffsetLeft(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 rounded text-white text-sm focus:outline-none"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        min={-100}
                        max={100}
                        step={1}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-lc-percent-gray mb-1">Right</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={offsetRight === 0 ? '' : offsetRight}
                        onChange={(e) => setOffsetRight(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 rounded text-white text-sm focus:outline-none"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        min={-100}
                        max={100}
                        step={1}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-lc-percent-gray mb-1">Goal top</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={goalTextTopOffset === 0 ? '' : goalTextTopOffset}
                        onChange={(e) => setGoalTextTopOffset(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 rounded text-white text-sm focus:outline-none"
                        style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        min={-100}
                        max={100}
                        step={1}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setBgColor('#1a1a1a');
                    setPastColor('#ffffff');
                    setCurrentColor('#ff6b35');
                    setFutureColor('#2a2a2a');
                    // Reset offsets to device defaults
                    const safeArea = selectedDevice.defaultSafeArea || { top: 0, bottom: 0, left: 0, right: 0 };
                    setOffsetTop(safeArea.top ?? 0);
                    setOffsetBottom(safeArea.bottom ?? 0);
                    setOffsetLeft(safeArea.left ?? 0);
                    setOffsetRight(safeArea.right ?? 0);
                  }}
                  className="w-full px-3 py-2 rounded text-sm text-white"
                  style={{ backgroundColor: '#000000' }}
                >
                  Reset colors & offsets
                </button>
              </div>
            </details>

            <div>
              <label className="block text-sm font-medium mb-2 text-white">
                Device
              </label>
              <select
                value={isCustomDevice ? 'Custom' : selectedDevice.name}
                onChange={(e) => {
                  if (e.target.value === 'Custom') {
                    setIsCustomDevice(true);
                  } else {
                    setIsCustomDevice(false);
                    const device = DEVICE_PRESETS.find(d => d.name === e.target.value);
                    if (device) setSelectedDevice(device);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium text-white focus:outline-none"
                style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
              >
                <option value="Custom">Custom</option>
                {DEVICE_PRESETS.map((device) => (
                  <option key={device.name} value={device.name}>
                    {device.name}
                  </option>
                ))}
              </select>

              {isCustomDevice && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="block text-xs text-lc-percent-gray mb-1">Width (px)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(parseInt(e.target.value) || 1290)}
                      className="w-full px-2 py-1 rounded text-white text-sm focus:outline-none"
                      style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                      min={100}
                      max={8000}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-lc-percent-gray mb-1">Height (px)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(parseInt(e.target.value) || 2796)}
                      className="w-full px-2 py-1 rounded text-white text-sm focus:outline-none"
                      style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                      min={100}
                      max={8000}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-2xl shadow-xl p-4 md:p-6" style={{ backgroundColor: '#2a2a2a' }}>
            <h2 className="text-lg font-semibold mb-4 text-white">
              Preview
            </h2>

            {/* Device Info */}
            <div className="rounded-lg p-3 mb-4 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}>
              <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-lc-percent-gray mb-1">Device</div>
                  <div className="text-sm font-medium text-white">{isCustomDevice ? 'Custom' : selectedDevice.name}</div>
                </div>
                <div className="h-8 w-px" style={{ backgroundColor: '#333' }}></div>
                <div>
                  <div className="text-xs text-lc-percent-gray mb-1">Resolution</div>
                  <div className="text-sm font-medium" style={{ color: '#ff6b35' }}>{currentDevice.width} × {currentDevice.height}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-lc-percent-gray mb-1">Widgets</div>
                <div className="text-sm font-medium text-white">{hasWidgets ? 'Yes' : 'No'}</div>
              </div>
            </div>

            {/* Hide overlay checkbox */}
            <div className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                id="hideOverlay"
                checked={hideOverlay}
                onChange={(e) => setHideOverlay(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: '#ff6b35' }}
              />
              <label htmlFor="hideOverlay" className="text-sm cursor-pointer" style={{ color: '#cccccc' }}>
                Hide overlay (preview only)
              </label>
            </div>

            {/* Live Preview with aspect ratio */}
            <div className="rounded-lg overflow-hidden relative flex items-center justify-center h-[600px] md:h-[800px]" style={{ backgroundColor: '#1a1a1a' }}>
              <div
                className="relative"
                style={{
                  width: `${currentDevice.width * scale}px`,
                  height: `${currentDevice.height * scale}px`,
                }}
              >
                {previewLoading && (
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: '#1a1a1a', zIndex: 10 }}
                  >
                    <div className="text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 mb-2" style={{ borderColor: '#ff6b35' }}></div>
                      <div className="text-sm" style={{ color: '#cccccc' }}>Generating preview...</div>
                    </div>
                  </div>
                )}
                <img
                  src={imageUrl}
                  alt="Preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    border: '1px solid #ffffff',
                    borderRadius: '16px',
                    opacity: previewLoading ? 0.3 : 1,
                  }}
                />
                {!hideOverlay && (() => {
                  const overlay = getOverlayImage();
                  return overlay ? (
                    <img
                      src={overlay}
                      alt="Device overlay"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                      }}
                    />
                  ) : null;
                })()}
              </div>
            </div>

            <button
              onClick={shareUrl}
              className="w-full mt-4 text-white px-6 py-3 rounded-lg font-medium transition-all hover:bg-opacity-80"
              style={{ backgroundColor: '#000000' }}
            >
              {buttonText}
            </button>
            <a
              href={process.env.NEXT_PUBLIC_SHORTCUT_URL || "https://www.icloud.com/shortcuts/2e1536903783409c9445bb04dc381637"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-3 block text-center text-white px-6 py-3 rounded-lg font-medium transition-all hover:bg-opacity-80"
              style={{ backgroundColor: '#000000' }}
            >
              2. Get shortcut
            </a>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="w-full mt-3 text-white px-6 py-3 rounded-lg font-medium transition-all hover:bg-opacity-80 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#ff6b35' }}
            >
              3. HELP!!!
              <span className="text-lg leading-none">{showHelp ? '↓' : '→'}</span>
            </button>

            {showHelp && (
              <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}>
                <h3 className="text-lg font-semibold mb-3 text-white">How to use with iOS Shortcuts:</h3>
                <ol className="text-sm space-y-3" style={{ color: '#cccccc' }}>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>1.</span>
                    <span>Press <strong className="text-white">"1. get link"</strong> - the link will be copied to your clipboard</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>2.</span>
                    <span>Press <strong className="text-white">"2. Get shortcut"</strong> - this will open the shortcut in iCloud</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>3.</span>
                    <span>Press <strong className="text-white">"Get shortcut"</strong> (in browser) or <strong className="text-white">"Add shortcut"</strong> (in the form)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>4.</span>
                    <span>Paste the link into the shortcut field</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>5.</span>
                    <span>In second command press on <strong className="text-white">"Wallpaper"</strong> and choose <strong className="text-white">"Lock Screen"</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>6.</span>
                    <span>Close the shortcut and go to <strong className="text-white">Automation</strong> in the Shortcuts app</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>7.</span>
                    <span>Create a new <strong className="text-white">Personal Automation</strong> → <strong className="text-white">"Run immediately"</strong> → Turn off <strong className="text-white">"Notify when run"</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>8.</span>
                    <span><strong className="text-white">When:</strong> Set the time (e.g., every day at 6:00 AM) → <strong className="text-white">Repeat daily</strong> → Run immediately → Turn off "Notify when run"</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>9.</span>
                    <span><strong className="text-white">Do:</strong> Add action <strong className="text-white">"Run Shortcut"</strong> and select the shortcut you added</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>10.</span>
                    <span><strong className="text-white">Start the shortcut manually first time</strong> to grant permissions</span>
                  </li>
                </ol>
                <p className="text-xs mt-3" style={{ color: '#999999' }}>
                  Your wallpaper will automatically update every day! 🎉
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 py-6 text-center" style={{ backgroundColor: '#1a1a1a' }}>
        <div className="container mx-auto px-4 space-y-2">
          <p className="text-sm flex flex-wrap items-center justify-center gap-2" style={{ color: '#999999' }}>
            <a
              href="https://github.com/0x3654/untilwall"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline transition-colors"
              style={{ color: '#999999' }}
            >
              Opensource
            </a>
            <span style={{ color: '#666666' }}>|</span>
            <a
              href="https://github.com/0x3654"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline transition-colors"
              style={{ color: '#ff6b35' }}
            >
              Made by 0x3654
            </a>
            {stats && stats.uniqueVisitors > 0 && (
              <>
                <span style={{ color: '#666666' }}>|</span>
                <span className="text-xs">{stats.uniqueVisitors} 🍪</span>
                <span className="text-xs">{stats.imageGenerations} 🖼</span>
                {stats.devices && Object.keys(stats.devices).length > 0 && (
                  <>
                    <span className="text-xs">
                      {(stats.devices.iPhone || stats.devices.iphone || 0) +
                      (stats.devices.iPad || stats.devices.ipad || 0) +
                      (stats.devices.android || stats.devices.Android || 0)} 📱
                    </span>
                    <span className="text-xs">
                      {(stats.devices.Mac || stats.devices.mac || 0) +
                      (stats.devices.Windows || stats.devices.windows || 0)} 💻
                    </span>
                  </>
                )}
              </>
            )}
            <span style={{ color: '#666666' }}>|</span>
            <a
              href="https://thelifecalendar.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline transition-colors"
              style={{ color: '#999999' }}
            >
              Inspired by The Life Calendar
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
