import { Controller, Post, Get, Req, UseInterceptors } from '@nestjs/common';
import { Request } from 'express';
import { CloudService } from './cloud.service';

@Controller('my-cloud')
export class CloudController {
  constructor(private readonly cloudService: CloudService) {}

  @Get('search')
  async searchExpenses(@Req() request: Request) {
    //const userId = await this.usersService.getFirbsaeIdByToken(token)
    
    const userId = "L5gJkrdQZ5gGmte5XxRgagkqpOL2"
  
    //const userId = request.user.id; // Assuming you have user information in the request (e.g., from a session or token)
    const { startDate, endDate, supplier, category } = request.query;

    // Convert startDate and endDate to Date objects if they exist
    const parsedStartDate = startDate ? new Date(startDate as string) : undefined;
    const parsedEndDate = endDate ? new Date(endDate as string) : undefined;

    return this.cloudService.searchExpenses(
      userId,
      parsedStartDate,
      parsedEndDate,
      supplier as string,
      category as string,
    );
  }
}