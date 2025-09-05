import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { MulterModule } from '@nestjs/platform-express';
import { CloudinaryConfigService } from './cloudinary/cloudinary.provider';
import { CardsModule } from './cards/cards.module';
import { StripeModule } from './stripe/stripe.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MulterModule.registerAsync({
      useClass: CloudinaryConfigService,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    CardsModule,
    StripeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
