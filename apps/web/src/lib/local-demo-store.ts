import { Types } from 'mongoose';

export type LocalDemoUser = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export type LocalDemoProperty = {
  id: string;
  ownerId: string;
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

type LocalDemoStore = {
  active: boolean;
  users: Map<string, LocalDemoUser>;
  properties: Map<string, LocalDemoProperty[]>;
};

const globalForDemoStore = globalThis as typeof globalThis & {
  localDemoStore?: LocalDemoStore;
};

const store = (globalForDemoStore.localDemoStore ??= {
  active: false,
  users: new Map(),
  properties: new Map(),
});

export function activateLocalDemoStore() {
  store.active = true;
}

export function isLocalDemoStoreActive() {
  return store.active;
}

export function createLocalDemoUser(
  user: Omit<LocalDemoUser, 'id' | 'createdAt'>,
) {
  const normalizedUsername = user.username.toLowerCase();
  const normalizedEmail = user.email.toLowerCase();
  const duplicate = [...store.users.values()].some(
    (existingUser) =>
      existingUser.username === normalizedUsername ||
      existingUser.email === normalizedEmail,
  );

  if (duplicate) return null;

  const createdUser: LocalDemoUser = {
    ...user,
    id: new Types.ObjectId().toHexString(),
    username: normalizedUsername,
    email: normalizedEmail,
    createdAt: new Date().toISOString(),
  };

  store.users.set(createdUser.id, createdUser);
  return createdUser;
}

export function findLocalDemoUserByUsername(username: string) {
  const normalizedUsername = username.toLowerCase();
  return (
    [...store.users.values()].find(
      (user) => user.username === normalizedUsername,
    ) ?? null
  );
}

export function findLocalDemoUserById(userId: string) {
  return store.users.get(userId) ?? null;
}

export function updateLocalDemoUser(
  userId: string,
  changes: Pick<LocalDemoUser, 'displayName' | 'email'>,
) {
  const user = store.users.get(userId);
  if (!user) return { user: null, emailInUse: false };

  const normalizedEmail = changes.email.toLowerCase();
  const emailInUse = [...store.users.values()].some(
    (existingUser) =>
      existingUser.id !== userId && existingUser.email === normalizedEmail,
  );

  if (emailInUse) return { user: null, emailInUse: true };

  user.displayName = changes.displayName;
  user.email = normalizedEmail;
  return { user, emailInUse: false };
}

export function seedLocalDemoProperties(userId: string) {
  if (store.properties.has(userId)) return;

  store.properties.set(userId, [
    {
      id: new Types.ObjectId().toHexString(),
      ownerId: userId,
      title: 'Brooklyn Heights Residential Unit',
      address: '142 Joralemon St, Brooklyn, NY',
      status: 'ACTIVE',
      purchasePrice: 1250000,
      targetYieldPercentage: 8.4,
      totalInvestorsCount: 0,
      taxMetadata: {
        depreciationScheduleYears: 27.5,
        annualDepreciationUSD: 45454.55,
        k1GeneratedCount: 0,
      },
    },
    {
      id: new Types.ObjectId().toHexString(),
      ownerId: userId,
      title: 'Manhattan West Side Portfolio',
      address: '410 W 42nd St, New York, NY',
      status: 'LAUNCH',
      purchasePrice: 3100000,
      targetYieldPercentage: 7.9,
      totalInvestorsCount: 0,
      taxMetadata: {
        depreciationScheduleYears: 27.5,
        annualDepreciationUSD: 112727.27,
        k1GeneratedCount: 0,
      },
    },
  ]);
}

export function getLocalDemoProperties(userId: string) {
  return store.properties.get(userId) ?? [];
}
