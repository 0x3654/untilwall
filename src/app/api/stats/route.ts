import { NextResponse } from 'next/server';
import { getStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = getStats();

  return NextResponse.json({
    totalRequests: stats.totalRequests,
    imageGenerations: stats.imageGenerations,
    uniqueVisitors: stats.uniqueVisitors.length,
    devices: stats.devices,
    lastUpdated: stats.lastUpdated,
  });
}
