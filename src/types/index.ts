export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  type: 'iphone' | 'ipad' | 'mac';
  orientation?: 'portrait' | 'landscape';
  circleSize?: number;  // Size of each circle in pixels
  circleGap?: number;   // Gap between circles in pixels
  padding?: number;     // Padding around the grid
  defaultSafeArea?: {    // Default safe area offsets in percentages
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

export interface CalendarConfig {
  startDate: string;
  endDate: string;
  theme: 'light' | 'dark';
  offsetY: number;
  device: DevicePreset;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  // iPhones (portrait only) - 15 days per row
  { name: 'iPhone 15 Pro Max / Plus', width: 1290, height: 2796, type: 'iphone', orientation: 'portrait', circleSize: 56, circleGap: 24, padding: 20, defaultSafeArea: { top: 22, bottom: 25, left: 10, right: 10 } },
  // { name: 'iPhone 15 Pro / 15', width: 1179, height: 2556, type: 'iphone', orientation: 'portrait', circleSize: 52, circleGap: 22, padding: 18, defaultSafeArea: { top: 15, left: 16, right: 8 } },
  { name: 'iPhone Xs', width: 1125, height: 2436, type: 'iphone', orientation: 'portrait', circleSize: 50, circleGap: 20, padding: 18, defaultSafeArea: { top: 25, bottom: 10, left: 15, right: 15 } },

  // iPhone Duo (foldable, 2026) - official specs: inner 7.6" 1878x2670 @430ppi,
  // outer cover 5.4" 1398x2034 @460ppi; Dynamic Island on both displays.
  // Inner preset is landscape (2670x1878) per owner preference; in portrait
  // the crease runs vertically through the grid, landscape puts it
  // horizontally between rows. No device-frame overlay (unavailable).
  { name: 'iPhone Duo Inner 7.6" Landscape', width: 2670, height: 1878, type: 'iphone', orientation: 'landscape', circleSize: 46, circleGap: 18, padding: 30, defaultSafeArea: { top: 6, bottom: 6, left: 8, right: 8 } },
  { name: 'iPhone Duo Outer 5.4"', width: 1398, height: 2034, type: 'iphone', orientation: 'portrait', circleSize: 48, circleGap: 20, padding: 24, defaultSafeArea: { top: 22, bottom: 25, left: 10, right: 10 } },

  // iPads (portrait and landscape)
  { name: 'iPad Pro 13" Portrait', width: 2048, height: 2732, type: 'ipad', orientation: 'portrait', circleSize: 48, circleGap: 20, padding: 80, defaultSafeArea: { top: 5, bottom: 5 } },
  { name: 'iPad Pro 13" Landscape', width: 2732, height: 2048, type: 'ipad', orientation: 'landscape', circleSize: 48, circleGap: 20, padding: 80, defaultSafeArea: { top: 5, bottom: 5 } },
  // { name: 'iPad Pro 11" Portrait', width: 1668, height: 2388, type: 'ipad', orientation: 'portrait', circleSize: 44, circleGap: 18, padding: 70 },
  // { name: 'iPad Pro 11" Landscape', width: 2388, height: 1668, type: 'ipad', orientation: 'landscape', circleSize: 44, circleGap: 18, padding: 70 },
  // { name: 'iPad Air Portrait', width: 1640, height: 2360, type: 'ipad', orientation: 'portrait', circleSize: 44, circleGap: 18, padding: 70 },
  // { name: 'iPad Air Landscape', width: 2360, height: 1640, type: 'ipad', orientation: 'landscape', circleSize: 44, circleGap: 18, padding: 70 },
  // { name: 'iPad mini Portrait', width: 1488, height: 2266, type: 'ipad', orientation: 'portrait', circleSize: 40, circleGap: 16, padding: 65 },
  // { name: 'iPad mini Landscape', width: 2266, height: 1488, type: 'ipad', orientation: 'landscape', circleSize: 40, circleGap: 16, padding: 65 },

  // Mac (landscape)
  // { name: 'MacBook Pro 16"', width: 3456, height: 2234, type: 'mac', orientation: 'landscape', circleSize: 50, circleGap: 22, padding: 100 },
  // { name: 'MacBook Pro 14"', width: 3024, height: 1964, type: 'mac', orientation: 'landscape', circleSize: 46, circleGap: 20, padding: 90 },
  // { name: 'MacBook Air 15"', width: 2880, height: 1864, type: 'mac', orientation: 'landscape', circleSize: 46, circleGap: 20, padding: 90 },
  { name: 'MacBook Air 13"', width: 2560, height: 1664, type: 'mac', orientation: 'landscape', circleSize: 42, circleGap: 18, padding: 80 },
  // { name: 'iMac 24"', width: 4480, height: 2520, type: 'mac', orientation: 'landscape', circleSize: 56, circleGap: 24, padding: 120 },
];
