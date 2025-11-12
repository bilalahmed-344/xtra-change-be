import {
  Controller,
  Get,
  Body,
  Patch,
  UploadedFile,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dtos/updateUser.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Service } from 'src/s3/s3.service';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly s3Service: S3Service,
  ) {}
  @Get()
  async getUser(@Req() req) {
    const userId = req.user.id;
    return this.userService.findOneById(userId);
  }

  @Patch()
  @UseInterceptors(FileInterceptor('file'))
  async updateUser(
    @Req() req,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = req.user.id;
    if (file) {
      const uploaded = await this.s3Service.uploadFile(file);
      updateUserDto.profilePic = uploaded.url;
    }

    return this.userService.updateUser(userId, updateUserDto);
  }
}
