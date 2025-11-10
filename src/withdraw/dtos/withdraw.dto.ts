import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class WithdrawDto {
  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  name: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{9}$/, { message: 'Routing number must be exactly 9 digits' })
  routingNumber: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4,17}$/, { message: 'Account number must be 4-17 digits' })
  accountNumber: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
