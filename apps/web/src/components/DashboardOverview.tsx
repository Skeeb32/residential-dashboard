'use client';

import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  ShieldCheck,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

type UserProfile = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  createdAt?: string;
};

type PropertyRecord = {
  id: string;
  title: string;
  address: string;
  status: 'ACQUISITION' | 'LAUNCH' | 'ACTIVE' | 'MAINTENANCE';
  purchasePrice: number;
  targetYieldPercentage: number;
  totalInvestorsCount: number;
  taxMetadata: {
    depreciationScheduleYears?: number;
    annualDepreciationUSD?: number;
    k1GeneratedCount?: number;
  };
};

type Section = 'overview' | 'portfolio' | 'tax' | 'account';
type AuthMode = 'login' | 'register';

const navigation: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'portfolio', label: 'Portfolio', icon: Building2 },
  { id: 'tax', label: 'Tax center', icon: FileText },
  { id: 'account', label: 'Account', icon: UserRound },
];

const sectionDetails: Record<Section, { title: string; eyebrow: string }> = {
  overview: { title: 'Overview', eyebrow: 'Your portfolio at a glance' },
  portfolio: {
    title: 'Portfolio',
    eyebrow: 'Properties connected to your account',
  },
  tax: { title: 'Tax center', eyebrow: 'Depreciation and tax records' },
  account: { title: 'Account', eyebrow: 'Your profile and preferences' },
};

async function responseMessage(response: Response, fallback: string) {
  const result = await response.json().catch(() => ({}));
  return typeof result.message === 'string' ? result.message : fallback;
}

