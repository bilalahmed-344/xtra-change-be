import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SignupDto } from './dtos/signup.dto';
import { LoginDto } from './dtos/login.dto';
import { JwtService } from '@nestjs/jwt';
import { TwilioService } from 'src/twilio/twilio.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private twilioService: TwilioService,
  ) {}
  async signup(dto: SignupDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (existingUser) {
      throw new ConflictException('User with this phone number already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        phoneVerified: false,
      },
    });
    user.stripeCustomerId = null;

    // const verificationSid = await this.twilioService.sendOtp(dto.phoneNumber);

    const otp = user.phoneNumber.slice(-4);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return {
      message: 'Signup successful. Please verify OTP.',
      otp,
    };
  }

  // async login(dto: LoginDto) {
  //   const user = await this.prisma.user.findUnique({
  //     where: { phoneNumber: dto.phoneNumber },
  //   });

  //   if (!user) {
  //     throw new UnauthorizedException('Invalid credentials');
  //   }

  //   const payload = {
  //     id: user.id,
  //   };

  //   const token = this.jwtService.sign(payload);
  //   // await this.twilioService.sendOtp(dto.phoneNumber);
  //   const { stripeCustomerId, ...userWithoutStripeId } = user;

  //   return {
  //     // message: 'OTP sent to phone number',
  //     // phoneNumber: dto.phoneNumber,
  //     token,
  //     user: userWithoutStripeId,
  //   };
  // }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // OTP = last 4 digits of phone
    const otp = user.phoneNumber.slice(-4);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return {
      message: 'OTP sent',
      otp, // ⚠️ testing only
    };
  }

  // Step 3: Verify OTP -> Return JWT if OTP is correct Twillio
  // async verifyOtp(phoneNumber: string, code: string) {
  //   const verification = await this.twilioService.verifyOtp(phoneNumber, code);

  //   if (verification.status !== 'approved') {
  //     throw new UnauthorizedException('Invalid or expired OTP');
  //   }

  //   const user = await this.prisma.user.findUnique({
  //     where: { phoneNumber },
  //   });

  //   if (!user) {
  //     throw new UnauthorizedException('User not found');
  //   }

  //   const payload = { id: user.id };
  //   const token = this.jwtService.sign(payload);

  //   return {
  //     access_token: token,
  //     user: {
  //       id: user.id,
  //       name: user.name,
  //       email: user.email,
  //       phoneNumber: user.phoneNumber,
  //     },
  //   };
  // }

  // 🔹 Step 2: Verify OTP (for signup or login)
  async verifyOtp(phoneNumber: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (
      !user.otpCode ||
      !user.otpExpiresAt ||
      user.otpCode !== code ||
      user.otpExpiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Mark verified + clear OTP
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpiresAt: null, phoneVerified: true },
    });

    // Generate JWT
    const payload = { id: user.id };
    const token = this.jwtService.sign(payload);

    return {
      message: 'OTP verified. Logged in successfully.',
      access_token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    };
  }
}
