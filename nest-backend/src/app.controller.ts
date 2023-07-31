import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('signup')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post()
  signup(): string {
    return '7';
  }
}
