import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class S3Service {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const bucket = this.configService.get<string>('AWS_S3_BUCKET_NAME');

    if (!region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('Missing AWS S3 environment variables');
    }

    this.s3 = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.bucket = bucket;
  }

  async uploadFile(file: Express.Multer.File) {
    const fileKey = `uploads/${randomUUID()}${path.extname(file.originalname)}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      url: `https://${this.bucket}.s3.${this.configService.get<string>('AWS_REGION')}.amazonaws.com/${fileKey}`,
      key: fileKey,
    };
  }

  async deleteFile(fileKey: string) {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      }),
    );
    return { message: 'File deleted successfully' };
  }
}
