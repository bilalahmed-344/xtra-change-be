import { IsBoolean, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { PaymentFrequency } from '@prisma/client';

export class CreateRoundUpDto {
  @IsEnum(PaymentFrequency, {
    message: 'paymentFrequency must be DAILY, WEEKLY, or MONTHLY',
  })
  paymentFrequency: PaymentFrequency;

  @IsNumber({}, { message: 'roundUpLimit must be a number' })
  roundUpLimit: number;
}
