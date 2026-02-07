import { Controller, Get, Put, Post, Param, Body, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { AgentAuthGuard, AgentRequest } from '../guards/agent-auth.guard';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { AgentsService } from './agents.service';
import { RegisterCustomerDto } from './dtos/register-customer.dto';
import { CreateDocDto } from '../documents/dtos/create-doc.dto';
import { UsersService } from '../users/users.service';
import { UsePipes, ValidationPipe } from '@nestjs/common';

@Controller('agent')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly usersService: UsersService,
  ) {}

  @Get('ping')
  @UseGuards(AgentAuthGuard)
  async ping(@Req() request: AgentRequest) {
    return { ok: true };
  }

  @Put('customers/:externalCustomerId')
  @UseGuards(AgentAuthGuard)
  async registerCustomer(
    @Param('externalCustomerId') externalCustomerId: string,
    @Body() dto: RegisterCustomerDto,
    @Req() request: AgentRequest,
  ) {
    if (!request.agent?.id) {
      throw new Error('Agent ID not found in request');
    }

    return this.agentsService.registerCustomer(
      request.agent.id,
      externalCustomerId,
      dto,
    );
  }

  @Post('admin/add')
  @UseGuards(FirebaseAuthGuard)
  async addAgent(
    @Body() body: { name: string },
    @Req() request: AuthenticatedRequest,
  ) {
    const firebaseId = request.user?.firebaseId;

    // Check if user is admin
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) {
      throw new HttpException('Admin access required', HttpStatus.FORBIDDEN);
    }

    return await this.agentsService.addAgent(body.name);
  }

  @Post('customers/:externalCustomerId/documents')
  @UseGuards(AgentAuthGuard)
  @UsePipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true,
    forbidNonWhitelisted: false,
    transformOptions: { enableImplicitConversion: true },
    skipMissingProperties: false,
  }))
  async createDocument(
    @Param('externalCustomerId') externalCustomerId: string,
    @Body() createDocDto: CreateDocDto,
    @Req() request: AgentRequest,
  ) {
    if (!request.agent?.id) {
      throw new HttpException('Agent ID not found in request', HttpStatus.BAD_REQUEST);
    }

    return await this.agentsService.createDocumentForCustomer(
      request.agent.id,
      externalCustomerId,
      createDocDto,
    );
  }
}

