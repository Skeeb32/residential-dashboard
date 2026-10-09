import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { getSampleMarketStatistics } from '@/lib/market-data';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (!(await getSessionUserId())) {
    return NextResponse.json(
      { message: 'Sign in to view market metrics.' },
      { status: 401 },
    );
  }

  const zipCode = request.nextUrl.searchParams.get('zipCode') ?? '';
  if (!/^\d{5}$/.test(zipCode)) {
    return NextResponse.json(
      {
        message: 'A valid five-digit ZIP code is required for market metrics.',
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.RENTCAST_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      source: 'Sample data',
      live: false,
      data: getSampleMarketStatistics(zipCode),
    });
  }

  const providerUrl = new URL('https://api.rentcast.io/v1/markets');
  providerUrl.searchParams.set('zipCode', zipCode);
  providerUrl.searchParams.set('dataType', 'All');
  providerUrl.searchParams.set('historyRange', '12');

  try {
    const response = await fetch(providerUrl, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            response.status === 401 || response.status === 403
              ? 'RentCast rejected the API key. Check RENTCAST_API_KEY and its subscription.'
              : response.status === 429
                ? 'The provider rate limit was reached. Wait a moment and retry.'
                : 'Market statistics are not available for this ZIP code.',
        },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    return NextResponse.json({
      source: 'RentCast',
      live: true,
      data: await response.json(),
    });
  } catch {
    return NextResponse.json(
      { message: 'Could not reach RentCast market statistics. Please retry.' },
      { status: 502 },
    );
  }
}
