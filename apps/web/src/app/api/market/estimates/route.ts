import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { sampleListings, type MarketListing } from '@/lib/market-data';

export const runtime = 'nodejs';

type ComparisonCandidate = Pick<
  MarketListing,
  | 'id'
  | 'address'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'propertyType'
  | 'bedrooms'
  | 'bathrooms'
  | 'squareFootage'
  | 'price'
>;

function estimateResult(
  listing: ComparisonCandidate,
  rent: number,
  rangeLow: number,
  rangeHigh: number,
  comparableCount: number,
) {
  return {
    listingId: listing.id,
    address: `${listing.address}, ${listing.city}, ${listing.state} ${listing.zipCode}`,
    purchasePrice: listing.price,
    estimatedMonthlyRent: rent,
    rentRangeLow: rangeLow,
    rentRangeHigh: rangeHigh,
    estimatedAnnualGrossRent: rent * 12,
    grossYieldPercentage:
      listing.price > 0 ? (rent * 12 * 100) / listing.price : null,
    comparableCount,
  };
}

export async function POST(request: NextRequest) {
  if (!(await getSessionUserId())) {
    return NextResponse.json(
      { message: 'Sign in to compare property earnings.' },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const candidates = body?.listings;
  if (
    !Array.isArray(candidates) ||
    candidates.length < 1 ||
    candidates.length > 3
  ) {
    return NextResponse.json(
      { message: 'Choose between one and three sale listings to compare.' },
      { status: 400 },
    );
  }

  const listings: ComparisonCandidate[] = [];
  for (const candidate of candidates) {
    const fields = [
      candidate?.id,
      candidate?.address,
      candidate?.city,
      candidate?.state,
      candidate?.zipCode,
      candidate?.propertyType,
    ];
    if (
      fields.some((field) => typeof field !== 'string' || field.length > 240) ||
      typeof candidate?.price !== 'number' ||
      !Number.isFinite(candidate.price) ||
      candidate.price <= 0
    ) {
      return NextResponse.json(
        { message: 'A selected listing is missing valid property data.' },
        { status: 400 },
      );
    }
    listings.push(candidate as ComparisonCandidate);
  }

  const apiKey = process.env.RENTCAST_API_KEY?.trim();
  if (!apiKey) {
    const results = listings.map((listing) => {
      const sample = sampleListings.find((item) => item.id === listing.id);
      if (!sample?.sampleMonthlyRent) return null;
      return estimateResult(
        listing,
        sample.sampleMonthlyRent,
        Math.round(sample.sampleMonthlyRent * 0.95),
        Math.round(sample.sampleMonthlyRent * 1.05),
        5,
      );
    });

    if (results.some((result) => result === null)) {
      return NextResponse.json(
        { message: 'Sample rent estimates are unavailable for this listing.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      source: 'Sample data',
      live: false,
      estimates: results,
    });
  }

  try {
    const estimates = await Promise.all(
      listings.map(async (listing) => {
        const providerUrl = new URL(
          'https://api.rentcast.io/v1/avm/rent/long-term',
        );
        providerUrl.searchParams.set(
          'address',
          `${listing.address}, ${listing.city}, ${listing.state} ${listing.zipCode}`,
        );
        providerUrl.searchParams.set('propertyType', listing.propertyType);
        if (listing.bedrooms !== null) {
          providerUrl.searchParams.set('bedrooms', String(listing.bedrooms));
        }
        if (listing.bathrooms !== null) {
          providerUrl.searchParams.set('bathrooms', String(listing.bathrooms));
        }
        if (listing.squareFootage !== null) {
          providerUrl.searchParams.set(
            'squareFootage',
            String(listing.squareFootage),
          );
        }
        providerUrl.searchParams.set('compCount', '5');

        const response = await fetch(providerUrl, {
          headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
          next: { revalidate: 21600 },
        });
        if (!response.ok) {
          throw new Error(
            response.status === 429
              ? 'RATE_LIMIT'
              : response.status === 401 || response.status === 403
                ? 'API_KEY'
                : 'ESTIMATE',
          );
        }

        const estimate = (await response.json()) as {
          rent?: number;
          rentRangeLow?: number;
          rentRangeHigh?: number;
          comparables?: unknown[];
        };
        if (typeof estimate.rent !== 'number') {
          throw new Error('ESTIMATE');
        }

        return estimateResult(
          listing,
          estimate.rent,
          estimate.rentRangeLow ?? estimate.rent,
          estimate.rentRangeHigh ?? estimate.rent,
          estimate.comparables?.length ?? 0,
        );
      }),
    );

    return NextResponse.json({
      source: 'RentCast',
      live: true,
      estimates,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'ESTIMATE';
    const status = code === 'RATE_LIMIT' ? 429 : code === 'API_KEY' ? 502 : 502;
    const message =
      code === 'RATE_LIMIT'
        ? 'The provider rate limit was reached. Wait a moment and retry.'
        : code === 'API_KEY'
          ? 'RentCast rejected the API key. Check RENTCAST_API_KEY and its subscription.'
          : 'Rent estimates are temporarily unavailable. Please retry.';

    return NextResponse.json({ message }, { status });
  }
}
