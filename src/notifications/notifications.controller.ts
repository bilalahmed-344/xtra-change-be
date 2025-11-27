import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('send')
  async send(@Req() req, @Body() body: { title: string; message: string }) {
    const userid = await req.user?.id;

    const user = await this.prisma.user.findUnique({
      where: { id: userid },
      select: { fcmToken: true },
    });
    if (!user?.fcmToken) {
      return { message: 'User does not have an FCM token.' };
    }
    return this.notificationService.sendNotification(
      userid,
      user.fcmToken,
      body.title,
      body.message,
    );
  }
}
