'use client';

import React from 'react';

interface PropertyCardProps {
  title: string;
  address: string;
  status: 'ACQUISITION' | 'LAUNCH' | 'ACTIVE';
  purchasePrice: number;
  yieldPct: number;
  annualDepreciation: number;
}

const mockProperties: PropertyCardProps[] = [
  {
    title: 'Brooklyn Heights Residential Unit',
    address: '142 Joralemon St, Brooklyn, NY',
    status: 'ACTIVE',
    purchasePrice: 1250000,
    yieldPct: 8.4,
    annualDepreciation: 45454.55,
  },
  {
    title: 'Manhattan West Side Portfolio',
    address: '410 W 42nd St, New York, NY',
    status: 'LAUNCH',
    purchasePrice: 3100000,
    yieldPct: 7.9,
    annualDepreciation: 112727.27,
  },
];

export default function DashboardOverview() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>
          Mogul Asset & Tax Operations Dashboard
        </h1>
        <p style={{ color: '#6b7280' }}>
          New York City Headquarters | Enterprise Infrastructure Engine
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {mockProperties.map((prop, idx) => (
          <div
            key={idx}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>{prop.title}</h3>
              <span
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  backgroundColor: prop.status === 'ACTIVE' ? '#d1fae5' : '#fef3c7',
                  color: prop.status === 'ACTIVE' ? '#065f46' : '#92400e',
                }}
              >
                {prop.status}
              </span>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.5rem 0 1rem 0' }}>
              {prop.address}
            </p>
            <hr style={{ borderTop: '1px solid #f3f4f6', margin: '1rem 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem' }}>
              <div>
                <p style={{ color: '#9ca3af' }}>Purchase Price</p>
                <p style={{ fontWeight: '600' }}>${prop.purchasePrice.toLocaleString()}</p>
              </div>
              <div>
                <p style={{ color: '#9ca3af' }}>Target Yield</p>
                <p style={{ fontWeight: '600', color: '#059669' }}>{prop.yieldPct}%</p>
              </div>
              <div style={{ gridColumn: 'span 2', marginTop: '0.5rem' }}>
                <p style={{ color: '#9ca3af' }}>Est. Annual Depreciation (Tax Engine)</p>
                <p style={{ fontWeight: '600', color: '#2563eb' }}>
                  ${prop.annualDepreciation.toLocaleString()}/yr
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}