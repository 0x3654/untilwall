import fs from 'fs';
import path from 'path';

const STATS_FILE = path.join(process.cwd(), 'data', 'stats.json');

interface Stats {
  totalRequests: number;
  imageGenerations: number;
  uniqueVisitors: string[];
  devices: Record<string, number>;
  lastUpdated: string;
}

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load stats from file
function loadStats(): Stats {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }

  // Return default stats
  return {
    totalRequests: 0,
    imageGenerations: 0,
    uniqueVisitors: [],
    devices: {},
    lastUpdated: new Date().toISOString(),
  };
}

// Save stats to file
function saveStats(stats: Stats) {
  try {
    stats.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Error saving stats:', error);
  }
}

// Track a visitor
export function trackVisitor(ip: string) {
  const stats = loadStats();

  if (!stats.uniqueVisitors.includes(ip)) {
    stats.uniqueVisitors.push(ip);
  }

  stats.totalRequests++;
  saveStats(stats);
}

// Track image generation
export function trackImageGeneration(userAgent: string) {
  const stats = loadStats();
  stats.imageGenerations++;

  // Detect device from user agent
  let device = 'other';
  if (/iPhone/.test(userAgent)) device = 'iPhone';
  else if (/iPad/.test(userAgent)) device = 'iPad';
  else if (/Macintosh/.test(userAgent)) device = 'Mac';
  else if (/Android/.test(userAgent)) device = 'Android';
  else if (/Windows/.test(userAgent)) device = 'Windows';

  stats.devices[device] = (stats.devices[device] || 0) + 1;

  saveStats(stats);
}

// Get stats
export function getStats(): Stats {
  return loadStats();
}
