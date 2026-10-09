import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import {
  representativePhotos,
  sampleListings,
  type ListingKind,
  type MarketListing,
} from '@/lib/market-data';

export const runtime = 'nodejs';

const propertyTypes = new Set([
  'Single Family',
  'Condo',
  'Townhouse',
  'Manufactured',
  'Multi-Family',
  'Apartment',
  'Land',
]);

function parseLocation(location: string) {
  const value = location.trim();
  if (/^\d{5}$/.test(value)) return { zipCode: value };

  const cityState = value.match(/^(.+),\s*([a-z]{2})$/i);
  if (!cityState) return null;

  return { city: cityState[1].trim(), state: cityState[2].toUpperCase() };
}

function numberParameter(
  value: string | null,
  minimum: number,
  maximum: number,
) {
  if (value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

export async function GET(request: NextRequest) {
  if (!(await getSessionUserId())) {
    return NextResponse.json(
      { message: 'Sign in to search homes.' },
      { status: 401 },
    );
  }

  const parameters = request.nextUrl.searchParams;
  const location = parameters.get('location') ?? '';
  const locationParameters = parseLocation(location);
  const kindValue = parameters.get('kind');

  if (!locationParameters) {
    return NextResponse.json(
      { message: 'Enter a US ZIP code or City, ST.' },
      { status: 400 },
    );
  }

  if (kindValue !== 'sale' && kindValue !== 'rental') {
    return NextResponse.json(
      { message: 'Choose homes for sale or long-term rentals.' },
      { status: 400 },
    );
  }

  const kind: ListingKind = kindValue;
  const requestedType = parameters.get('propertyType');
  if (requestedType && !propertyTypes.has(requestedType)) {
    return NextResponse.json(
      { message: 'Choose a supported property type.' },
      { status: 400 },
    );
  }

  const minPrice = numberParameter(parameters.get('minPrice'), 0, 100_000_000);
  const maxPrice = numberParameter(parameters.get('maxPrice'), 0, 100_000_000);
  const bedrooms = numberParameter(parameters.get('bedrooms'), 0, 20);
  const limit = Math.min(
    Math.max(Number(parameters.get('limit')) || 12, 1),
    24,
  );

  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    return NextResponse.json(
      { message: 'Minimum price must be less than maximum price.' },
      { status: 400 },
    );
  }

  const apiKey = process.env.RENTCAST_API_KEY?.trim();
  if (!apiKey) {
    const listings = sampleListings
      .filter((listing) => {
        if ('zipCode' in locationParameters) {
          return listing.zipCode === locationParameters.zipCode;
        }
        return (
          listing.city.toLowerCase() ===
            locationParameters.city.toLowerCase() &&
          listing.state === locationParameters.state
        );
      })
      .filter((listing) => {
        if (requestedType && listing.propertyType !== requestedType)
          return false;
        if (bedrooms !== null && listing.bedrooms !== bedrooms) return false;
        const price =
          kind === 'rental' ? (listing.sampleMonthlyRent ?? 0) : listing.price;
        if (minPrice !== null && price < minPrice) return false;
        if (maxPrice !== null && price > maxPrice) return false;
        return true;
      })
      .slice(0, limit)
      .map((listing, index) => ({
        ...listing,
        status: kind === 'rental' ? 'Active' : listing.status,
        price:
          kind === 'rental'
            ? (listing.sampleMonthlyRent ?? Math.round(listing.price * 0.006))
            : listing.price,
        sampleMonthlyRent:
          kind === 'sale' ? listing.sampleMonthlyRent : undefined,
        representativePhoto:
          representativePhotos[index % representativePhotos.length],
      }));

    return NextResponse.json({
      source: 'Sample data',
      live: false,
      totalCount: listings.length,
      listings,
    });
  }

  const providerUrl = new URL(
    `https://api.rentcast.io/v1/listings/${kind === 'sale' ? 'sale' : 'rental/long-term'}`,
  );
  for (const [key, value] of Object.entries(locationParameters)) {
    providerUrl.searchParams.set(key, value);
  }
  if (requestedType)
    providerUrl.searchParams.set('propertyType', requestedType);
  if (bedrooms !== null)
    providerUrl.searchParams.set('bedrooms', String(bedrooms));
  if (minPrice !== null || maxPrice !== null) {
    providerUrl.searchParams.set(
      'price',
      `${minPrice === null ? '*' : minPrice}:${maxPrice === null ? '*' : maxPrice}`,
    );
  }
  providerUrl.searchParams.set('status', 'Active');
  providerUrl.searchParams.set('limit', String(limit));
  providerUrl.searchParams.set('includeTotalCount', 'true');

  try {
    const response = await fetch(providerUrl, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502;
      return NextResponse.json(
        {
          message:
            response.status === 401 || response.status === 403
              ? 'RentCast rejected the API key. Check RENTCAST_API_KEY and its subscription.'
              : response.status === 429
                ? 'The provider rate limit was reached. Wait a moment and retry.'
                : 'The housing data provider could not complete this search.',
        },
        { status },
      );
    }

    const providerListings = (await response.json()) as Array<
      Record<string, unknown>
    >;
    const listings: MarketListing[] = providerListings.map((listing, index) => {
      const hoa = listing.hoa as { fee?: number } | undefined;
      return {
        id: String(listing.id ?? `${index}`),
        address: String(listing.addressLine1 ?? listing.formattedAddress ?? ''),
        city: String(listing.city ?? ''),
        state: String(listing.state ?? ''),
        zipCode: String(listing.zipCode ?? ''),
        latitude: Number(listing.latitude ?? 0),
        longitude: Number(listing.longitude ?? 0),
        propertyType: String(listing.propertyType ?? 'Residential'),
        bedrooms:
          typeof listing.bedrooms === 'number' ? listing.bedrooms : null,
        bathrooms:
          typeof listing.bathrooms === 'number' ? listing.bathrooms : null,
        squareFootage:
          typeof listing.squareFootage === 'number'
            ? listing.squareFootage
            : null,
        yearBuilt:
          typeof listing.yearBuilt === 'number' ? listing.yearBuilt : null,
        status: String(listing.status ?? 'Active'),
        price: Number(listing.price ?? 0),
        listedDate:
          typeof listing.listedDate === 'string' ? listing.listedDate : null,
        daysOnMarket:
          typeof listing.daysOnMarket === 'number'
            ? listing.daysOnMarket
            : null,
        hoaFee: typeof hoa?.fee === 'number' ? hoa.fee : null,
        mlsName: typeof listing.mlsName === 'string' ? listing.mlsName : null,
        representativePhoto:
          representativePhotos[index % representativePhotos.length],
      };
    });

    return NextResponse.json({
      source: 'RentCast',
      live: true,
      totalCount:
        Number(response.headers.get('X-Total-Count')) || listings.length,
      listings,
    });
  } catch {
    return NextResponse.json(
      { message: 'Could not reach RentCast. Check your connection and retry.' },
      { status: 502 },
    );
  }
}
