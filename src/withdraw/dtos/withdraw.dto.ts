// withdraw.dto.ts
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class WithdrawDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  routingNumber: string;

  @IsNotEmpty()
  @IsString()
  accountNumber: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
