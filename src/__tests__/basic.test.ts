import { describe, it, expect } from '@jest/globals';

describe('Basic Health Checks', () => {
  const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

  it('should load homepage', async () => {
    const response = await fetch(BASE_URL);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('should generate PNG image', async () => {
    const params = new URLSearchParams({
      start_date: '1990-01-01',
      end_date: '2070-01-01',
      width: '1290',
      height: '2796',
      ring_style: '1',
      show_text: '1'
    });

    const response = await fetch(`${BASE_URL}/goal?${params}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');

    // Verify it's actually a PNG (check magic bytes)
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer.slice(0, 8));
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

    expect(Array.from(bytes)).toEqual(pngSignature);
  }, 15000);

  it('should handle all ring styles', async () => {
    const styles = ['0', '1', '2']; // Ring, Solid, Hearts

    for (const style of styles) {
      const params = new URLSearchParams({
        start_date: '1990-01-01',
        end_date: '2070-01-01',
        width: '1290',
        height: '2796',
        ring_style: style,
        show_text: '1'
      });

      const response = await fetch(`${BASE_URL}/goal?${params}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
    }
  }, 30000);
});
