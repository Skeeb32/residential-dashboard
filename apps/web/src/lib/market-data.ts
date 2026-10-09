export type ListingKind = 'sale' | 'rental';

export type MarketListing = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  yearBuilt: number | null;
  status: string;
  price: number;
  listedDate: string | null;
  daysOnMarket: number | null;
  hoaFee: number | null;
  mlsName: string | null;
  representativePhoto: string;
  sampleMonthlyRent?: number;
};

export type MarketStatistics = {
  zipCode: string;
  saleData?: {
    lastUpdatedDate?: string;
    averagePrice?: number;
    medianPrice?: number;
    averagePricePerSquareFoot?: number;
    averageDaysOnMarket?: number;
    newListings?: number;
    totalListings?: number;
    history?: Record<string, Record<string, unknown>>;
  };
  rentalData?: {
    lastUpdatedDate?: string;
    averageRent?: number;
    medianRent?: number;
    averageRentPerSquareFoot?: number;
    averageDaysOnMarket?: number;
    newListings?: number;
    totalListings?: number;
    history?: Record<string, Record<string, unknown>>;
  };
};

export const representativePhotos = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=82',
  'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1000&q=82',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=82',
  'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=82',
];

export const sampleListings: MarketListing[] = [
  {
    id: 'demo-austin-01',
    address: '1807 Willow St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78702',
    latitude: 30.2656,
    longitude: -97.7195,
    propertyType: 'Single Family',
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: 1640,
    yearBuilt: 2018,
    status: 'Active',
    price: 548000,
    listedDate: '2026-09-12T00:00:00.000Z',
    daysOnMarket: 26,
    hoaFee: null,
    mlsName: null,
    representativePhoto: representativePhotos[0],
    sampleMonthlyRent: 3300,
  },
  {
    id: 'demo-austin-02',
    address: '504 Tillery St, Unit 8',
    city: 'Austin',
    state: 'TX',
    zipCode: '78702',
    latitude: 30.2567,
    longitude: -97.7068,
    propertyType: 'Townhouse',
    bedrooms: 2,
    bathrooms: 2.5,
    squareFootage: 1320,
    yearBuilt: 2021,
    status: 'Active',
    price: 489000,
    listedDate: '2026-09-28T00:00:00.000Z',
    daysOnMarket: 10,
    hoaFee: 185,
    mlsName: null,
    representativePhoto: representativePhotos[1],
    sampleMonthlyRent: 2950,
  },
  {
    id: 'demo-austin-03',
    address: '2201 South 2nd St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78704',
    latitude: 30.2435,
    longitude: -97.758,
    propertyType: 'Condo',
    bedrooms: 2,
    bathrooms: 2,
    squareFootage: 1185,
    yearBuilt: 2019,
    status: 'Active',
    price: 624000,
    listedDate: '2026-09-19T00:00:00.000Z',
    daysOnMarket: 19,
    hoaFee: 310,
    mlsName: null,
    representativePhoto: representativePhotos[2],
    sampleMonthlyRent: 3650,
  },
  {
    id: 'demo-nyc-01',
    address: '88 Bergen St',
    city: 'Brooklyn',
    state: 'NY',
    zipCode: '11201',
    latitude: 40.6872,
    longitude: -73.9918,
    propertyType: 'Condo',
    bedrooms: 2,
    bathrooms: 2,
    squareFootage: 1080,
    yearBuilt: 2016,
    status: 'Active',
    price: 945000,
    listedDate: '2026-09-22T00:00:00.000Z',
    daysOnMarket: 16,
    hoaFee: 640,
    mlsName: null,
    representativePhoto: representativePhotos[3],
    sampleMonthlyRent: 5200,
  },
  {
    id: 'demo-nyc-02',
    address: '417 West 47th St, Apt 3A',
    city: 'New York',
    state: 'NY',
    zipCode: '10036',
    latitude: 40.7605,
    longitude: -73.9898,
    propertyType: 'Condo',
    bedrooms: 1,
    bathrooms: 1,
    squareFootage: 735,
    yearBuilt: 2008,
    status: 'Active',
    price: 789000,
    listedDate: '2026-10-01T00:00:00.000Z',
    daysOnMarket: 7,
    hoaFee: 525,
    mlsName: null,
    representativePhoto: representativePhotos[0],
    sampleMonthlyRent: 4100,
  },
  {
    id: 'demo-san-antonio-01',
    address: '5500 Grand Lake Dr',
    city: 'San Antonio',
    state: 'TX',
    zipCode: '78244',
    latitude: 29.476,
    longitude: -98.3515,
    propertyType: 'Single Family',
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: 1878,
    yearBuilt: 1973,
    status: 'Active',
    price: 329000,
    listedDate: '2026-09-16T00:00:00.000Z',
    daysOnMarket: 22,
    hoaFee: null,
    mlsName: null,
    representativePhoto: representativePhotos[1],
    sampleMonthlyRent: 2350,
  },
];

export function getSampleMarketStatistics(zipCode: string): MarketStatistics {
  const zipListings = sampleListings.filter(
    (listing) => listing.zipCode === zipCode,
  );
  const salePrices = zipListings.map((listing) => listing.price);
  const averagePrice = salePrices.length
    ? Math.round(
        salePrices.reduce((sum, price) => sum + price, 0) / salePrices.length,
      )
    : 510000;
  const averageRent = zipListings.length
    ? Math.round(
        zipListings.reduce(
          (sum, listing) => sum + (listing.sampleMonthlyRent ?? 0),
          0,
        ) / zipListings.length,
      )
    : 2850;
  const now = new Date();

  return {
    zipCode,
    saleData: {
      lastUpdatedDate: now.toISOString(),
      averagePrice,
      medianPrice: averagePrice,
      averagePricePerSquareFoot: 318,
      averageDaysOnMarket: 21,
      newListings: zipListings.length,
      totalListings: zipListings.length * 8,
      history: {
        '2026-05': { date: '2026-05-01', averagePrice: averagePrice * 0.97 },
        '2026-06': { date: '2026-06-01', averagePrice: averagePrice * 0.98 },
        '2026-07': { date: '2026-07-01', averagePrice: averagePrice * 0.99 },
        '2026-08': { date: '2026-08-01', averagePrice: averagePrice * 0.995 },
        '2026-09': { date: '2026-09-01', averagePrice },
      },
    },
    rentalData: {
      lastUpdatedDate: now.toISOString(),
      averageRent,
      medianRent: averageRent,
      averageRentPerSquareFoot: 2.15,
      averageDaysOnMarket: 18,
      newListings: zipListings.length * 2,
      totalListings: zipListings.length * 14,
      history: {
        '2026-05': { date: '2026-05-01', averageRent: averageRent * 0.97 },
        '2026-06': { date: '2026-06-01', averageRent: averageRent * 0.98 },
        '2026-07': { date: '2026-07-01', averageRent: averageRent * 0.99 },
        '2026-08': { date: '2026-08-01', averageRent: averageRent * 0.995 },
        '2026-09': { date: '2026-09-01', averageRent },
      },
    },
  };
}
