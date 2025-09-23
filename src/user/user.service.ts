import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserDto } from './dtos/updateUser.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOneById(id: string) {
    let user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }
    if (updateUserDto.email) {
      const userWithSameEmail = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (userWithSameEmail && userWithSameEmail.id !== id) {
        throw new ConflictException('Email is already in use');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateUserDto,
      },
    });

    const { stripeCustomerId, ...otherUpdatedUser } = updatedUser;
    return {
      message: 'User updated successfully',
      user: otherUpdatedUser,
    };
  }
}
