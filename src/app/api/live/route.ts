import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import { trackImageGeneration } from '@/lib/stats';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { createHash, randomUUID } from 'crypto';
import archiver from 'archiver';

const execAsync = promisify(exec);

// Cache directory for live photos
const CACHE_DIR = '/app/data/cache';
const CACHE_MAX_FILES = 100; // Maximum number of cached files

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pulse animation parameters
const PULSE_FRAMES = 15; // 0.5 second at 30fps (faster generation)
const FPS = 30;
const MIN_SCALE = 1.0;
const MAX_SCALE = 1.5; // Increased to make pulse more visible

// Generate cache key from request parameters
function generateCacheKey(params: Record<string, any>): string {
  const sortedKeys = Object.keys(params).sort();
  const keyString = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  return createHash('md5').update(keyString).digest('hex');
}

// Get cached live photo if available
async function getCachedLivePhoto(cacheKey: string): Promise<LivePhotoResponse | null> {
  try {
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    const cached = await fs.readFile(cacheFile, 'utf-8');
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

// Save live photo to cache
async function saveCachedLivePhoto(cacheKey: string, data: LivePhotoResponse): Promise<void> {
  try {
    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });

    // Clean old cache files if needed
    await cleanupOldCache();

    // Save to cache
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    await fs.writeFile(cacheFile, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save cache:', error);
  }
}

// Clean old cache files if limit exceeded
async function cleanupOldCache(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    if (files.length <= CACHE_MAX_FILES) return;

    // Get file stats with mtime
    const fileStats = await Promise.all(
      files.map(async (file: string) => {
        const filePath = path.join(CACHE_DIR, file);
        const stats = await fs.stat(filePath);
        return { file, mtime: stats.mtimeMs };
      })
    );

    // Sort by mtime (oldest first)
    fileStats.sort((a: { mtime: number }, b: { mtime: number }) => a.mtime - b.mtime);

    // Delete oldest files
    const toDelete = fileStats.slice(0, files.length - CACHE_MAX_FILES);
    await Promise.all(
      toDelete.map(({ file }: { file: string }) => fs.unlink(path.join(CACHE_DIR, file)))
    );
  } catch (error) {
    console.error('Failed to cleanup cache:', error);
  }
}

// Generate scale value for frame using sine wave
function getPulseScale(frame: number): number {
  const progress = (frame / PULSE_FRAMES) * Math.PI * 2; // Full sine wave cycle
  const scale = MIN_SCALE + (Math.sin(progress - Math.PI / 2) + 1) / 2 * (MAX_SCALE - MIN_SCALE);
  return scale;
}

// Write Live Photo metadata to image using exiftool
async function writeLivePhotoMetadata(imagePath: string, assetId: string): Promise<void> {
  try {
    const cmd = `exiftool -overwrite_original -QuickTime:ContentIdentifier="${assetId}" -XMP:ContentIdentifier="${assetId}" "${imagePath}"`;
    await execAsync(cmd);
  } catch (error) {
    console.error('Failed to write Live Photo metadata:', error);
    throw error;
  }
}

interface LivePhotoResponse {
  png: string; // base64
  mp4: string; // base64
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Check format parameter (json, png, or mp4)
  const format = searchParams.get('format') || 'json';

  // Track image generation
  const userAgent = request.headers.get('user-agent') || '';
  trackImageGeneration(userAgent);

  // Get parameters (same as /goal endpoint)
  const startDate = searchParams.get('start_date') || '2000-01-01';
  const endDate = searchParams.get('end_date') || '2080-01-01';
  const hasWidgets = searchParams.get('has_widgets') === 'true';
  const width = parseInt(searchParams.get('width') || '1290');
  const height = parseInt(searchParams.get('height') || '2796');
  const offsetTop = parseFloat(searchParams.get('offset_top') || '0');
  const offsetBottom = parseFloat(searchParams.get('offset_bottom') || '0');
  const offsetLeft = parseFloat(searchParams.get('offset_left') || '0');
  const offsetRight = parseFloat(searchParams.get('offset_right') || '0');
  const goalTextTopOffset = parseFloat(searchParams.get('goal_text_top_offset') || '0');
  const ringStyle = parseInt(searchParams.get('ring_style') || '101');
  const dotScale = parseFloat(searchParams.get('dot_scale') || '1.0');
  const goalText = searchParams.get('goal_text') || '';

