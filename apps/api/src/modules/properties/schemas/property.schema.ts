import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PropertyDocument = Property & Document;

export enum PropertyStatus {
  ACQUISITION = 'ACQUISITION',
  LAUNCH = 'LAUNCH',
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
}

@Schema({ timestamps: true })
export class Property {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true, default: PropertyStatus.ACQUISITION })
  status: PropertyStatus;

  @Prop({ required: true })
  purchasePrice: number;

  @Prop({ required: true })
  targetYieldPercentage: number;

  @Prop({ default: 0 })
  totalInvestorsCount: number;

  @Prop({ type: Object, default: {} })
  taxMetadata: {
    depreciationScheduleYears?: number;
    annualDepreciationUSD?: number;
    k1GeneratedCount?: number;
  };
}

export const PropertySchema = SchemaFactory.createForClass(Property);