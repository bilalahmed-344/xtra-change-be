import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dtos/signup.dto';
import { LoginDto } from './dtos/login.dto';
import { Public } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signin')
  async signInOrSignUp(@Body() dto: SignupDto | LoginDto) {
    return this.authService.signInOrSignUp(dto);
  }

  // @Post('signup')
  // async signUp(@Body() signupDto: SignupDto) {
  //   return this.authService.signup(signupDto);
  // }
  // @Public()
  // @Post('login')
  // async login(@Body() loginDto: LoginDto) {
  //   return this.authService.login(loginDto);
  // }
  @Public()
  @Post('verify-otp')
  async verifyOtp(
    @Body('phoneNumber') phoneNumber: string,
    @Body('code') code: string,
  ) {
    return this.authService.verifyOtp(phoneNumber, code);
  }

  @Public()
  @Post('set-pin')
  async setPin(@Body('userId') userId: string, @Body('pin') pin: string) {
    return this.authService.setPin(userId, pin);
  }

  @Public()
  @Post('verify-pin')
  async verifyPin(
    @Body('phoneNumber') phoneNumber: string,
    @Body('pin') pin: string,
  ) {
    return this.authService.verifyPin(phoneNumber, pin);
  }
}
