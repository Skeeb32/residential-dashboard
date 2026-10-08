import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Property,
  PropertyDocument,
} from '../properties/schemas/property.schema';

@Injectable()
export class TaxEngineService {
  private readonly logger = new Logger(TaxEngineService.name);

  constructor(
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
  ) {}

  /**
   * Calculates straight-line MACRS residential property depreciation (27.5 years)
   * and logs tax generation data for operational automation.
   */
  async calculatePropertyDepreciation(propertyId: string) {
    const property = await this.propertyModel.findById(propertyId);
    if (!property) throw new Error('Property not found');

    const depreciationScheduleYears = 27.5;
    const annualDepreciationUSD = Number(
      (property.purchasePrice / depreciationScheduleYears).toFixed(2),
    );

    const updatedProperty = await this.propertyModel.findByIdAndUpdate(
      propertyId,
      {
        $set: {
          'taxMetadata.depreciationScheduleYears': depreciationScheduleYears,
          'taxMetadata.annualDepreciationUSD': annualDepreciationUSD,
        },
      },
      { new: true },
    );

    this.logger.log(
      `Tax Depreciation Calculated for ${property.title}: $${annualDepreciationUSD}/year`,
    );

    return updatedProperty;
  }
}
