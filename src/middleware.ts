import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Простая лимитировка в памяти (сбрасывается при перезапуске)
const rateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 60; // запросов в минуту с одного IP
const WINDOW_MS = 60 * 1000; // 1 минута

// Блокируем только явные инструменты атак
const ATTACK_TOOLS = [
  /^nikto\//i,
  /^sqlmap/i,
  /^nmap/i,
  /^metasploit/i,
  /.*scanner.*/i,
  /.*harvest.*/i,
  /.*extract.*/i,
  /^masscan/i,
  /^zmap/i,
  /^openvas/i,
  /^ Nessus/i,
  /^gobuster/i,
  /^dirb/i,
  /^dirbuster/i,
  /^wfuzz/i,
  /^hydra/i,
  /^medusa/i,
  /^john/i,
  /^hashcat/i,
];

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown';

  const userAgent = request.headers.get('user-agent') || '';

  // Блокируем только инструменты атак
  const isAttackTool = ATTACK_TOOLS.some(pattern => pattern.test(userAgent));
  if (isAttackTool) {
    console.log(`Заблокирован атакующий инструмент: ${userAgent} с ${ip}`);
    return new Response('Access denied', { status: 403 });
  }

  // Лимитирование запросов
  const now = Date.now();
  const record = rateLimit.get(ip);

  if (!record || now > record.resetTime) {
    // Первый запрос или окно истекло
    rateLimit.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return NextResponse.next();
  }

  if (record.count >= RATE_LIMIT) {
    console.log(`Превышен лимит: ${ip} (${record.count} запросов)`);
    return new Response('Too many requests', { status: 429 });
  }

  record.count++;
  return NextResponse.next();
}

// Очистка старых записей
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimit.entries()) {
    if (now > record.resetTime) {
      rateLimit.delete(ip);
    }
  }
}, 60000); // Каждую минуту

export const config = {
  matcher: [
    '/((?!api/health|_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
};
