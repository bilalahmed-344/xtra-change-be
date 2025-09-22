import {
  Controller,
  Get,
  Param,
  Body,
  Patch,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  Post,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dtos/updateUser.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Get()
  async getUser(@Req() req) {
    const userId = req.user.id;
    return this.userService.findOneById(userId);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  async updateUser(
    @Req() req,
    // @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = req.user.id;

    if (file && file.path) {
      updateUserDto.profilePic = file.path;
    }
    return this.userService.updateUser(userId, updateUserDto);
  }
}