  // Color customization
  const bgColor = searchParams.get('bg_color') || '#1a1a1a';
  const pastColor = searchParams.get('past_color') || '#ffffff';
  const currentColor = searchParams.get('current_color') || '#ff6b35';
  const futureColor = searchParams.get('future_color') || '#2a2a2a';

  // Check cache (only for JSON format)
  const params = {
    format,
    start_date: startDate,
    end_date: endDate,
    has_widgets: hasWidgets,
    width,
    height,
    offset_top: offsetTop,
    offset_bottom: offsetBottom,
    offset_left: offsetLeft,
    offset_right: offsetRight,
    goal_text_top_offset: goalTextTopOffset,
    ring_style: ringStyle,
    dot_scale: dotScale,
    goal_text: goalText,
    bg_color: bgColor,
    past_color: pastColor,
    current_color: currentColor,
    future_color: futureColor,
  };
  const cacheKey = generateCacheKey(params);

  // Check cache for different formats
  if (format === 'json') {
    const cached = await getCachedLivePhoto(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        },
      });
    }
  } else if (format === 'live') {
    // Check for cached ZIP
    try {
      const cachedZip = await fs.readFile(path.join(CACHE_DIR, `${cacheKey}.zip`));
      return new Response(new Uint8Array(cachedZip), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="untilwall-live.zip"',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        },
      });
    } catch {
      // Cache miss, continue to generation
    }
  }

  // Calculate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const currentDayIndex = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) - 1;
  const currentDayIndexClamped = Math.max(0, Math.min(currentDayIndex, totalDays - 1));
  const elapsedDays = Math.max(0, currentDayIndex + 1);

  // Create temp directory for frames
  const tempDir = path.join(os.tmpdir(), `livephoto-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Generate video frames with pulse animation
    const framesDir = path.join(tempDir, 'frames');
    await fs.mkdir(framesDir, { recursive: true });

    // Prepare base parameters for /goal endpoint
    const baseParams = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      has_widgets: hasWidgets.toString(),
      ring_style: ringStyle.toString(),
      elapsed_mode: searchParams.get('elapsed_mode') || 'false',
      show_text: searchParams.get('show_text') || '1',
      goal_text: goalText,
      goal_color: searchParams.get('goal_color') || currentColor,
      goal_text_top_offset: goalTextTopOffset.toString(),
      width: width.toString(),
      height: height.toString(),
      offset_top: offsetTop.toString(),
      offset_bottom: offsetBottom.toString(),
      offset_left: offsetLeft.toString(),
      offset_right: offsetRight.toString(),
      dot_scale: dotScale.toString(),
      bg_color: bgColor,
      past_color: pastColor,
      current_color: currentColor,
      future_color: futureColor,
      format: 'svg',
    });

    for (let frame = 0; frame < PULSE_FRAMES; frame++) {
      const pulseScale = getPulseScale(frame);

      // Fetch base SVG from /goal endpoint
      const baseUrl = 'http://localhost:3000'; // Internal call
      const svgUrl = `${baseUrl}/goal?${baseParams.toString()}`;
      const svgResponse = await fetch(svgUrl);

      if (!svgResponse.ok) {
        throw new Error(`Failed to fetch SVG: ${svgResponse.statusText}`);
      }

      let svg = await svgResponse.text();

      // Apply pulse scale to current day circle by modifying its radius
      // Current day is marked with currentColor, not with class
      // Need to escape the color value for regex
      const escapedColor = currentColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Find the current day circle (has fill with currentColor)
      // NOTE: fill attribute comes AFTER r in the SVG
      const currentCirclePattern = new RegExp(`<circle[^>]*r="([^"]+)"[^>]*fill="${escapedColor}"`, 'g');
      const currentCircleMatch = svg.match(currentCirclePattern);

      if (currentCircleMatch) {
        const circleTag = currentCircleMatch[0];
        const rMatch = circleTag.match(/r="([^"]+)"/);

        if (rMatch) {
          const originalRadius = parseFloat(rMatch[1]);
          const newRadius = originalRadius * pulseScale;

          // Replace the radius in the current circle
          const radiusReplacePattern = new RegExp(
            `(<circle[^>]*r=")[^"]+("([^>]*)fill="${escapedColor}")`,
            'g'
          );
          svg = svg.replace(radiusReplacePattern, `$1${newRadius}$2`);
        }
      }

      // Convert SVG to PNG (use 72 DPI for video frames - much faster)
      const pngBuffer = await sharp(Buffer.from(svg), { density: 72 })
        .png()
        .toBuffer();

      // Save frame
      const framePath = path.join(framesDir, `frame_${String(frame).padStart(3, '0')}.png`);
      await fs.writeFile(framePath, pngBuffer);
    }

    // Generate MP4 using ffmpeg with scale filter to ensure even dimensions
    const outputMp4Path = path.join(tempDir, 'output.mp4');
    // Use scale filter with explicit even dimensions
    const evenWidth = width % 2 === 0 ? width : width - 1;
    const evenHeight = height % 2 === 0 ? height : height - 1;
    // Use ultrafast preset for maximum speed, disable audio logging
    const ffmpegCmd = `ffmpeg -hide_banner -loglevel error -framerate ${FPS} -i ${framesDir}/frame_%03d.png -vf "scale=${evenWidth}:${evenHeight}:flags=bicubic" -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -movflags +faststart -threads 0 ${outputMp4Path}`;

    await execAsync(ffmpegCmd);

    // Generate unique asset identifier for Live Photo
    const assetIdentifier = randomUUID();

    // Write Live Photo metadata to both files
    await writeLivePhotoMetadata(outputMp4Path, assetIdentifier);

    // Read the generated MP4
    const mp4Buffer = await fs.readFile(outputMp4Path);

    // Generate static PNG (first frame without pulse)
    const baseUrl = 'http://localhost:3000';
    const staticSvgUrl = `${baseUrl}/goal?${baseParams.toString()}`;
    const staticSvgResponse = await fetch(staticSvgUrl);

    if (!staticSvgResponse.ok) {
      throw new Error(`Failed to fetch static SVG: ${staticSvgResponse.statusText}`);
    }

    const staticSvg = await staticSvgResponse.text();

    const pngBuffer = await sharp(Buffer.from(staticSvg), { density: 72 })
      .png()
      .toBuffer();

    // Convert PNG to JPEG for Live Photo compatibility
    const jpegPath = path.join(tempDir, 'output.jpg');
    await sharp(Buffer.from(staticSvg), { density: 72 })
      .jpeg({ quality: 95 })
      .toFile(jpegPath);

    // Write Live Photo metadata to JPEG
    await writeLivePhotoMetadata(jpegPath, assetIdentifier);

    // Read JPEG for response
    const jpegBuffer = await fs.readFile(jpegPath);

    // Return based on format parameter
    if (format === 'png') {
      // Return JPEG file (not PNG) for Live Photo compatibility
      return new Response(new Uint8Array(jpegBuffer), {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': 'attachment; filename="untilwall.jpg"',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'MISS',
        },
      });
    }

    if (format === 'mp4') {
      // Return MP4 file directly
      return new Response(new Uint8Array(mp4Buffer), {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': 'attachment; filename="untilwall.mp4"',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'MISS',
        },
      });
    }

    if (format === 'live') {
      // Return ZIP archive with both JPEG and MOV for true Live Photo
      const zipPath = path.join(tempDir, 'untilwall-live.zip');
      const output = fsSync.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        archive.on('error', (err: Error) => reject(err));
        archive.pipe(output);
        archive.file(jpegPath, { name: 'untilwall.jpg' });
        archive.file(outputMp4Path, { name: 'untilwall.mp4' });
        archive.finalize();
      });

      const zipBuffer = await fs.readFile(zipPath);

      // Save ZIP to cache for future requests
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await cleanupOldCache();
      await fs.writeFile(path.join(CACHE_DIR, `${cacheKey}.zip`), zipBuffer);

      return new Response(new Uint8Array(zipBuffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="untilwall-live.zip"',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'MISS',
        },
      });
    }

    // JSON format - save to cache and return both as base64
    const response: LivePhotoResponse = {
      png: `data:image/png;base64,${pngBuffer.toString('base64')}`,
      mp4: `data:video/mp4;base64,${mp4Buffer.toString('base64')}`,
    };

    // Save to cache
    await saveCachedLivePhoto(cacheKey, response);

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'X-Cache': 'MISS',
      },
    });
  } finally {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
