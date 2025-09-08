import { IsBoolean, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { PaymentFrequency, RoundUpDestination } from '@prisma/client';

export class CreateRoundUpDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsEnum(PaymentFrequency, {
    message: 'paymentFrequency must be DAILY, WEEKLY, or MONTHLY',
  })
  paymentFrequency: PaymentFrequency;

  @IsNumber({}, { message: 'roundUpLimit must be a number' })
  roundUpLimit: number;

  @IsOptional()
  @IsEnum(RoundUpDestination)
  destination?: RoundUpDestination;
}
