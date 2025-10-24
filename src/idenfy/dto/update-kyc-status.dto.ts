import { IsBoolean } from 'class-validator';

export class UpdateKycStatusDto {
  @IsBoolean()
  verified: boolean;
}
