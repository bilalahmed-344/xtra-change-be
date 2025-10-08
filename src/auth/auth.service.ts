import {
  BadRequestException,
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
import * as bcrypt from 'bcrypt';
import { decrypt } from 'src/utils/crypto.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private twilioService: TwilioService,
  ) {}

  async signInOrSignUp(dto: SignupDto | LoginDto) {
    let user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    let newUser = false;
    if (!user) {
      // User does not exist → signup flow
      user = await this.prisma.user.create({
        data: {
          name: (dto as SignupDto).name ?? null,
          email: (dto as SignupDto).email ?? null,
          phoneNumber: dto.phoneNumber,
          phoneVerified: false,
        },
      });
      newUser = true;
    }

    // OTP = last 4 digits of phone (demo only)
    const otp = user.phoneNumber.slice(-4);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return {
      success: true,
      message: 'OTP sent for verification.',
      otp,
      newUser,
      userId: user.id,
    };
  }

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
      otp,
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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpiresAt: null, phoneVerified: true },
    });

    return {
      message: 'OTP verified successfully. Now set or enter PIN.',
      userId: user.id,
    };
  }
  async setPin(userId: string, pin: string) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!pin) {
      throw new BadRequestException('PIN is required');
    }

    // make sure the user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const hashedPin = await bcrypt.hash(pin, 10);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { pin: hashedPin },
    });
    const payload = { id: user.id };
    const token = this.jwtService.sign(payload);

    // 🔎 Fetch PlaidItem (if exists)
    const plaidItem = await this.prisma.plaidItem.findFirst({
      where: { userId: user.id },
    });
    let plaidAccessToken: string | null = null;
    if (plaidItem) {
      plaidAccessToken = plaidItem.accessToken;
    }

    return {
      message: 'PIN set successfully.',
      access_token: token,
      plaidAccessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    };
  }

  async verifyPin(phoneNumber: string, userpin: string) {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });
    console.log('🚀 ~ AuthService ~ verifyPin ~ user:', user);

    if (!user || !user.pin) {
      throw new UnauthorizedException('PIN not set or user not found');
    }

    const isValid = await bcrypt.compare(userpin, user.pin);
    if (!isValid) {
      throw new UnauthorizedException('Invalid PIN');
    }

    const payload = { id: user.id };
    const token = this.jwtService.sign(payload);
    const { pin, stripeConnectId, otpExpiresAt, otpCode, ...other } = user;

    return {
      message: 'Login successful',
      access_token: token,
      user: other,
    };
  }
}
