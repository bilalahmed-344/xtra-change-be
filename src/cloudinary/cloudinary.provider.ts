import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import {
  MulterOptionsFactory,
  MulterModuleOptions,
} from '@nestjs/platform-express';

cloudinary.config({
  cloud_name: 'dpyxsusph',
  api_key: '588724539765789',
  api_secret: 'mIPBiXu1S3R6_lTk-jRf3l8Tez4',
});

export class CloudinaryConfigService implements MulterOptionsFactory {
  createMulterOptions(): MulterModuleOptions {
    const storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: async (req, file) => {
        return {
          folder: 'nest_uploads',
          allowed_formats: ['jpg', 'png', 'jpeg'],
        };
      },
    });

    return {
      storage,
    };
  }
}
