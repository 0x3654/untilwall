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
  const [selectedDevice, setSelectedDevice] = useState(savedSettings?.deviceIndex !== undefined ? DEVICE_PRESETS[savedSettings.deviceIndex] : DEVICE_PRESETS[0]);
  const [buttonText, setButtonText] = useState('1. get link');
  const [imageUrl, setImageUrl] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Safe area offsets (in percentages) - use device defaults if available
  const defaultSafeArea = selectedDevice.defaultSafeArea || { top: 0, bottom: 0, left: 0, right: 0 };
  const [offsetTop, setOffsetTop] = useState(savedSettings?.offsetTop ?? defaultSafeArea.top ?? 0);
  const [offsetBottom, setOffsetBottom] = useState(savedSettings?.offsetBottom ?? defaultSafeArea.bottom ?? 0);
  const [offsetLeft, setOffsetLeft] = useState(savedSettings?.offsetLeft ?? defaultSafeArea.left ?? 0);
  const [offsetRight, setOffsetRight] = useState(savedSettings?.offsetRight ?? defaultSafeArea.right ?? 0);

  // Save settings to cookie whenever any parameter changes
  useEffect(() => {
    const deviceIndex = DEVICE_PRESETS.findIndex(d => d.name === selectedDevice.name);
    const settings = {
      deviceIndex,
      startDay, startMonth, startYear,
      endDay, endMonth, endYear,
      hasWidgets,
      ringStyle,
      showText,
      offsetTop, offsetBottom, offsetLeft, offsetRight
    };
    saveSettingsToCookie(settings);
  }, [selectedDevice, startDay, startMonth, startYear, endDay, endMonth, endYear, hasWidgets, ringStyle, showText, offsetTop, offsetBottom, offsetLeft, offsetRight]);

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

  // Build ISO dates from parts
  const startDate = dmyToIso(startDay, startMonth, startYear);
  const endDate = dmyToIso(endDay, endMonth, endYear);

  // Update preview image when parameters change
  useEffect(() => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      theme: 'dark',
      has_widgets: hasWidgets.toString(),
      ring_style: ringStyle.toString(),
      show_text: showText ? '1' : '0',
      width: selectedDevice.width.toString(),
      height: selectedDevice.height.toString(),
      offset_top: offsetTop.toString(),
      offset_bottom: offsetBottom.toString(),
      offset_left: offsetLeft.toString(),
      offset_right: offsetRight.toString(),
      t: Date.now().toString(), // Prevent caching
    });
    const url = `/goal?${params.toString()}`;
    setImageUrl(url);
  }, [startDate, endDate, hasWidgets, ringStyle, showText, selectedDevice, offsetTop, offsetBottom, offsetLeft, offsetRight]);

  const shareUrl = async () => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      theme: 'dark',
      has_widgets: hasWidgets.toString(),
      ring_style: ringStyle.toString(),
      show_text: showText ? '1' : '0',
      width: selectedDevice.width.toString(),
      height: selectedDevice.height.toString(),
      offset_top: offsetTop.toString(),
      offset_bottom: offsetBottom.toString(),
      offset_left: offsetLeft.toString(),
      offset_right: offsetRight.toString(),
    });
    const url = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/goal?${params.toString()}`;

    try {
      await navigator.clipboard.writeText(url);
      setButtonText('Copied to clipboard!');
      setTimeout(() => setButtonText('1. get link'), 2000);
    } catch (err) {
      // Silently fail if clipboard API is not available
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Calculate preview scale to fit in container
  const [containerSize, setContainerSize] = useState({ width: 400, height: 500 });
  useEffect(() => {
    const updateSize = () => {
      const maxWidth = Math.min(400, (window.innerWidth - 32) / 2 - 32);
      setContainerSize({ width: maxWidth, height: 500 });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Calculate scale to fit device in container
  const deviceAspectRatio = selectedDevice.width / selectedDevice.height;
  const containerAspectRatio = containerSize.width / containerSize.height;

  let scaleWidth;
  if (deviceAspectRatio > containerAspectRatio) {
    // Device is wider, fit to width
    scaleWidth = containerSize.width;
  } else {
    // Device is taller, fit to height
    scaleWidth = containerSize.height * deviceAspectRatio;
  }

  const scale = scaleWidth / selectedDevice.width;

  return (
    <main className="min-h-screen bg-lc-bg-dark flex flex-col">
      <div className="container mx-auto px-4 py-6 md:py-8 flex-grow">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-8" style={{ color: '#ff6b35' }}>
          Until Wall
        </h1>

        <div className="grid lg:grid-cols-2 gap-4 md:gap-8 max-w-7xl mx-auto">
          {/* Controls */}
          <div className="rounded-2xl shadow-xl p-4 md:p-6 space-y-4 md:space-y-6" style={{ backgroundColor: '#2a2a2a' }}>
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

            <div>
              <label className="flex items-center gap-3 cursor-pointer text-white">
                <input
                  type="checkbox"
                  checked={hasWidgets}
                  onChange={(e) => setHasWidgets(e.target.checked)}
                  className="w-5 h-5 rounded"
                  style={{ accentColor: '#ff6b35' }}
                />
                <span className="text-sm font-medium">Space for widgets</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white">Ring Style</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-white">
                  <input
                    type="radio"
                    name="ringStyle"
                    checked={ringStyle === 1}
                    onChange={() => setRingStyle(1)}
                    className="w-5 h-5"
                    style={{ accentColor: '#ff6b35' }}
                  />
                  <span className="text-sm">Solid</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-white">
                  <input
                    type="radio"
                    name="ringStyle"
                    checked={ringStyle === 0}
                    onChange={() => setRingStyle(0)}
                    className="w-5 h-5"
                    style={{ accentColor: '#ff6b35' }}
                  />
                  <span className="text-sm">Ring</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-white">
                  <input
                    type="radio"
                    name="ringStyle"
                    checked={ringStyle === 2}
                    onChange={() => setRingStyle(2)}
                    className="w-5 h-5"
                    style={{ accentColor: '#ff6b35' }}
                  />
                  <span className="text-sm">Hearts</span>
                </label>
              </div>
              <p className="text-xs mt-2 text-lc-percent-gray">
                {ringStyle === 1 ? 'Filled white circles' : ringStyle === 0 ? 'White outline around gray circles' : 'For your precious hearts ❤️'}
              </p>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer text-white">
                <input
                  type="checkbox"
                  checked={showText}
                  onChange={(e) => setShowText(e.target.checked)}
                  className="w-5 h-5 rounded"
                  style={{ accentColor: '#ff6b35' }}
                />
                <span className="text-sm font-medium">Show bottom text</span>
              </label>
              <p className="text-xs mt-1 ml-8 text-lc-percent-gray">
                Display "X days until Y%" text at bottom
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white">
                Safe Area Offsets (%)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-lc-percent-gray mb-1">Top %</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={offsetTop}
                    onChange={(e) => setOffsetTop(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg text-white focus:outline-none"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                    min={0}
                    max={50}
                    step={0.1}
                  />
                </div>
                <div>
                  <label className="block text-xs text-lc-percent-gray mb-1">Bottom %</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={offsetBottom}
                    onChange={(e) => setOffsetBottom(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg text-white focus:outline-none"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                    min={0}
                    max={50}
                    step={0.1}
                  />
                </div>
                <div>
                  <label className="block text-xs text-lc-percent-gray mb-1">Left %</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={offsetLeft}
                    onChange={(e) => setOffsetLeft(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg text-white focus:outline-none"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                    min={0}
                    max={50}
                    step={0.1}
                  />
                </div>
                <div>
                  <label className="block text-xs text-lc-percent-gray mb-1">Right %</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={offsetRight}
                    onChange={(e) => setOffsetRight(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg text-white focus:outline-none"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
                    min={0}
                    max={50}
                    step={0.1}
                  />
                </div>
              </div>
              <p className="text-xs mt-2 text-lc-percent-gray">
                Offset to avoid system UI (clock, home indicator, etc.)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white">
                Device
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                {DEVICE_PRESETS.map((device) => (
                  <button
                    key={device.name}
                    onClick={() => setSelectedDevice(device)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                      selectedDevice.name === device.name
                        ? 'bg-lc-current text-white shadow-md'
                        : 'bg-lc-empty-dark text-white hover:bg-opacity-80'
                    }`}
                    style={{
                      backgroundColor: selectedDevice.name === device.name ? '#1a1a1a' : '#2a2a2a',
                      border: selectedDevice.name === device.name ? '1px solid #3a3a3a' : 'none',
                    }}
                  >
                    {device.name}
                  </button>
                ))}
              </div>
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
                  <div className="text-sm font-medium text-white">{selectedDevice.name}</div>
                </div>
                <div className="h-8 w-px" style={{ backgroundColor: '#333' }}></div>
                <div>
                  <div className="text-xs text-lc-percent-gray mb-1">Resolution</div>
                  <div className="text-sm font-medium" style={{ color: '#ff6b35' }}>{selectedDevice.width} × {selectedDevice.height}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-lc-percent-gray mb-1">Widgets</div>
                <div className="text-sm font-medium text-white">{hasWidgets ? 'Yes' : 'No'}</div>
              </div>
            </div>

            {/* Live Preview with aspect ratio */}
            <div className="rounded-lg overflow-hidden relative flex items-center justify-center h-[300px] md:h-[500px]" style={{ backgroundColor: '#1a1a1a' }}>
              <div
                className="relative"
                style={{
                  width: `${selectedDevice.width * scale}px`,
                  height: `${selectedDevice.height * scale}px`,
                }}
              >
                <img
                  src={imageUrl}
                  alt="Preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    border: '1px solid #ffffff',
                    borderRadius: '16px',
                  }}
                />
                {(selectedDevice.name.includes('iPhone 15 Pro Max') || selectedDevice.name.includes('iPhone Xs')) && (
                  <img
                    src={`/overlay/${selectedDevice.name.includes('iPhone 15 Pro Max')
                      ? (hasWidgets ? '15promax_widget.png' : '15promax.png')
                      : (hasWidgets ? 'Xs_widget.png' : 'Xs.png')
                    }`}
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
                )}
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
                    <span>Press <strong className="text-white">"Set"</strong> in shortcut command and choose <strong className="text-white">"Lock Screen"</strong> to select which screen to set wallpaper on</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>4.</span>
                    <span>Press <strong className="text-white">"Get shortcut"</strong> (in browser) or <strong className="text-white">"Add shortcut"</strong> (in the form)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold" style={{ color: '#ff6b35' }}>5.</span>
                    <span>Paste the link into the shortcut field</span>
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
        <div className="container mx-auto px-4">
          <p className="text-sm mb-2" style={{ color: '#999999' }}>
            © {new Date().getFullYear()} untilwall
          </p>
          <a
            href="https://github.com/0x3654"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:underline transition-colors"
            style={{ color: '#ff6b35' }}
          >
            0x3654
          </a>
        </div>
      </footer>
    </main>
  );
}
