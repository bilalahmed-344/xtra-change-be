import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MulterModule } from '@nestjs/platform-express';
import { CloudinaryConfigService } from 'src/cloudinary/cloudinary.provider';

@Module({
  imports: [
    PrismaModule,
    MulterModule.registerAsync({
      useClass: CloudinaryConfigService,
    }),
  ],
  controllers: [UserController],
  providers: [UserService, PrismaService],
  exports: [UserService],
})
export class UserModule {}
