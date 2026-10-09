import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { UserModel } from '@/lib/models/user';
import {
  findLocalDemoUserById,
  getLocalDemoProperties,
  type LocalDemoProperty,
} from '@/lib/local-demo-store';
import { retrieveEvidence } from '@/lib/rag/retrieval';
import { checksumText, chunkText, redactSensitiveText } from '@/lib/rag/text';
import { getOpenAIClient, hasOpenAIKey } from './openai';
import { storeAssistantDocument, writeAssistantAudit } from './store';
import { getSampleMarketStatistics } from '@/lib/market-data';

export type OwnedProperty = {
  id: string;
  title: string;
  address: string;
  status: string;
  purchasePrice: number;
  targetYieldPercentage: number;
  totalInvestorsCount: number;
  taxMetadata: {
    depreciationScheduleYears?: number;
    annualDepreciationUSD?: number;
    k1GeneratedCount?: number;
  };
};

function normalizeProperty(
  property: LocalDemoProperty | Record<string, any>,
): OwnedProperty {
  return {
    id: 'id' in property ? String(property.id) : String(property._id),
    title: String(property.title ?? ''),
    address: String(property.address ?? ''),
    status: String(property.status ?? 'ACQUISITION'),
    purchasePrice: Number(property.purchasePrice ?? 0),
    targetYieldPercentage: Number(property.targetYieldPercentage ?? 0),
    totalInvestorsCount: Number(property.totalInvestorsCount ?? 0),
    taxMetadata: property.taxMetadata ?? {},
  };
}

