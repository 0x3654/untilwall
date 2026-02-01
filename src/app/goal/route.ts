import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { trackVisitor, trackImageGeneration } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get('format') || 'png'; // Support SVG for faster preview
  const html = searchParams.get('html') === 'true'; // Return HTML page with centered image

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
  const goalTextTopOffset = parseFloat(searchParams.get('goal_text_top_offset') || '0'); // Goal text top offset (%)
  const ringStyleParam = searchParams.get('ring_style');
  const ringStyle = ringStyleParam === null ? 1 : parseInt(ringStyleParam, 10); // 1 = filled (default), 0 = ring
  const dotScaleParam = searchParams.get('dot_scale');
  const dotScale = dotScaleParam === null ? 1.0 : parseFloat(dotScaleParam); // Default scale multiplier
  const showText = searchParams.get('show_text') !== '0'; // Default true (show text), '0' = hide
  const elapsedMode = searchParams.get('elapsed_mode') === 'true'; // Default false (until mode)
  const goalText = searchParams.get('goal_text') || ''; // Goal text to display at top

  // Color customization (with defaults)
  const bgColor = searchParams.get('bg_color') || '#1a1a1a';
  const pastColor = searchParams.get('past_color') || '#ffffff';
  const currentColor = searchParams.get('current_color') || '#ff6b35';
  const futureColor = searchParams.get('future_color') || '#2a2a2a';
  const goalColor = searchParams.get('goal_color') || currentColor; // Goal text color (default to current)

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

  // Calculate display text based on elapsed mode
  let displayDays: number;
  let displayText: string;

  if (elapsedMode) {
    // Elapsed mode: calculate days from start_date to now
    const elapsedDays = Math.floor((now.getTime() - start.getTime()) / msPerDay);
    displayDays = Math.max(0, elapsedDays);
    displayText = 'elapsed';
  } else {
    // Normal mode: days remaining
    const daysRemaining = totalDays - daysPassed;
    displayDays = daysRemaining;
    displayText = 'until';
  }

  // Calculate available content area (excluding safe areas)
  // Note: widgetSpace is part of the screen height, not extra
  const contentWidth = width - safeAreaLeftPx - safeAreaRightPx;
  const calendarTopY = widgetSpace + safeAreaTopPx;  // Where calendar content starts
  const availableHeight = height - calendarTopY - safeAreaBottomPx;  // Space for calendar content

  // Calculate proportional spacing based on available height
  const gridTopOffsetBase = Math.round(availableHeight * 0.05);
  const bottomTextHeight = Math.round(availableHeight * 0.15);
  const calendarHeight = availableHeight - gridTopOffsetBase - bottomTextHeight;

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

  // Apply dot scale multiplier (user-adjustable scale for dot sizes)
  // Scale only circles, NOT gaps - keep grid in place
  const scaledCircleSize = finalCircleSize * dotScale;

  // Calculate grid offset to center it (using base circle size, not scaled)
  const gridWidth = circlesPerRow * finalCircleSize + (circlesPerRow - 1) * gapHorizontalPx;
  const gridOffsetX = safeAreaLeftPx + (contentWidth - gridWidth) / 2;

  // Calculate days remaining
  const daysRemaining = totalDays - daysPassed;
  const contentCenter = safeAreaLeftPx + contentWidth / 2;
  const fontSize = Math.round(contentWidth * 0.035);
  const lineHeight = Math.round(fontSize * 1.8);

  // Calculate goal text height if present (after fontSize is available)
  // Prepare multiline goal text
  const goalFontSize = Math.round(fontSize * 1.5);
  const goalLineHeight = Math.round(goalFontSize * 1.3);
  const goalLines = goalText ? goalText.split('\n') : [];
  const goalTextHeight = goalLines.length > 0 ? Math.round(goalLineHeight * goalLines.length + fontSize * 0.5) : 0; // Space for multiline goal text + gap
  const gridTopOffset = gridTopOffsetBase + goalTextHeight; // Add space for goal text

  // Generate multiline goal text SVG
  const goalTextSvg = goalLines.length > 0 ? goalLines.map((line, index) => {
    const yPos = index * goalLineHeight;
    return `<tspan x="${contentCenter}" y="${yPos}" text-anchor="middle">${line}</tspan>`;
  }).join('\n        ') : '';

  // Generate SVG
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${bgColor}"/>

      ${hasWidgets && widgetSpace > 0 ? `
      <!-- Widget Area (space reserved for iOS widgets) -->
      <!-- No text rendered - space reserved only -->
      ` : ''}

      ${goalLines.length > 0 ? `
      <!-- Goal Text -->
      <g transform="translate(0, ${widgetSpace + safeAreaTopPx + Math.round(availableHeight * 0.05) + Math.round(height * (goalTextTopOffset / 100))})">
        <text font-family="'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', 'Fantasy', cursive" font-size="${goalFontSize}" font-weight="bold" fill="${goalColor}" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
        ${goalTextSvg}
        </text>
      </g>
      ` : ''}

      <!-- Calendar Container -->
      <g transform="translate(0, ${calendarTopY})">
        <!-- Grid -->
        <g transform="translate(${gridOffsetX}, ${gridTopOffset})">
          ${generateDaysGrid(totalDays, currentDayIndex, circlesPerRow, finalCircleSize, scaledCircleSize, gapHorizontalPx, gapVerticalPx, ringStyle, pastColor, currentColor, futureColor)}
        </g>
      </g>

      ${showText ? `
      <!-- Bottom Text (positioned between iPhone buttons) -->
      <g transform="translate(0, ${height - 220})" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <text x="${contentCenter}" y="0" text-anchor="middle" font-size="${fontSize}" font-weight="600">
          <tspan fill="${currentColor}">${displayDays}d ${displayText}</tspan>
          <tspan fill="#999999"> ${percentage}%</tspan>
        </text>
      </g>
      ` : ''}
    </svg>
  `;

  function generateDaysGrid(totalDays: number, currentDayIndex: number, circlesPerRow: number, baseSize: number, renderSize: number, gapHorizontal: number, gapVertical: number, ringStyle: number, pastColor: string, currentColor: string, futureColor: string): string {
    let svg = '';
    let x = 0;
    let y = 0;

    // Heart SVG path (24x24 viewBox, will be scaled to circleSize)
    const heartPath = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    // Broken heart path (same heart with a crack)
    const brokenHeartPath = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z M12 4l-1 5-1-2 M13 9l1 5 1-2';

    // Custom icon paths from .tmp
    // Poop emoji
    const poopPath = 'M451.36 369.14C468.66 355.99 480 335.41 480 312c0-39.77-32.24-72-72-72h-14.07c13.42-11.73 22.07-28.78 22.07-48 0-35.35-28.65-64-64-64h-5.88c3.57-10.05 5.88-20.72 5.88-32 0-53.02-42.98-96-96-96-5.17 0-10.15.74-15.11 1.52C250.31 14.64 256 30.62 256 48c0 44.18-35.82 80-80 80h-16c-35.35 0-64 28.65-64 64 0 19.22 8.65 36.27 22.07 48H104c-39.76 0-72 32.23-72 72 0 23.41 11.34 43.99 28.64 57.14C26.31 374.62 0 404.12 0 440c0 39.76 32.24 72 72 72h368c39.76 0 72-32.24 72-72 0-35.88-26.31-65.38-60.64-70.86z';
    // Piggy bank
    const piggyPath = 'M29,14h-2.2c-0.2-1.3-0.6-2.5-1.3-3.7c-0.7-1.3-0.5-3,0.6-4.1c0.4-0.4,0.4-1,0-1.4c-2-2-5.2-2-7.3-0.1C17.7,4.2,16.3,4,15,4c-3.9,0-7.5,1.9-9.8,5c-1.5,2-2.2,4.5-2.2,7c0,2.2,0.6,4.3,1.7,6.1l0.1,0.2c-0.1,0.1-0.2,0.1-0.3,0.1C4.2,22.5,4,22.3,4,22c0-0.6-0.4-1-1-1s-1,0.4-1,1c0,1.4,1.1,2.5,2.5,2.5c0.5,0,1-0.2,1.4-0.4l3.3,5.4C9.3,29.8,9.6,30,10,30h4c0.3,0,0.6-0.1,0.8-0.4c0.2-0.2,0.3-0.5,0.2-0.8L14.8,28c0.4,0,0.9,0,1.3,0L16,28.8c0,0.3,0,0.6,0.2,0.8S16.7,30,17,30h4c0.3,0,0.7-0.2,0.8-0.5l2-3.1c2.4-0.9,4.5-2.2,5.9-3.7c0.2-0.2,0.3-0.4,0.3-0.7V15C30,14.4,29.6,14,29,14z M14.9,14.5h1.3c1.6,0,2.9,1.3,2.9,3c0,1.5-1.1,2.7-2.5,2.9V21c0,0.6-0.4,1-1,1s-1-0.4-1-1v-0.6c-1.4-0.2-2.5-1.4-2.5-2.9c0-0.6,0.4-1,1-1s1,0.4,1,1c0,0.5,0.4,0.9,0.9,0.9h1.3c0.5,0,0.9-0.4,0.9-0.9c0-0.5-0.4-1-0.9-1h-1.3c-1.6,0-2.9-1.3-2.9-3c0-1.5,1.1-2.7,2.5-2.9V10c0-0.6,0.4-1,1-1s1,0.4,1,1v0.6c1.4,0.2,2.5,1.4,2.5,2.9c0,0.6-0.4,1-1,1s-1-0.4-1-1c0-0.5-0.4-0.9-0.9-0.9h-1.3c-0.5,0-0.9,0.4-0.9,0.9C14,14.1,14.4,14.5,14.9,14.5z';
    // Money bag (simplified)
    const moneyPath = 'M108.883,127.722h293.952l25.344-60.16c3.499-5.888,5.141-12.8,4.587-20.779c-1.621-18.667-12.885-34.453-30.187-42.197c-17.216-7.744-37.269-5.547-52.224,5.675c-8.683,6.507-22.187,14.272-37.056,14.272c-9.557,0-17.963-2.283-24.939-6.784c-19.755-12.693-45.205-12.693-65.003,0c-6.976,4.501-15.36,6.784-24.917,6.784c-14.869,0-28.373-7.765-37.056-14.272c-14.997-11.243-35.008-13.419-52.203-5.675c-17.323,7.723-28.608,23.509-30.336,43.712c-0.448,6.635,1.216,13.355,4.693,19.243L108.883,127.722z M417.216,170.389H293.674c7.424,19.968,8.085,37.696,8.149,40.683c-0.192,16.981,10.453,21.312,10.56,21.355c11.072,4.032,16.789,16.277,12.736,27.328c-3.136,8.683-11.328,14.059-20.032,14.059c-2.411,0-4.885-0.405-7.296-1.28c-14.528-5.312-39.061-24.171-38.635-61.312c-0.021,0-0.405-8.427-3.264-18.859c-2.347,8.384-3.243,15.872-3.307,19.477c0,40.299-33.856,82.389-37.696,87.04c-4.224,5.099-10.304,7.723-16.448,7.723c-4.779,0-9.579-1.579-13.568-4.864c-9.088-7.488-10.368-20.928-2.88-30.016c7.232-8.832,27.925-38.827,27.925-60.267c0.064-3.221,0.725-21.056,8.149-41.067H94.506c-28.416,39.552-65.088,110.4-65.088,213.333v16.277c0,37.376,21.931,70.933,55.829,85.504c40.469,17.387,97.856,26.219,170.603,26.219c72.789,0,130.176-8.832,170.624-26.219c33.899-14.592,55.829-48.149,55.829-85.504v-16.277C482.304,280.789,445.632,209.941,417.216,170.389z';
    // Dachshund (simplified - only the main body/head path)
    const dachshundPath = 'M482.129,131.242c-1.095-2.264-3.251-3.828-5.743-4.167l-40.38-5.484c-5.216-0.708-9.409-4.465-10.686-9.57c-0.505-2.019-1.825-3.737-3.646-4.744c-1.438-0.795-35.549-19.273-64.302-1.112c-24.159,15.259-47.777,59.42-53.016,69.635c-12.724,7.195-44.204,21.931-64.441,18.637c-23.125-3.765-109.376-13.822-145.386-17.971c-15.872-1.83-31.65,0.467-45.629,6.64c-9.684,4.276-17.493,9.807-23.356,16.523c-2.502,2.124-11.011,9.85-17.507,21.787c-10.209,18.761-10.702,38.929-1.428,58.325c3.833,8.015,5.485,15.922,4.912,23.502c-0.313,4.13,2.782,7.732,6.913,8.044c0.192,0.015,0.384,0.022,0.573,0.022c3.885,0,7.173-2.997,7.471-6.935c0.773-10.229-1.358-20.694-6.336-31.105c-4.223-8.832-5.504-17.035-5.026-24.405c2.373,12.689,7.608,28.475,17.356,48.053c2.213,4.445,1.489,9.701-1.844,13.391l-9.485,10.501c-2.263,2.504-2.571,6.214-0.758,9.06c5.215,8.184,18.643,32.591,18.161,47.051c-0.067,2.031,0.692,4.003,2.105,5.464s3.358,2.286,5.391,2.286h30.681c4.341,0,8.392-1.72,11.406-4.844c3.014-3.124,4.588-7.233,4.433-11.571c-0.347-9.674-8.2-17.252-17.88-17.252h-2.112l-8.865-16.838c-1.907-4.388-0.867-9.514,2.619-12.811c8.838-8.361,16.746-17.628,23.623-27.604c13.586,1.115,57.455,5.545,93.566,18.48c9.263,3.318,17.072,6.24,23.963,8.818c23.501,8.792,35.758,13.377,52.418,13.637c1.789,15.149,4.865,28.89,6.929,37.072c1.917,7.603,8.734,12.913,16.58,12.913h24.141c8.688,0,15.937-6.514,16.861-15.151c1.008-9.409-5.545-18.003-14.919-19.565c-2.188-0.365-4.21-0.783-6.053-1.25c-0.234-4.468,0.328-10.621,1.24-16.752c35.703-12.65,63.223-41.846,73.706-78.283l11.459-39.834c8.819-6.343,15.743-14.897,20.115-24.893l3.256-7.441c1.378-3.15,4.591-5.162,8.047-5.001l8.047,0.372c17.794,0.82,34.543-8.201,43.641-23.551l8.884-14.992C483.111,136.167,483.223,133.505,482.129,131.242z';
    // Cat face
    const catPath = 'M30,108.785c9,4.601,19.1,7,29.2,7.2c0.5,0,1.1,0,1.6,0c10.2,0,20.3-2.2,29.5-6.6c8.399-4,16-10,21.601-17.5c6.399-8.601,9.699-18.9,9.699-29.601c0-6.8,0-13.5,0-20.3c0-7.4,0-14.7,0-22.1c0-2.6,0-5.2,0-7.7c0-4.7-4.699-7.8-9-6.1l-22.8,9.5c-1.5,0.6-3.2,0.7-4.7,0.1c-7.4-2.9-15.6-4.4-24.3-4.4s-16.9,1.6-24.3,4.4c-1.5,0.6-3.2,0.5-4.7-0.1L9,6.385c-4.3-1.8-9,1.4-9,6.1c0,3.5,0,7.1,0,10.6c0,7.3,0,14.6,0,22c0,6.2,0,12.3,0,18.5c0,9.9,3.2,19.5,8.9,27.5C14.3,98.585,21.7,104.585,30,108.785z M83,62.485c5.5,0,10,4.5,10,10s-4.5,10-10,10s-10-4.5-10-10C73,66.886,77.5,62.485,83,62.485z M38.6,62.485c5.5,0,10,4.5,10,10s-4.5,10-10,10s-10-4.5-10-10C28.6,66.886,33.1,62.485,38.6,62.485z';
    // Paw print
    const pawPath = 'M375.786,368.016c-1.022,62.699-34.434,85.385-69.898,83.283c-35.465-2.093-60.132-18.537-85.32-18.537l-1.032,0.576c-25.188,0-49.854,17.021-85.319,19.114c-35.466,2.093-68.876-19.449-69.898-82.148c2.056-57.565,45.911-61.798,83.265-129.8c32.891-59.881,71.954-55.035,71.954-55.035h1.03c0,0,39.4-4.586,71.955,55.035C329.698,308.599,373.73,310.449,375.786,368.016z M156.203,159.636c31.413-2.382,54.172-40.021,50.832-84.071c-3.34-44.049-31.514-77.828-62.927-75.446C112.695,2.501,89.936,40.141,93.276,84.19C96.616,128.239,124.789,162.018,156.203,159.636z M275.264,160.401c30.698,8.368,65.097-19.742,76.83-62.786c11.732-43.044-3.642-84.722-34.339-93.09c-30.698-8.368-65.097,19.742-76.829,62.786C229.193,110.354,244.566,152.033,275.264,160.401z M417.486,125.937c-26.732-7.288-56.688,17.19-66.905,54.674c-10.217,37.484,3.171,73.777,29.903,81.064c26.733,7.287,56.688-17.191,66.906-54.675C457.608,169.518,444.22,133.224,417.486,125.937z M102.008,180.608c-10.218-37.482-40.172-61.961-66.905-54.674s-40.122,43.581-29.904,81.064c10.218,37.482,40.173,61.961,66.906,54.674C98.837,254.386,112.225,218.092,102.008,180.608z';
    // Ghost style (replacing emo)
    const emoPath = 'M29.8,27.4l-3.6-4.8C24.1,19.9,23,16.4,23,13c0-5.5-4.5-10-10-10S3,7.5,3,13v6.1c0,5.4,4.4,9.9,9.9,9.9H29c0.4,0,0.7-0.2,0.9-0.6C30.1,28.1,30,27.7,29.8,27.4z M12,9c0-0.6,0.4-1,1-1s1,0.4,1,1v2c0,0.6-0.4,1-1,1s-1-0.4-1-1V9z M8,9c0-0.6,0.4-1,1-1s1,0.4,1,1v2c0,0.6-0.4,1-1,1s-1-0.4-1-1V9z M15,20c0,0.6-0.4,1-1,1H8c-0.6,0-1-0.4-1-1v-3c0-2.2,1.8-4,4-4s4,1.8,4,4V20z';
    // Gold ingot style
    const goldIngotPath = 'M238.896,389.648 L0,389.648 L31.424,277.041 L207.472,277.041 z M512,389.648 L273.104,389.648 L304.528,277.041 L480.576,277.041 z M375.448,234.96 L136.552,234.96 L167.976,122.352 L344.024,122.352 z M31.424,277.041 L109.56,277.041 L9.664,355.024 z M167.984,122.352 L246.112,122.352 L146.216,200.336 z M304.528,277.041 L382.664,277.041 L282.768,355.024 z';
    // Pink G-Wagen style (Jeep Cherokee)
    const pinkGwagenPath = 'm61.21 175.94c0 9.01-7.3 16.31-16.31 16.31h-7.59c-9.01 0-16.31-7.3-16.31-16.31v-16.22h40.21c0 0 0 16.22 0 16.22zm117.65 0c0 9.01-7.31 16.31-16.32 16.31h-7.58c-9.01 0-16.32-7.3-16.32-16.31v-16.22h40.22c0 0 0 16.22 0 16.22zm13.39-25.45c0 3.4-2.76 6.15-6.15 6.15h-172.2c-3.39 0-6.15-2.75-6.15-6.15v-15.93c0-3.39 2.75-6.15 6.15-6.15h172.2c3.39 0 6.15 2.75 6.15 6.15zm-172.2-9.79v3.64h159.9v-3.64zm14.2-127.09c0.15-3.28 2.86-5.87 6.14-5.87h119.21c3.28 0 5.99 2.59 6.14 5.87l1.39 29.31h18.96c3.4 0 6.15 2.76 6.15 6.15v20.63c0 3.4-2.75 6.15-6.15 6.15h-17.41l0.16 3.55c3.27 1.15 6.28 3.02 8.77 5.51 4.36 4.36 6.81 10.27 6.81 16.43v23.98h-168.85v-23.98c0-6.16 2.45-12.07 6.8-16.43 2.5-2.49 5.51-4.36 8.77-5.51l0.17-3.55h-17.42c-3.39 0-6.15-2.75-6.15-6.15v-20.63c0-3.39 2.76-6.15 6.15-6.15h18.97zm14.42 78.35c-7.31 0-13.25 5.93-13.25 13.24 0 7.32 5.94 13.25 13.25 13.25 7.31 0 13.25-5.93 13.25-13.25 0-7.31-5.94-13.24-13.25-13.24zm102.66 0c-7.32 0-13.25 5.93-13.25 13.24 0 7.32 5.93 13.25 13.25 13.25 7.31 0 13.24-5.93 13.24-13.25 0-7.31-5.93-13.24-13.24-13.24zm-80.66 6.82v13.24c0 3.4 2.75 6.15 6.15 6.15 3.39 0 6.15-2.75 6.15-6.15v-13.24c0-3.4-2.76-6.15-6.15-6.15-3.4 0-6.15 2.75-6.15 6.15zm16.55 0v13.24c0 3.4 2.76 6.15 6.15 6.15 3.4 0 6.15-2.75 6.15-6.15v-13.24c0-3.4-2.75-6.15-6.15-6.15-3.39 0-6.15 2.75-6.15 6.15zm33.12 0v13.24c0 3.4 2.76 6.15 6.15 6.15 3.4 0 6.15-2.75 6.15-6.15v-13.24c0-3.4-2.75-6.15-6.15-6.15-3.39 0-6.15 2.75-6.15 6.15zm-16.56 0v13.24c0 3.4 2.76 6.15 6.15 6.15 3.4 0 6.15-2.75 6.15-6.15v-13.24c0-3.4-2.76-6.15-6.15-6.15-3.4 0-6.15 2.75-6.15 6.15zm-58.91-49.42v0.01l-0.97 20.63v0.02l-0.38 8.09h112.95l-2.73-58.06h-107.48c0 0-1.38 29.31-1.39 29.31z';

    for (let i = 0; i < totalDays; i++) {
      const isPast = i < currentDayIndex;
      const isCurrent = i === currentDayIndex;

      let shape;
      if (ringStyle === 2) {
        // Heart style: ❤️ (past), ❤️‍🩹 (current), 💔 (future)
        const svgWidth = renderSize;
        const svgHeight = renderSize;

        if (isPast) {
          // Past heart
          shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 24 24" x="${x}" y="${y}"><path d="${heartPath}" fill="${pastColor}"/></svg>`;
        } else if (isCurrent) {
          // Current healing heart
          shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 24 24" x="${x}" y="${y}"><path d="${heartPath}" fill="${currentColor}"/></svg>`;
        } else {
          // Future broken heart
          shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 24 24" x="${x}" y="${y}"><path d="${brokenHeartPath}" fill="${futureColor}"/></svg>`;
        }
      } else if (ringStyle === 3) {
        // Poop emoji style
        const svgWidth = renderSize;
        const svgHeight = renderSize;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 512 512" x="${x}" y="${y}"><path d="${poopPath}" fill="${iconColor}"/></svg>`;
      } else if (ringStyle === 4) {
        // Piggy bank style
        const svgWidth = renderSize;
        const svgHeight = renderSize;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 32 32" x="${x}" y="${y}"><path d="${piggyPath}" fill="${iconColor}"/></svg>`;
      } else if (ringStyle === 5) {
        // Money bag style
        const svgWidth = renderSize;
        const svgHeight = renderSize;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 511.722 511.722" x="${x}" y="${y}"><path d="${moneyPath}" fill="${iconColor}"/></svg>`;
      } else if (ringStyle === 6) {
        // Dachshund style - make it bigger by reducing gaps
        const svgWidth = renderSize * 1.3; // 30% larger
        const svgHeight = renderSize * 1.3;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        const offsetX = (baseSize - svgWidth) / 2; // Center the larger icon
        const offsetY = (baseSize - svgHeight) / 2;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 482.877 482.877" x="${x + offsetX}" y="${y + offsetY}"><path d="${dachshundPath}" fill="${iconColor}"/></svg>`;
      } else if (ringStyle === 7) {
        // Cat face style
        const svgWidth = renderSize;
        const svgHeight = renderSize;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 121.6 121.6" x="${x}" y="${y}"><path d="${catPath}" fill="${iconColor}"/></svg>`;
      } else if (ringStyle === 8) {
        // Paw print style
        const svgWidth = renderSize;
        const svgHeight = renderSize;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 452.589 452.59" x="${x}" y="${y}"><path d="${pawPath}" fill="${iconColor}"/></svg>`;
      } else if (ringStyle === 9) {
        // Ghost style
        const svgWidth = renderSize;
        const svgHeight = renderSize;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 32 32" x="${x}" y="${y}"><path d="${emoPath}" fill="${iconColor}"/></svg>`;
      } else if (ringStyle === 10) {
        // Gold ingot style - 2.1x larger
        const svgWidth = renderSize * 2.1;
        const svgHeight = renderSize * 2.1;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        const offsetX = (baseSize - svgWidth) / 2;
        const offsetY = (baseSize - svgHeight) / 2;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 512 512" x="${x + offsetX}" y="${y + offsetY}"><path d="${goldIngotPath}" fill="${iconColor}"/></svg>`;
      } else if (ringStyle === 11) {
        // Pink G-Wagen style
        const svgWidth = renderSize * 1.5;
        const svgHeight = renderSize * 1.5;
        const iconColor = isPast ? pastColor : isCurrent ? currentColor : futureColor;
        const offsetX = (baseSize - svgWidth) / 2;
        const offsetY = (baseSize - svgHeight) / 2;
        shape = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 200 200" x="${x + offsetX}" y="${y + offsetY}"><path d="${pinkGwagenPath}" fill="${iconColor}"/></svg>`;
      } else if (isPast) {
        if (ringStyle === 0) {
          // Ring style: bg color circle with past color outline (ring effect)
          const r = renderSize / 2;
          const strokeWidth = renderSize * 0.15;
          const innerR = r - strokeWidth / 2;
          shape = `<circle cx="${x + r}" cy="${y + r}" r="${innerR}" fill="${bgColor}" stroke="${pastColor}" stroke-width="${strokeWidth}"/>`;
        } else {
          // Default style (ringStyle = 1): filled past color circles
          shape = `<circle cx="${x + renderSize / 2}" cy="${y + renderSize / 2}" r="${renderSize / 2}" fill="${pastColor}"/>`;
        }
      } else if (isCurrent) {
        shape = `<circle cx="${x + renderSize / 2}" cy="${y + renderSize / 2}" r="${renderSize / 2}" fill="${currentColor}"/>`;
      } else {
        shape = `<circle cx="${x + renderSize / 2}" cy="${y + renderSize / 2}" r="${renderSize / 2}" fill="${futureColor}"/>`;
      }

      svg += shape;

      x += baseSize + gapHorizontal;

      // Check if we need to move to next row
      if ((i + 1) % circlesPerRow === 0 && i < totalDays - 1) {
        x = 0;
        y += baseSize + gapVertical;
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

  // Convert PNG to base64 for HTML embedding
  const pngBase64 = pngBuffer.toString('base64');
  const imageUrl = `data:image/png;base64,${pngBase64}`;

  // Return HTML page with centered image if html=true
  if (html) {
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Until Wall - Life Calendar</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: #1a1a1a;
          }
          img {
            max-width: 100vw;
            max-height: 100vh;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <img src="${imageUrl}" alt="Life Calendar" />
      </body>
      </html>
    `;
    return new Response(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  // Return PNG
  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="untilwall.png"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Robots-Tag': 'noindex, nofollow, nosnippet',
      'X-Content-Type-Options': 'nosniff',
      ...responseHeaders,
    },
  });
}
