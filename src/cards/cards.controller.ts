import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  async create(@Req() req, @Body() createCardDto: CreateCardDto) {
    const userId = req.user.id;
    return this.cardsService.create(userId, createCardDto);
  }

  @Get()
  async findAll(@Req() req) {
    const userId = req.user.id;
    return this.cardsService.findAll(userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.cardsService.findOne(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.cardsService.remove(id);
  }
}
