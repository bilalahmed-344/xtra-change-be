import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
} from 'class-validator';

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  // @IsInt()
  // @IsNotEmpty()
  // code: number;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;
}
