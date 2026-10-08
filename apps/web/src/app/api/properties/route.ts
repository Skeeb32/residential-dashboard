import mongoose, { Types } from 'mongoose';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return NextResponse.json(
      { message: 'Sign in to continue.' },
      { status: 401 },
    );
  }

  try {
    await connectToDatabase();
    const properties = await mongoose.connection
      .collection('properties')
      .find({ ownerId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      properties: properties.map((property) => ({
        id: property._id.toString(),
        title: property.title,
        address: property.address,
        status: property.status,
        purchasePrice: property.purchasePrice,
        targetYieldPercentage: property.targetYieldPercentage,
        totalInvestorsCount: property.totalInvestorsCount ?? 0,
        taxMetadata: property.taxMetadata ?? {},
      })),
    });
  } catch {
    return NextResponse.json(
      { message: 'Property data is unavailable. Please retry.' },
      { status: 503 },
    );
  }
}
