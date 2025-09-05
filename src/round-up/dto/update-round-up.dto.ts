import { PartialType } from '@nestjs/mapped-types';
import { CreateRoundUpDto } from './create-round-up.dto';

export class UpdateRoundUpDto extends PartialType(CreateRoundUpDto) {}
