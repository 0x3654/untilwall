import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { trackVisitor, trackImageGeneration } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get('format') || 'png'; // Support SVG for faster preview

  // Track image generation (only for downloads, not previews)
  const userAgent = request.headers.get('user-agent') || '';
  const responseHeaders: HeadersInit = {};

  // Only track actual downloads, not previews (format=svg is preview only)
  if (format !== 'svg') {
    trackImageGeneration(userAgent);
  }

  // Get parameters
  const startDate = searchParams.get('start_date') || '2000-01-01';
  const endDate = searchParams.get('end_date') || '2080-01-01';
  const hasWidgets = searchParams.get('has_widgets') === 'true';
  const width = parseInt(searchParams.get('width') || '1290');
  const height = parseInt(searchParams.get('height') || '2796');
  const offsetTop = parseFloat(searchParams.get('offset_top') || '0');
  const offsetBottom = parseFloat(searchParams.get('offset_bottom') || '0');
  const offsetLeft = parseFloat(searchParams.get('offset_left') || '0');
  const offsetRight = parseFloat(searchParams.get('offset_right') || '0');
  const ringStyleParam = searchParams.get('ring_style');
  const ringStyle = ringStyleParam === null ? 1 : parseInt(ringStyleParam, 10); // 1 = filled (default), 0 = ring
  const showText = searchParams.get('show_text') !== '0'; // Default true (show text), '0' = hide

  // Default padding value
  const padding = 60;

  // Calculate widget space
  const widgetSpace = hasWidgets ? Math.round(height * 0.15) : 0;

  // Calculate safe area offsets in pixels
  const safeAreaTopPx = Math.round(height * (offsetTop / 100));
  const safeAreaBottomPx = Math.round(height * (offsetBottom / 100));
  const safeAreaLeftPx = Math.round(width * (offsetLeft / 100));
  const safeAreaRightPx = Math.round(width * (offsetRight / 100));

  // Calculate effective padding and available width
  const effectivePadding = Math.max(padding, safeAreaLeftPx, safeAreaRightPx);
  const availableWidth = width - 2 * effectivePadding;

  // Calculate days
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  const daysPassed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / msPerDay));

  let currentDayIndex = -1;
  if (daysPassed > 0 && daysPassed < totalDays) {
    currentDayIndex = daysPassed - 1;
  }

  const percentage = ((daysPassed / totalDays) * 100).toFixed(1);

  // Calculate available content area (excluding safe areas)
  // Note: widgetSpace is part of the screen height, not extra
  const contentWidth = width - safeAreaLeftPx - safeAreaRightPx;
  const calendarTopY = widgetSpace + safeAreaTopPx;  // Where calendar content starts
  const availableHeight = height - calendarTopY - safeAreaBottomPx;  // Space for calendar content

  // Calculate proportional spacing based on available height
  const gridTopOffset = Math.round(availableHeight * 0.05);
  const bottomTextHeight = Math.round(availableHeight * 0.15);
  const calendarHeight = availableHeight - gridTopOffset - bottomTextHeight;

  // Calculate circles that fit in a row (horizontally)
  const gapHorizontalPercent = 0.03; // 3% of screen width for horizontal gap
  const gapVerticalPercent = 0.02; // 2% of screen height for vertical gap
  const gapHorizontalPx = Math.round(contentWidth * gapHorizontalPercent);
  const gapVerticalPx = Math.round(calendarHeight * gapVerticalPercent);

  // Fixed: 15 circles per row
  const circlesPerRow = 15;
  const circleFromWidth = (contentWidth - (circlesPerRow - 1) * gapHorizontalPx) / circlesPerRow;

  // Calculate circles that fit vertically
  const targetRows = Math.ceil(totalDays / circlesPerRow);
  const circleFromHeight = calendarHeight / targetRows;

  // Use smaller circle size to fit
  const finalCircleSize = Math.min(circleFromWidth, circleFromHeight);

  // Calculate grid offset to center it
  const gridWidth = circlesPerRow * finalCircleSize + (circlesPerRow - 1) * gapHorizontalPx;
  const gridOffsetX = safeAreaLeftPx + (contentWidth - gridWidth) / 2;

  // Calculate days remaining
  const daysRemaining = totalDays - daysPassed;
  const contentCenter = safeAreaLeftPx + contentWidth / 2;
  const fontSize = Math.round(contentWidth * 0.035);
  const lineHeight = Math.round(fontSize * 1.8);

  // Generate SVG
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#1a1a1a"/>

      ${hasWidgets && widgetSpace > 0 ? `
      <!-- Widget Area (space reserved for iOS widgets) -->
      <!-- No text rendered - space reserved only -->
      ` : ''}

      <!-- Calendar Container -->
      <g transform="translate(0, ${calendarTopY})">
        <!-- Grid -->
        <g transform="translate(${gridOffsetX}, ${gridTopOffset})">
          ${generateDaysGrid(totalDays, currentDayIndex, circlesPerRow, finalCircleSize, gapHorizontalPx, gapVerticalPx, ringStyle)}
        </g>
      </g>

      ${showText ? `
      <!-- Bottom Text (positioned between iPhone buttons) -->
      <g transform="translate(0, ${height - 220})" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <text x="${contentCenter}" y="0" text-anchor="middle" font-size="${fontSize}" font-weight="600">
          <tspan fill="#ff6b35">${daysRemaining}d until</tspan>
          <tspan fill="#999999"> ${percentage}%</tspan>
        </text>
      </g>
      ` : ''}
    </svg>
  `;

  function generateDaysGrid(totalDays: number, currentDayIndex: number, circlesPerRow: number, circleSize: number, gapHorizontal: number, gapVertical: number, ringStyle: number): string {
    let svg = '';
    let x = 0;
    let y = 0;

    // Heart SVG path (24x24 viewBox, will be scaled to circleSize)
    const heartPath = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    // Broken heart path (same heart with a crack)
    const brokenHeartPath = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z M12 4l-1 5-1-2 M13 9l1 5 1-2';

    for (let i = 0; i < totalDays; i++) {
      const isPast = i < currentDayIndex;
      const isCurrent = i === currentDayIndex;
      const isFuture = i > currentDayIndex;

      let shape;
      if (ringStyle === 2) {
        // Heart style: ❤️ (past), ❤️‍🩹 (current), 💔 (future)
        const svgWidth = circleSize;
        const svgHeight = circleSize;

        if (isPast) {
          // White heart ❤️
          shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 24 24" x="${x}" y="${y}"><path d="${heartPath}" fill="#ffffff"/></svg>`;
        } else if (isCurrent) {
          // Orange healing heart ❤️‍🩹
          shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 24 24" x="${x}" y="${y}"><path d="${heartPath}" fill="#ff6b35"/></svg>`;
        } else {
          // Gray broken heart 💔
          shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 24 24" x="${x}" y="${y}"><path d="${brokenHeartPath}" fill="#808080"/></svg>`;
        }
      } else if (isPast) {
        if (ringStyle === 0) {
          // Ring style: gray circle with white outline (ring effect)
          const r = circleSize / 2;
          const strokeWidth = circleSize * 0.15;
          const innerR = r - strokeWidth / 2;
          shape = `<circle cx="${x + r}" cy="${y + r}" r="${innerR}" fill="#2a2a2a" stroke="#ffffff" stroke-width="${strokeWidth}"/>`;
        } else {
          // Default style (ringStyle = 1): filled white circles
          shape = `<circle cx="${x + circleSize / 2}" cy="${y + circleSize / 2}" r="${circleSize / 2}" fill="#ffffff"/>`;
        }
      } else if (isCurrent) {
        shape = `<circle cx="${x + circleSize / 2}" cy="${y + circleSize / 2}" r="${circleSize / 2}" fill="#ff6b35"/>`;
      } else {
        shape = `<circle cx="${x + circleSize / 2}" cy="${y + circleSize / 2}" r="${circleSize / 2}" fill="#2a2a2a"/>`;
      }

      svg += shape;

      x += circleSize + gapHorizontal;

      // Check if we need to move to next row
      if ((i + 1) % circlesPerRow === 0 && i < totalDays - 1) {
        x = 0;
        y += circleSize + gapVertical;
      }
    }

    return svg;
  }

  // Return SVG directly for faster preview (if format=svg)
  if (format === 'svg') {
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow, nosnippet',
        ...responseHeaders,
      },
    });
  }

  // Convert SVG to PNG
  const pngBuffer = await sharp(Buffer.from(svg), { density: 300 })
    .png()
    .toBuffer();

  // Return PNG
  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="life-calendar.png"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Robots-Tag': 'noindex, nofollow, nosnippet',
      'X-Content-Type-Options': 'nosniff',
      ...responseHeaders,
    },
  });
}
