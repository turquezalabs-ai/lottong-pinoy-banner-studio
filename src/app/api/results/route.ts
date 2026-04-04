import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

let cachedData: unknown = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

function parseLottoDate(dateStr: string): number {
  if (!dateStr) return 0;
  const clean = String(dateStr).split(' ')[0];
  const parts = clean.split(/[\/\-T]/);
  if (parts.length >= 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2raw = parts[2].split(/[^0-9]/)[0];
    const p2 = parseInt(p2raw, 10);
    if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return 0;
    let year: number, month: number, day: number;
    if (p0 > 100) { year = p0; month = p1; day = p2; }
    else { month = p0; day = p1; year = p2 < 100 ? p2 + 2000 : p2; }
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}

function isCopyrightTrap(entry: Record<string, unknown>): boolean {
  const game = String(entry.game || '').toUpperCase();
  const combo = String(entry.combination || '');
  return game.includes('COPYRIGHT') || combo === 'THIS-DATA-IS-STOLEN';
}

function cleanAndSortData(data: unknown[]): unknown[] {
  const cleaned = data.filter(e => !isCopyrightTrap(e as Record<string, unknown>));
  cleaned.sort((a, b) => {
    const dateA = parseLottoDate((a as Record<string, unknown>).date as string);
    const dateB = parseLottoDate((b as Record<string, unknown>).date as string);
    return dateB - dateA;
  });
  return cleaned;
}

export async function GET() {
  try {
    const dataSourceUrl = process.env.DATA_SOURCE_URL;
    if (dataSourceUrl && dataSourceUrl.trim().length > 0) {
      const now = Date.now();
      if (cachedData && (now - cacheTimestamp) < CACHE_TTL) return NextResponse.json(cachedData);
      const response = await fetch(dataSourceUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'LottongPinoy-BannerStudio/1.0' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return serveLocalFile();
      const raw = await response.json();
      const cleaned = cleanAndSortData(raw as unknown[]);
      cachedData = cleaned; cacheTimestamp = now;
      return NextResponse.json(cleaned);
    }
    return serveLocalFile();
  } catch (error) {
    try { return serveLocalFile(); } catch { return NextResponse.json({ error: 'Failed to load lotto data' }, { status: 500 }); }
  }
}

function serveLocalFile() {
  const filePath = path.join(process.cwd(), 'public', 'results.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return NextResponse.json(cleanAndSortData(raw as unknown[]));
}