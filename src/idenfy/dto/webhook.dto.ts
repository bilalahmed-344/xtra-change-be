export class WebhookDto {
  sessionId: string;
  status: string;
  userId: string;
  // plus other fields from provider callback
  [key: string]: any;
}
