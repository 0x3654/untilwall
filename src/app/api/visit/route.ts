import { NextRequest, NextResponse } from 'next/server';
import { trackVisitor } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Get visitor ID from request body (client-side generated)
  const body = await request.json().catch(() => ({}));
  const visitorId = body.visitorId || request.cookies.get('visitor_id')?.value || crypto.randomUUID();

  // Track visitor
  trackVisitor(visitorId);

  return NextResponse.json({ success: true, visitorId });
}