export async function getOwnedProperties(userId: string) {
  const database = await connectToDatabase();
  if (!database) return getLocalDemoProperties(userId).map(normalizeProperty);
  if (!Types.ObjectId.isValid(userId)) return [];

  const rows = await database.connection
    .collection('properties')
    .find({ ownerId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(250)
    .toArray();
  return rows.map(normalizeProperty);
}

export async function getAccountSummary(userId: string) {
  const database = await connectToDatabase();
  const user = database
    ? await UserModel.findById(userId).select(
        'displayName username email createdAt',
      )
    : findLocalDemoUserById(userId);
  if (!user)
    return { available: false, message: 'The account record is unavailable.' };

  return {
    displayName: user.displayName,
    username: user.username,
    email: user.email,
    accountCreatedAt:
      user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : user.createdAt,
  };
}

export async function getPortfolioSummary(userId: string) {
  const properties = await getOwnedProperties(userId);
  const purchaseValue = properties.reduce(
    (sum, property) => sum + property.purchasePrice,
    0,
  );
  const averageTargetYield = properties.length
    ? properties.reduce(
        (sum, property) => sum + property.targetYieldPercentage,
        0,
      ) / properties.length
    : 0;

  return {
    propertyCount: properties.length,
    totalPurchaseValueUSD: purchaseValue,
    averageTargetYieldPercentage: Number(averageTargetYield.toFixed(2)),
    totalInvestorsCount: properties.reduce(
      (sum, property) => sum + property.totalInvestorsCount,
      0,
    ),
    estimatedAnnualDepreciationUSD: properties.reduce(
      (sum, property) =>
        sum + Number(property.taxMetadata.annualDepreciationUSD ?? 0),
      0,
    ),
    properties: properties.map(
      ({
        id,
        title,
        address,
        status,
        purchasePrice,
        targetYieldPercentage,
      }) => ({
        id,
        title,
        address,
        status,
        purchasePrice,
        targetYieldPercentage,
      }),
    ),
    cashFlow: {
      available: false,
      reason: 'The current property schema has no income or expense records.',
    },
    occupancy: {
      available: false,
      reason: 'The current property schema has no occupancy records.',
    },
  };
}

export async function getPropertyDetails(userId: string, propertyId: string) {
  const properties = await getOwnedProperties(userId);
  const property = properties.find((candidate) => candidate.id === propertyId);
  return (
    property ?? {
      available: false,
      message: 'That property is not in your account.',
    }
  );
}

export async function searchDocuments(
  userId: string,
  query: string,
  filters: { propertyId?: string; sourceType?: string } = {},
) {
  const evidence = await retrieveEvidence(userId, query, filters, 6);
  return {
    evidence: evidence.map((item) => ({
      text: item.text,
      score: Number(item.score.toFixed(5)),
      citation: item.citation,
    })),
    message: evidence.length
      ? undefined
      : 'No indexed documents for this account support an answer.',
  };
}

export async function searchMarket(zipCode: string) {
  if (!/^\d{5}$/.test(zipCode)) {
    return {
      available: false,
      message: 'Market search requires a five-digit ZIP code.',
    };
  }

  const apiKey = process.env.RENTCAST_API_KEY?.trim();
  if (!apiKey) {
    return {
      source: 'Sample data',
      live: false,
      ...getSampleMarketStatistics(zipCode),
    };
  }

  const url = new URL('https://api.rentcast.io/v1/markets');
  url.searchParams.set('zipCode', zipCode);
  url.searchParams.set('dataType', 'All');
  url.searchParams.set('historyRange', '12');
  const response = await fetch(url, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    return {
      available: false,
      status: response.status,
      message: 'Live market data is temporarily unavailable.',
    };
  }
  return { source: 'RentCast', live: true, data: await response.json() };
}

export async function createPropertyNote(
  userId: string,
  propertyId: string,
  text: string,
) {
  const property = await getPropertyDetails(userId, propertyId);
  if ('available' in property && property.available === false) return property;

  const safeText = redactSensitiveText(text).trim();
  if (safeText.length < 3 || safeText.length > 8000) {
    return {
      available: false,
      message: 'Notes must contain 3 to 8,000 characters.',
    };
  }

  const chunks = chunkText(safeText);
  let vectors: Array<number[] | undefined> = chunks.map(() => undefined);
  if (hasOpenAIKey()) {
    const response = await getOpenAIClient().embeddings.create({
      model: 'text-embedding-3-small',
      input: chunks,
    });
    vectors = chunks.map((_, index) => response.data[index]?.embedding);
  }

  const stored = await storeAssistantDocument(
    {
      userId,
      title: `Note: ${property.title}`,
      sourceType: 'note',
      propertyId,
      checksum: checksumText(safeText),
    },
    chunks.map((chunk, index) => ({
      accountId: userId,
      propertyId,
      sourceType: 'note',
      title: `Note: ${property.title}`,
      text: chunk,
      embedding: vectors[index],
    })),
  );
  if (stored.duplicate) {
    return { available: false, message: 'That note is already indexed.' };
  }

  await writeAssistantAudit({
    userId,
    action: 'assistant.create_note',
    resourceId: stored.document?.id,
    outcome: 'success',
  });
  return { created: true, documentId: stored.document?.id };
}

export const assistantTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_account_summary',
      description:
        'Get the authenticated user account profile. Never accept a user ID from the model.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio_summary',
      description:
        'Get the signed-in user portfolio totals and owned property summaries. Cash flow and occupancy explicitly report unavailable when not modeled.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_property_details',
      description:
        'Get details for a property only if it belongs to the signed-in user.',
      parameters: {
        type: 'object',
        properties: { property_id: { type: 'string' } },
        required: ['property_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description:
        'Check whether transaction information exists for the signed-in user. The current schema may return unavailable.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overview',
      description:
        'Get the authenticated user portfolio overview for dashboard questions.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description:
        'Search only this user’s uploaded, indexed documents. Return evidence with citations; do not guess if no evidence is found.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          property_id: { type: 'string' },
          source_type: { type: 'string' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_market',
      description:
        'Get sale/rental market statistics and monthly trends for a US ZIP code.',
      parameters: {
        type: 'object',
        properties: { zip_code: { type: 'string' } },
        required: ['zip_code'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description:
        'Create a private note attached to one of the signed-in user properties. Require an explicit user request before calling.',
      parameters: {
        type: 'object',
        properties: {
          property_id: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['property_id', 'text'],
        additionalProperties: false,
      },
    },
  },
];

export async function executeAssistantTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
) {
  switch (name) {
    case 'get_account_summary':
      return getAccountSummary(userId);
    case 'get_portfolio_summary':
    case 'get_overview':
      return getPortfolioSummary(userId);
    case 'get_property_details':
      return typeof args.property_id === 'string'
        ? getPropertyDetails(userId, args.property_id)
        : { available: false, message: 'A property ID is required.' };
    case 'get_transactions':
      return {
        available: false,
        message:
          'Transaction data is not modeled in this repository; no transactions are available to report.',
      };
    case 'search_documents':
      return typeof args.query === 'string'
        ? searchDocuments(userId, args.query, {
            propertyId:
              typeof args.property_id === 'string'
                ? args.property_id
                : undefined,
            sourceType:
              typeof args.source_type === 'string'
                ? args.source_type
                : undefined,
          })
        : { evidence: [], message: 'A search query is required.' };
    case 'search_market':
      return typeof args.zip_code === 'string'
        ? searchMarket(args.zip_code)
        : { available: false, message: 'A ZIP code is required.' };
    case 'create_note':
      return typeof args.property_id === 'string' &&
        typeof args.text === 'string'
        ? createPropertyNote(userId, args.property_id, args.text)
        : {
            available: false,
            message: 'Property ID and note text are required.',
          };
    default:
      return {
        available: false,
        message: 'This assistant tool is not available.',
      };
  }
}