function formatMoney(value: number, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function DashboardOverview() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authLoading, setAuthLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pageError, setPageError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [authForm, setAuthForm] = useState({
    displayName: '',
    email: '',
    username: '',
    password: '',
  });
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    email: '',
  });

  useEffect(() => {
    async function restoreSession() {
      try {
        const profileResponse = await fetch('/api/profile');
        if (profileResponse.status === 401) return;
        if (!profileResponse.ok) {
          setAuthError(
            await responseMessage(
              profileResponse,
              'Your account could not be reached. Please try again.',
            ),
          );
          return;
        }

        const profileResult = (await profileResponse.json()) as {
          user: UserProfile;
        };
        setUser(profileResult.user);
        setProfileForm({
          displayName: profileResult.user.displayName,
          email: profileResult.user.email,
        });

        const propertiesResponse = await fetch('/api/properties');
        if (!propertiesResponse.ok) {
          setPageError(
            await responseMessage(
              propertiesResponse,
              'Property information is temporarily unavailable.',
            ),
          );
          return;
        }

        const propertiesResult = (await propertiesResponse.json()) as {
          properties: PropertyRecord[];
        };
        setProperties(propertiesResult.properties);
      } catch {
        setAuthError(
          'Account service is unavailable. Check the database and retry.',
        );
      } finally {
        setAuthLoading(false);
      }
    }

    void restoreSession();
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setAuthError('');

    const endpoint =
      authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload =
      authMode === 'login'
        ? { username: authForm.username, password: authForm.password }
        : authForm;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setAuthError(
          await responseMessage(response, 'Unable to sign in. Please retry.'),
        );
        return;
      }

      const result = (await response.json()) as { user: UserProfile };
      setUser(result.user);
      setProfileForm({
        displayName: result.user.displayName,
        email: result.user.email,
      });
      setAuthForm({ displayName: '', email: '', username: '', password: '' });
      setActiveSection('overview');
      const propertiesResponse = await fetch('/api/properties');
      if (propertiesResponse.ok) {
        const propertiesResult = (await propertiesResponse.json()) as {
          properties: PropertyRecord[];
        };
        setProperties(propertiesResult.properties);
      }
    } catch {
      setAuthError(
        'Account service is unavailable. Check the database and retry.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    setProperties([]);
    setActiveSection('overview');
    setAuthMode('login');
    setAuthForm({ displayName: '', email: '', username: '', password: '' });
    setAuthError('');
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage('');

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      if (!response.ok) {
        setProfileMessage(
          await responseMessage(response, 'Your changes could not be saved.'),
        );
        return;
      }

      const result = (await response.json()) as { user: UserProfile };
      setUser(result.user);
      setProfileMessage('Profile updated.');
    } catch {
      setProfileMessage('Your changes could not be saved. Please retry.');
    } finally {
      setProfileSaving(false);
    }
  }

  if (authLoading) {
    return (
      <main className="loading-screen" aria-label="Loading account">
        <div className="brand-mark">M</div>
        <span className="loading-line" />
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        form={authForm}
        error={authError}
        submitting={submitting}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setAuthError('');
        }}
        onFormChange={setAuthForm}
        onSubmit={submitAuth}
      />
    );
  }

  const page = sectionDetails[activeSection];
  const portfolioValue = properties.reduce(
    (total, property) => total + Number(property.purchasePrice || 0),
    0,
  );
  const annualDepreciation = properties.reduce(
    (total, property) =>
      total + Number(property.taxMetadata?.annualDepreciationUSD || 0),
    0,
  );
  const averageYield = properties.length
    ? properties.reduce(
        (total, property) =>
          total + Number(property.targetYieldPercentage || 0),
        0,
      ) / properties.length
    : 0;
  const investorCount = properties.reduce(
    (total, property) => total + Number(property.totalInvestorsCount || 0),
    0,
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="/" aria-label="Mogul home">
          <span className="brand-mark">M</span>
          <span className="brand-name">
            mogul<span>.</span>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-item ${activeSection === id ? 'is-active' : ''}`}
              key={id}
              type="button"
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={() => {
                setActiveSection(id);
                setProfileMessage('');
              }}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
              {id === 'portfolio' && properties.length > 0 && (
                <span className="nav-count">{properties.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-security">
          <ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" />
          <span>Private workspace</span>
        </div>
        <button
          className="sidebar-account"
          type="button"
          onClick={() => setActiveSection('account')}
        >
          <span className="avatar avatar-small">
            {initials(user.displayName)}
          </span>
          <span className="sidebar-account-copy">
            <strong>{user.displayName}</strong>
            <span>@{user.username}</span>
          </span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">M</span>
            <span className="brand-name">
              mogul<span>.</span>
            </span>
          </div>
          <div className="topbar-context">
            <span className="topbar-dot" />
            <span>Personal workspace</span>
          </div>
          <div className="topbar-user">
            <span className="avatar">{initials(user.displayName)}</span>
            <button className="logout-button" type="button" onClick={logout}>
              <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <main className="content-area">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{page.eyebrow}</p>
              <h1>{page.title}</h1>
            </div>
            <span className="heading-mark">NYC · RESIDENTIAL</span>
          </div>

          {pageError && (
            <div className="inline-alert" role="alert">
              {pageError}
              <button
                type="button"
                onClick={() => setPageError('')}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {activeSection === 'overview' && (
            <OverviewSection
              user={user}
              properties={properties}
              portfolioValue={portfolioValue}
              averageYield={averageYield}
              annualDepreciation={annualDepreciation}
              investorCount={investorCount}
              onViewPortfolio={() => setActiveSection('portfolio')}
            />
          )}
          {activeSection === 'portfolio' && (
            <PortfolioSection properties={properties} />
          )}
          {activeSection === 'tax' && (
            <TaxSection
              properties={properties}
              annualDepreciation={annualDepreciation}
            />
          )}
          {activeSection === 'account' && (
            <AccountSection
              user={user}
              form={profileForm}
              message={profileMessage}
              saving={profileSaving}
              onFormChange={setProfileForm}
              onSubmit={saveProfile}
              onLogout={logout}
            />
          )}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            className={`mobile-nav-item ${activeSection === id ? 'is-active' : ''}`}
            key={id}
            type="button"
            aria-current={activeSection === id ? 'page' : undefined}
            onClick={() => setActiveSection(id)}
          >
            <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

type AuthForm = {
  displayName: string;
  email: string;
  username: string;
  password: string;
};

function AuthScreen({
  mode,
  form,
  error,
  submitting,
  onModeChange,
  onFormChange,
  onSubmit,
}: {
  mode: AuthMode;
  form: AuthForm;
  error: string;
  submitting: boolean;
  onModeChange: (mode: AuthMode) => void;
  onFormChange: (form: AuthForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const registering = mode === 'register';

  return (
    <main className="auth-screen">
      <section className="auth-story" aria-label="Mogul">
        <div className="story-grid" aria-hidden="true" />
        <a
          className="brand-lockup brand-lockup-light"
          href="/"
          aria-label="Mogul home"
        >
          <span className="brand-mark">M</span>
          <span className="brand-name">
            mogul<span>.</span>
          </span>
        </a>
        <div className="story-copy">
          <p className="story-kicker">PRIVATE REAL ESTATE, MADE CLEAR</p>
          <h1>
            Capital, <em>clearly.</em>
          </h1>
          <p className="story-description">
            One considered view of your property portfolio, performance, and tax
            picture.
          </p>
        </div>
        <div className="story-footer">
          <span>BUILT FOR LONG-TERM OWNERSHIP</span>
          <span className="story-index">01 / 04</span>
        </div>
        <div className="story-orbit" aria-hidden="true">
          <span className="orbit-line orbit-line-one" />
          <span className="orbit-line orbit-line-two" />
          <span className="orbit-node orbit-node-one" />
          <span className="orbit-node orbit-node-two" />
          <span className="orbit-node orbit-node-three" />
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-top">
          <span className="secure-label">
            <ShieldCheck size={15} /> SECURE ACCOUNT ACCESS
          </span>
          <span className="auth-city">NEW YORK · EST. 2024</span>
        </div>
        <div className="auth-form-wrap">
          <p className="eyebrow">
            {registering ? 'GET STARTED' : 'WELCOME BACK'}
          </p>
          <h2>{registering ? 'Create your account' : 'Sign in to Mogul'}</h2>
          <p className="auth-subtitle">
            {registering
              ? 'Set up your private workspace in a few steps.'
              : 'Your portfolio is right where you left it.'}
          </p>

          <form className="auth-form" onSubmit={onSubmit}>
            {registering && (
              <>
                <FormField
                  id="displayName"
                  label="Full name"
                  value={form.displayName}
                  onChange={(value) =>
                    onFormChange({ ...form, displayName: value })
                  }
                  autoComplete="name"
                  minLength={2}
                  required
                />
                <FormField
                  id="registerEmail"
                  label="Email address"
                  type="email"
                  value={form.email}
                  onChange={(value) => onFormChange({ ...form, email: value })}
                  autoComplete="email"
                  required
                />
              </>
            )}
            <FormField
              id="username"
              label="Username"
              value={form.username}
              onChange={(value) => onFormChange({ ...form, username: value })}
              autoComplete="username"
              minLength={3}
              maxLength={32}
              pattern="(?:[A-Za-z0-9._]|-)+"
              hint={
                registering
                  ? '3–32 characters: letters, numbers, dots, dashes, or underscores.'
                  : undefined
              }
              required
            />
            <FormField
              id="password"
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) => onFormChange({ ...form, password: value })}
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={registering ? 10 : undefined}
              hint={registering ? 'Use at least 10 characters.' : undefined}
              required
            />

            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}

            <button
              className="primary-button auth-submit"
              type="submit"
              disabled={submitting}
            >
              <span>
                {submitting
                  ? 'Please wait…'
                  : registering
                    ? 'Create account'
                    : 'Sign in'}
              </span>
              {!submitting && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </form>

          <p className="auth-switch">
            {registering ? 'Already have an account?' : 'New to Mogul?'}{' '}
            <button
              type="button"
              onClick={() => onModeChange(registering ? 'login' : 'register')}
            >
              {registering ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
        <div className="auth-panel-footer">
          <span>© 2026 MOGUL</span>
          <span>YOUR INFORMATION STAYS YOURS</span>
        </div>
      </section>
    </main>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  minLength,
  maxLength,
  pattern,
  hint,
  required,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function OverviewSection({
  user,
  properties,
  portfolioValue,
  averageYield,
  annualDepreciation,
  investorCount,
  onViewPortfolio,
}: {
  user: UserProfile;
  properties: PropertyRecord[];
  portfolioValue: number;
  averageYield: number;
  annualDepreciation: number;
  investorCount: number;
  onViewPortfolio: () => void;
}) {
  return (
    <>
      <section className="welcome-band">
        <div>
          <span className="welcome-date">PERSONAL OVERVIEW</span>
          <h2>Good to see you, {user.displayName.split(' ')[0]}.</h2>
          <p>Your account, portfolio, and tax information in one place.</p>
        </div>
        <div className="welcome-stamp">
          <span className="stamp-top">MOGUL</span>
          <span className="stamp-main">
            NY<span>·</span>01
          </span>
          <span className="stamp-bottom">PRIVATE OFFICE</span>
        </div>
      </section>

      <section className="metric-grid" aria-label="Portfolio summary">
        <MetricCard
          icon={CircleDollarSign}
          label="Portfolio value"
          value={properties.length ? formatMoney(portfolioValue) : '—'}
          footnote={
            properties.length
              ? `${properties.length} owned ${properties.length === 1 ? 'property' : 'properties'}`
              : 'No properties linked yet'
          }
          tone="green"
        />
        <MetricCard
          icon={ArrowUpRight}
          label="Average target yield"
          value={properties.length ? `${averageYield.toFixed(1)}%` : '—'}
          footnote={
            properties.length
              ? 'Across your properties'
              : 'Available when properties are linked'
          }
          tone="blue"
        />
        <MetricCard
          icon={FileText}
          label="Annual depreciation"
          value={properties.length ? formatMoney(annualDepreciation) : '—'}
          footnote={
            properties.length
              ? 'From your tax records'
              : 'No tax records available'
          }
          tone="gold"
        />
        <MetricCard
          icon={UsersRound}
          label="Investor relationships"
          value={investorCount.toLocaleString('en-US')}
          footnote="Across your portfolio"
          tone="slate"
        />
      </section>

      <section className="section-row">
        <div className="section-title-group">
          <p className="eyebrow">YOUR REAL ESTATE</p>
          <h2>Portfolio snapshot</h2>
        </div>
        <button className="text-button" type="button" onClick={onViewPortfolio}>
          View portfolio <ArrowRight size={16} aria-hidden="true" />
        </button>
      </section>

      {properties.length ? (
        <PropertyList properties={properties.slice(0, 3)} />
      ) : (
        <EmptyState
          icon={Building2}
          title="Your portfolio is ready when you are"
          description="Properties linked to your account will appear here. Existing records remain unchanged until they are associated with an account."
          action="Explore portfolio"
          onAction={onViewPortfolio}
        />
      )}

      <div className="overview-bottom-grid">
        <section className="note-panel tax-note">
          <span className="note-icon">
            <FileText size={18} />
          </span>
          <div>
            <p className="eyebrow">TAX CENTER</p>
            <h3>
              {properties.length
                ? 'Your tax records are organized.'
                : 'Tax records will appear with your properties.'}
            </h3>
            <p>Depreciation details are kept alongside each property record.</p>
          </div>
        </section>
        <section className="note-panel account-note">
          <span className="note-icon">
            <ShieldCheck size={18} />
          </span>
          <div>
            <p className="eyebrow">ACCOUNT PRIVACY</p>
            <h3>Private to your account.</h3>
            <p>Portfolio information is filtered to your signed-in profile.</p>
          </div>
        </section>
      </div>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  footnote,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  footnote: string;
  tone: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span className="metric-label">{label}</span>
        <span className={`metric-icon metric-${tone}`}>
          <Icon size={17} strokeWidth={1.8} />
        </span>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-footnote">{footnote}</span>
    </article>
  );
}

function PortfolioSection({ properties }: { properties: PropertyRecord[] }) {
  return (
    <section className="content-panel portfolio-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">PROPERTY RECORDS</p>
          <h2>Owned properties</h2>
        </div>
        <span className="record-count">
          {properties.length} {properties.length === 1 ? 'record' : 'records'}
        </span>
      </div>
      {properties.length ? (
        <PropertyList properties={properties} />
      ) : (
        <EmptyState
          icon={Building2}
          title="No properties linked to this account"
          description="Only properties assigned to your account are shown here. Unassigned records are kept intact and remain hidden from personal workspaces."
        />
      )}
    </section>
  );
}

function PropertyList({ properties }: { properties: PropertyRecord[] }) {
  return (
    <div className="property-list">
      {properties.map((property) => (
        <article className="property-row" key={property.id}>
          <div className="property-glyph">
            <Building2 size={20} strokeWidth={1.7} />
          </div>
          <div className="property-main">
            <div className="property-title-line">
              <h3>{property.title}</h3>
              <span
                className={`status-pill status-${property.status.toLowerCase()}`}
              >
                <span />
                {property.status.toLowerCase()}
              </span>
            </div>
            <p className="property-address">
              <MapPin size={14} />
              {property.address}
            </p>
          </div>
          <div className="property-data">
            <span>Purchase price</span>
            <strong>{formatMoney(Number(property.purchasePrice || 0))}</strong>
          </div>
          <div className="property-data property-yield">
            <span>Target yield</span>
            <strong>
              {Number(property.targetYieldPercentage || 0).toFixed(1)}%
            </strong>
          </div>
          <ArrowRight
            className="property-chevron"
            size={17}
            aria-hidden="true"
          />
        </article>
      ))}
    </div>
  );
}

function TaxSection({
  properties,
  annualDepreciation,
}: {
  properties: PropertyRecord[];
  annualDepreciation: number;
}) {
  return (
    <>
      <section className="tax-summary-banner">
        <div className="tax-banner-icon">
          <FileText size={22} />
        </div>
        <div className="tax-banner-copy">
          <p className="eyebrow">ESTIMATED ANNUAL DEPRECIATION</p>
          <strong>
            {properties.length ? formatMoney(annualDepreciation, 2) : '—'}
          </strong>
          <span>Based on tax metadata recorded for your properties</span>
        </div>
        <span className="tax-banner-seal">
          <ShieldCheck size={19} /> PRIVATE
        </span>
      </section>
      <section className="content-panel tax-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">PROPERTY-LEVEL DETAIL</p>
            <h2>Depreciation schedule</h2>
          </div>
          <span className="record-count">
            {properties.length}{' '}
            {properties.length === 1 ? 'property' : 'properties'}
          </span>
        </div>
        {properties.length ? (
          <div className="tax-table-wrap">
            <table className="tax-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Schedule</th>
                  <th>Annual depreciation</th>
                  <th>K-1 records</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => (
                  <tr key={property.id}>
                    <td>
                      <strong>{property.title}</strong>
                      <span>{property.address}</span>
                    </td>
                    <td>
                      {property.taxMetadata.depreciationScheduleYears
                        ? `${property.taxMetadata.depreciationScheduleYears} years`
                        : '—'}
                    </td>
                    <td>
                      {property.taxMetadata.annualDepreciationUSD !== undefined
                        ? formatMoney(
                            property.taxMetadata.annualDepreciationUSD,
                            2,
                          )
                        : '—'}
                    </td>
                    <td>{property.taxMetadata.k1GeneratedCount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No tax records yet"
            description="Tax schedules and annual depreciation will show here when property records are associated with your account."
          />
        )}
        <p className="tax-disclaimer">
          Figures shown are property-record estimates and are not tax advice.
        </p>
      </section>
    </>
  );
}

function AccountSection({
  user,
  form,
  message,
  saving,
  onFormChange,
  onSubmit,
  onLogout,
}: {
  user: UserProfile;
  form: { displayName: string; email: string };
  message: string;
  saving: boolean;
  onFormChange: (form: { displayName: string; email: string }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
}) {
  return (
    <div className="account-layout">
      <section className="content-panel profile-panel">
        <div className="profile-banner">
          <span className="avatar avatar-large">
            {initials(user.displayName)}
          </span>
          <div>
            <p className="eyebrow">PERSONAL PROFILE</p>
            <h2>{user.displayName}</h2>
            <span>@{user.username}</span>
          </div>
        </div>
        <form className="profile-form" onSubmit={onSubmit}>
          <div className="panel-header profile-form-heading">
            <div>
              <p className="eyebrow">ACCOUNT DETAILS</p>
              <h3>Profile information</h3>
            </div>
          </div>
          <div className="profile-form-grid">
            <FormField
              id="profileDisplayName"
              label="Full name"
              value={form.displayName}
              onChange={(value) =>
                onFormChange({ ...form, displayName: value })
              }
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
            />
            <FormField
              id="profileEmail"
              label="Email address"
              type="email"
              value={form.email}
              onChange={(value) => onFormChange({ ...form, email: value })}
              autoComplete="email"
              required
            />
            <FormField
              id="profileUsername"
              label="Username"
              value={user.username}
              onChange={() => undefined}
              autoComplete="username"
              disabled
              required
            />
          </div>
          {message && (
            <p
              className={`profile-message ${message === 'Profile updated.' ? 'is-success' : ''}`}
              role="status"
            >
              {message === 'Profile updated.' && <Check size={15} />}
              {message}
            </p>
          )}
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      <aside className="account-side-column">
        <section className="content-panel account-security-panel">
          <span className="security-badge">
            <ShieldCheck size={19} />
          </span>
          <p className="eyebrow">ACCOUNT SECURITY</p>
          <h3>Your workspace is private.</h3>
          <p>
            Your account is protected by a secure session. Property records are
            only returned when assigned to your user profile.
          </p>
          <div className="security-detail">
            <span>Username</span>
            <strong>@{user.username}</strong>
          </div>
        </section>
        <section className="content-panel signout-panel">
          <div>
            <p className="eyebrow">SESSION</p>
            <h3>Finished for now?</h3>
          </div>
          <button className="secondary-button" type="button" onClick={onLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </section>
      </aside>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={20} strokeWidth={1.7} />
      </span>
      <div className="empty-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action && onAction && (
        <button
          className="text-button empty-action"
          type="button"
          onClick={onAction}
        >
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
