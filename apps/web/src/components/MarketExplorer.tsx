'use client';

import {
  ArrowDownWideNarrow,
  BedDouble,
  Building2,
  ChartNoAxesCombined,
  Check,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type {
  ListingKind,
  MarketListing,
  MarketStatistics,
} from '@/lib/market-data';

const propertyTypes = [
  'Any type',
  'Single Family',
  'Condo',
  'Townhouse',
  'Multi-Family',
  'Apartment',
  'Land',
];

type Estimate = {
  listingId: string;
  address: string;
  purchasePrice: number;
  estimatedMonthlyRent: number;
  rentRangeLow: number;
  rentRangeHigh: number;
  estimatedAnnualGrossRent: number;
  grossYieldPercentage: number | null;
  comparableCount: number;
};

function currency(value: number, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

async function readError(response: Response) {
  const result = await response.json().catch(() => ({}));
  return typeof result.message === 'string'
    ? result.message
    : 'Market data could not be loaded. Please retry.';
}

function getMarketSeries(data: MarketStatistics | null, kind: ListingKind) {
  const history =
    kind === 'sale' ? data?.saleData?.history : data?.rentalData?.history;
  const valueKey = kind === 'sale' ? 'averagePrice' : 'averageRent';

  return Object.entries(history ?? {})
    .map(([period, values]) => ({
      period,
      value: Number(values[valueKey] ?? 0),
    }))
    .filter((point) => point.value > 0)
    .sort((left, right) => left.period.localeCompare(right.period))
    .slice(-12);
}

export default function MarketExplorer() {
  const [location, setLocation] = useState('Austin, TX');
  const [kind, setKind] = useState<ListingKind>('sale');
  const [bedrooms, setBedrooms] = useState('');
  const [propertyType, setPropertyType] = useState('Any type');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [source, setSource] = useState('');
  const [live, setLive] = useState(false);
  const [marketData, setMarketData] = useState<MarketStatistics | null>(null);
  const [marketSource, setMarketSource] = useState('');
  const [marketLive, setMarketLive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimateSource, setEstimateSource] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  function changeKind(nextKind: ListingKind) {
    setKind(nextKind);
    setListings([]);
    setTotalCount(0);
    setMarketData(null);
    setSelectedIds([]);
    setEstimates([]);
    setHasSearched(false);
    setMinPrice('');
    setMaxPrice('');
    setError('');
  }

  async function searchListings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError('');
    setListings([]);
    setMarketData(null);
    setEstimates([]);
    setSelectedIds([]);
    setHasSearched(true);

    const parameters = new URLSearchParams({ location: location.trim(), kind });
    if (bedrooms !== '') parameters.set('bedrooms', bedrooms);
    if (propertyType !== 'Any type')
      parameters.set('propertyType', propertyType);
    if (minPrice) parameters.set('minPrice', minPrice);
    if (maxPrice) parameters.set('maxPrice', maxPrice);

    try {
      const response = await fetch(`/api/market/listings?${parameters}`);
      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const result = (await response.json()) as {
        source: string;
        live: boolean;
        totalCount: number;
        listings: MarketListing[];
      };
      setListings(result.listings);
      setTotalCount(result.totalCount);
      setSource(result.source);
      setLive(result.live);

      const firstZipCode = result.listings[0]?.zipCode;
      if (firstZipCode) {
        setLoadingStats(true);
        try {
          const statsResponse = await fetch(
            `/api/market/statistics?zipCode=${encodeURIComponent(firstZipCode)}`,
          );
          if (statsResponse.ok) {
            const statsResult = (await statsResponse.json()) as {
              source: string;
              live: boolean;
              data: MarketStatistics;
            };
            setMarketData(statsResult.data);
            setMarketSource(statsResult.source);
            setMarketLive(statsResult.live);
          }
        } finally {
          setLoadingStats(false);
        }
      }
    } catch {
      setError(
        'Could not reach the property service. Check your connection and retry.',
      );
    } finally {
      setSearching(false);
    }
  }

  function toggleComparison(listingId: string) {
    setSelectedIds((current) => {
      if (current.includes(listingId)) {
        return current.filter((id) => id !== listingId);
      }
      if (current.length >= 3) return current;
      return [...current, listingId];
    });
    setEstimates([]);
  }

  async function compareEarnings() {
    const selectedListings = listings.filter((listing) =>
      selectedIds.includes(listing.id),
    );
    setComparing(true);
    setError('');

    try {
      const response = await fetch('/api/market/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listings: selectedListings }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const result = (await response.json()) as {
        source: string;
        live: boolean;
        estimates: Estimate[];
      };
      setEstimates(result.estimates);
      setEstimateSource(result.source);
    } catch {
      setError('Rent estimates could not be loaded. Please retry.');
    } finally {
      setComparing(false);
    }
  }

  const saleData = marketData?.saleData;
  const rentalData = marketData?.rentalData;
  const marketSeries = getMarketSeries(marketData, kind);
  const maxSeriesValue = Math.max(
    ...marketSeries.map((point) => point.value),
    1,
  );
  const marketFocus = kind === 'sale' ? saleData : rentalData;
  const grossYieldLeader = estimates.reduce<Estimate | null>(
    (leader, estimate) =>
      estimate.grossYieldPercentage !== null &&
      (!leader ||
        estimate.grossYieldPercentage > (leader.grossYieldPercentage ?? 0))
        ? estimate
        : leader,
    null,
  );

  return (
    <div className="discover-workspace">
      <section className="discover-hero">
        <div className="discover-hero-copy">
          <span className="discover-kicker">
            <MapPin size={13} /> US RESIDENTIAL MARKET
          </span>
          <h2>
            Find a place.
            <br />
            <em>See the potential.</em>
          </h2>
          <p>
            Explore live listings, local market movement, and estimated rental
            returns in one view.
          </p>
        </div>
        <div className="discover-hero-index" aria-hidden="true">
          <span>MARKET</span>
          <strong>
            01<span>/</span>50
          </strong>
          <span>STATES</span>
        </div>
      </section>

      <form className="discover-search-panel" onSubmit={searchListings}>
        <div className="search-panel-heading">
          <div>
            <p className="eyebrow">PROPERTY SEARCH</p>
            <h2>Explore listings</h2>
          </div>
          <span className={`provider-badge ${live ? 'is-live' : 'is-sample'}`}>
            <span />
            {live ? 'LIVE RENTCAST' : 'SAMPLE DATA'}
          </span>
        </div>

        <div className="listing-mode" role="group" aria-label="Listing type">
          <button
            type="button"
            className={kind === 'sale' ? 'is-selected' : ''}
            onClick={() => changeKind('sale')}
          >
            For sale
          </button>
          <button
            type="button"
            className={kind === 'rental' ? 'is-selected' : ''}
            onClick={() => changeKind('rental')}
          >
            For rent
          </button>
        </div>

        <div className="discover-fields">
          <label className="discover-location-field">
            <span>City, state, or ZIP</span>
            <span className="location-input-wrap">
              <MapPin size={17} aria-hidden="true" />
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Austin, TX or 78704"
                required
              />
            </span>
          </label>
          <label>
            <span>Property type</span>
            <select
              value={propertyType}
              onChange={(event) => setPropertyType(event.target.value)}
            >
              {propertyTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Bedrooms</span>
            <select
              value={bedrooms}
              onChange={(event) => setBedrooms(event.target.value)}
            >
              <option value="">Any</option>
              <option value="0">Studio</option>
              <option value="1">1 bed</option>
              <option value="2">2 beds</option>
              <option value="3">3 beds</option>
              <option value="4">4 beds</option>
            </select>
          </label>
          <label>
            <span>Min {kind === 'sale' ? 'price' : 'rent'}</span>
            <input
              type="number"
              min="0"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder={kind === 'sale' ? '$200k' : '$1,500'}
            />
          </label>
          <label>
            <span>Max {kind === 'sale' ? 'price' : 'rent'}</span>
            <input
              type="number"
              min="0"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder={kind === 'sale' ? '$800k' : '$4,000'}
            />
          </label>
          <button
            className="primary-button discover-submit"
            type="submit"
            disabled={searching}
          >
            <Search size={16} aria-hidden="true" />
            {searching ? 'Searching…' : 'Search homes'}
          </button>
        </div>
        <div className="search-footnote">
          <SlidersHorizontal size={13} />
          <span>
            Searches use provider listing filters; sample mode covers Austin,
            Brooklyn, New York, and San Antonio.
          </span>
        </div>
      </form>

      {error && (
        <div className="discover-alert" role="alert">
          {error}
        </div>
      )}

      {marketData && (
        <MarketMetrics
          kind={kind}
          statistics={marketData}
          source={marketSource}
          isLive={marketLive}
          loading={loadingStats}
          series={marketSeries}
          maxValue={maxSeriesValue}
        />
      )}

      {hasSearched && (
        <section className="listing-results">
          <div className="results-heading">
            <div>
              <p className="eyebrow">
                {kind === 'sale' ? 'BUY A HOME' : 'FIND A RENTAL'}
              </p>
              <h2>
                {listings.length
                  ? `${listings.length} of ${totalCount} homes shown`
                  : 'No matching homes'}
              </h2>
            </div>
            {listings.length > 0 && (
              <div className="results-meta">
                <span>
                  <Building2 size={14} /> {source}
                </span>
                <span>
                  <ArrowDownWideNarrow size={14} /> Recently listed
                </span>
              </div>
            )}
          </div>

          {listings.length === 0 ? (
            <div className="discover-empty">
              <span>
                <Search size={19} />
              </span>
              <h3>
                {error
                  ? 'Search needs attention'
                  : 'Try another area or relax your filters'}
              </h3>
              <p>
                {error ||
                  'A broader ZIP or a nearby city may return more homes.'}
              </p>
            </div>
          ) : (
            <div className="listing-card-grid">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  kind={kind}
                  selected={selectedIds.includes(listing.id)}
                  canCompare={kind === 'sale'}
                  comparisonDisabled={
                    selectedIds.length >= 3 && !selectedIds.includes(listing.id)
                  }
                  onToggle={() => toggleComparison(listing.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {kind === 'sale' && listings.length > 0 && (
        <section className="comparison-panel">
          <div className="comparison-heading">
            <div>
              <p className="eyebrow">INVESTMENT VIEW</p>
              <h2>Compare rental potential</h2>
              <p>
                Select up to three sale listings to estimate annual gross rent
                and yield.
              </p>
            </div>
            <button
              className="primary-button compare-button"
              type="button"
              disabled={selectedIds.length === 0 || comparing}
              onClick={compareEarnings}
            >
              <ChartNoAxesCombined size={16} />
              {comparing
                ? 'Estimating…'
                : `Compare ${selectedIds.length || ''}`}
            </button>
          </div>
          <div className="comparison-footnote">
            <Sparkles size={14} />
            <span>
              Rent estimates are indicative gross revenue before vacancy,
              expenses, financing, and taxes.
            </span>
          </div>

          {estimates.length > 0 && (
            <div className="earnings-results">
              <div className="earnings-result-heading">
                <div>
                  <span
                    className={`provider-badge ${estimateSource === 'RentCast' ? 'is-live' : 'is-sample'}`}
                  >
                    <span />
                    {estimateSource.toUpperCase()} RENT ESTIMATES
                  </span>
                  <h3>Potential annual gross rent</h3>
                </div>
                {grossYieldLeader && (
                  <div className="leader-note">
                    <Check size={14} /> Highest gross yield
                  </div>
                )}
              </div>
              <div className="earnings-chart">
                {estimates.map((estimate) => {
                  const listing = listings.find(
                    (item) => item.id === estimate.listingId,
                  );
                  const maxAnnual = Math.max(
                    ...estimates.map((item) => item.estimatedAnnualGrossRent),
                    1,
                  );
                  const leader =
                    grossYieldLeader?.listingId === estimate.listingId;
                  return (
                    <article
                      className={`earnings-row ${leader ? 'is-leader' : ''}`}
                      key={estimate.listingId}
                    >
                      <div className="earnings-label">
                        <strong>{listing?.address}</strong>
                        <span>
                          {listing?.city}, {listing?.state}
                        </span>
                      </div>
                      <div className="earnings-bar-track">
                        <span
                          style={{
                            width: `${Math.max(5, (estimate.estimatedAnnualGrossRent / maxAnnual) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="earnings-value">
                        <strong>
                          {currency(estimate.estimatedAnnualGrossRent)}
                        </strong>
                        <span>
                          {estimate.grossYieldPercentage?.toFixed(2)}% gross
                          yield
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="comparison-table-wrap">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Asking</th>
                      <th>Est. rent / mo</th>
                      <th>Range</th>
                      <th>Gross yield</th>
                      <th>Comps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimates.map((estimate) => (
                      <tr key={estimate.listingId}>
                        <td>{estimate.address}</td>
                        <td>{currency(estimate.purchasePrice)}</td>
                        <td>{currency(estimate.estimatedMonthlyRent)}</td>
                        <td>
                          {currency(estimate.rentRangeLow)}–
                          {currency(estimate.rentRangeHigh)}
                        </td>
                        <td>{estimate.grossYieldPercentage?.toFixed(2)}%</td>
                        <td>{estimate.comparableCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="discover-disclaimer">
        <span>
          RentCast data requires a server-side API key and active subscription.
        </span>
        <span>
          Listing records do not include property photos; card photography is
          illustrative, not the pictured home.
        </span>
      </footer>
    </div>
  );
}

function ListingCard({
  listing,
  kind,
  selected,
  canCompare,
  comparisonDisabled,
  onToggle,
}: {
  listing: MarketListing;
  kind: ListingKind;
  selected: boolean;
  canCompare: boolean;
  comparisonDisabled: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="market-listing-card">
      <div className="market-listing-image-wrap">
        <img
          className="market-listing-image"
          src={listing.representativePhoto}
          alt={`Representative residential image for ${listing.propertyType} in ${listing.city}`}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <span className="photo-caption">REPRESENTATIVE PHOTO</span>
        <span className="listing-status">
          <span />
          {listing.status}
        </span>
      </div>
      <div className="market-listing-body">
        <div className="market-listing-title-row">
          <span className="listing-type-label">{listing.propertyType}</span>
          <span className="listing-market-tag">
            {kind === 'sale' ? 'FOR SALE' : 'FOR RENT'}
          </span>
        </div>
        <h3>{listing.address}</h3>
        <p className="market-listing-location">
          <MapPin size={13} /> {listing.city}, {listing.state} {listing.zipCode}
        </p>
        <strong className="market-listing-price">
          {currency(listing.price)}
          {kind === 'rental' && <small>/mo</small>}
        </strong>
        <div className="market-listing-specs">
          <span>
            <BedDouble size={14} /> {listing.bedrooms ?? '—'} bd
          </span>
          <span>{listing.bathrooms ?? '—'} ba</span>
          <span>
            {listing.squareFootage
              ? `${listing.squareFootage.toLocaleString()} sqft`
              : '— sqft'}
          </span>
        </div>
        <div className="market-listing-footer">
          <span>
            {listing.daysOnMarket === null
              ? 'DOM —'
              : `${listing.daysOnMarket} days on market`}
          </span>
          {canCompare ? (
            <label
              className={`compare-checkbox ${selected ? 'is-checked' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={comparisonDisabled}
                onChange={onToggle}
              />
              <span>{selected ? 'Selected' : 'Compare'}</span>
            </label>
          ) : (
            <span className="rent-listing-note">Current asking rent</span>
          )}
        </div>
      </div>
    </article>
  );
}

function MarketMetrics({
  kind,
  statistics,
  source,
  isLive,
  loading,
  series,
  maxValue,
}: {
  kind: ListingKind;
  statistics: MarketStatistics;
  source: string;
  isLive: boolean;
  loading: boolean;
  series: { period: string; value: number }[];
  maxValue: number;
}) {
  const sale = statistics.saleData;
  const rental = statistics.rentalData;
  const selectedData = kind === 'sale' ? sale : rental;
  const median = kind === 'sale' ? sale?.medianPrice : rental?.medianRent;
  const avgPsf =
    kind === 'sale'
      ? sale?.averagePricePerSquareFoot
      : rental?.averageRentPerSquareFoot;
  const lastUpdate = selectedData?.lastUpdatedDate
    ? new Date(selectedData.lastUpdatedDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <section className="market-metrics-panel">
      <div className="market-metrics-head">
        <div>
          <p className="eyebrow">
            ZIP CODE MARKET SNAPSHOT · {statistics.zipCode}
          </p>
          <h2>{kind === 'sale' ? 'Sale market' : 'Rental market'} metrics</h2>
        </div>
        <div className="market-freshness">
          <span
            className={`provider-badge ${isLive ? 'is-live' : 'is-sample'}`}
          >
            <span />
            {source.toUpperCase()}
          </span>
          <span>
            {loading
              ? 'Updating…'
              : lastUpdate
                ? `Updated ${lastUpdate}`
                : 'Date unavailable'}
          </span>
        </div>
      </div>
      <div className="market-stat-grid">
        <MarketStat
          label={kind === 'sale' ? 'Median asking price' : 'Median asking rent'}
          value={median !== undefined ? currency(median) : '—'}
        />
        <MarketStat
          label={
            kind === 'sale' ? 'Average asking price' : 'Average asking rent'
          }
          value={
            (kind === 'sale' ? sale?.averagePrice : rental?.averageRent) !==
            undefined
              ? currency(
                  (kind === 'sale'
                    ? sale?.averagePrice
                    : rental?.averageRent) ?? 0,
                )
              : '—'
          }
        />
        <MarketStat
          label="Average / sqft"
          value={
            avgPsf !== undefined
              ? `${currency(avgPsf, 2)}${kind === 'rental' ? '/mo' : ''}`
              : '—'
          }
        />
        <MarketStat
          label="New listings"
          value={selectedData?.newListings?.toLocaleString() ?? '—'}
        />
        <MarketStat
          label="Total listings"
          value={selectedData?.totalListings?.toLocaleString() ?? '—'}
        />
        <MarketStat
          label="Average days on market"
          value={selectedData?.averageDaysOnMarket?.toFixed(0) ?? '—'}
        />
      </div>
      {series.length > 0 && (
        <div className="market-trend-block">
          <div className="trend-caption">
            <span>
              {kind === 'sale' ? 'Average asking price' : 'Average asking rent'}{' '}
              · monthly
            </span>
            <strong>{series.length} data points</strong>
          </div>
          <div
            className="trend-bars"
            role="img"
            aria-label={`Monthly ${kind} market trend for ZIP ${statistics.zipCode}`}
          >
            {series.map((point) => (
              <div
                className="trend-bar-column"
                key={point.period}
                title={`${point.period}: ${currency(point.value)}`}
              >
                <span
                  style={{
                    height: `${Math.max(7, (point.value / maxValue) * 100)}%`,
                  }}
                />
                <small>{point.period.slice(5)}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="market-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
