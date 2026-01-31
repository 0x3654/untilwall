import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Простая лимитировка в памяти (сбрасывается при перезапуске)
const rateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 60; // запросов в минуту с одного IP
const WINDOW_MS = 60 * 1000; // 1 минута

// Паттерны плохих ботов (блокируем)
const BAD_BOTS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python/i,
  /java/i,
  /go-http-client/i,
  /node/i,
  /axios/i,
  /httpie/i,
  /lwp/i,
  /perl/i,
  /ruby/i,
  /php/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /metasploit/i,
  /.*scanner.*/i,
  /.*harvest.*/i,
  /.*extract.*/i,
];

// Хорошие боты (разрешаем)
const GOOD_BOTS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i, // Yahoo
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /applebot/i,
];

export function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown';

  const userAgent = request.headers.get('user-agent') || '';

  // Сначала проверяем хорошие боты (разрешаем)
  const isGoodBot = GOOD_BOTS.some(pattern => pattern.test(userAgent));
  if (isGoodBot) {
    return NextResponse.next();
  }

  // Проверяем плохие боты
  const isBadBot = BAD_BOTS.some(pattern => pattern.test(userAgent));
  if (isBadBot) {
    console.log(`Заблокирован бот: ${userAgent} с ${ip}`);
    return new Response('Bot access denied', { status: 403 });
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
