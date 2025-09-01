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
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dtos/updateUser.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.userService.findOneById(id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file && file.path) {
      updateUserDto.profilePic = file.path;
    }
    return this.userService.updateUser(id, updateUserDto);
  }
}
