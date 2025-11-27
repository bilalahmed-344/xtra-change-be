import { Injectable, OnModuleInit } from '@nestjs/common';
import { initializeApp, getApps, getApp, App, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private userApp: App;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const configPath = path.resolve(
      process.cwd(),
      'src/config/firebase/user.json',
    );

    if (!fs.existsSync(configPath)) {
      throw new Error(`User Firebase config not found at: ${configPath}`);
    }

    const existingApp = getApps().find((app) => app.name === 'user');

    this.userApp =
      existingApp ||
      initializeApp(
        {
          credential: cert(require(configPath)),
        },
        'user',
      );
    console.log('🔥 Firebase (user app) initialized successfully');
  }

  async sendNotification(
    userId: string,
    token: string,
    title: string,
    body: string,
  ) {
    if (!token) {
      console.error('❌ No FCM token provided');
      return;
    }
    const app = this.userApp;

    const message = {
      token,
      notification: { title, body },
    };

    try {
      const response = await getMessaging(app).send(message);
      console.log('Notification sent:', response);

      await this.prisma.notifications.create({
        data: {
          userId,
          title,
          message: body,
        },
      });
      return response;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }
  async getUserNotifications(userId: string, skip = 0, take = 10) {
    return this.prisma.notifications.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }
}
