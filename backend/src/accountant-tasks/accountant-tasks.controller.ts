import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { UsersService } from 'src/users/users.service';
import { AccountantTasksService } from './accountant-tasks.service';
import { TasksGeneratorService } from './tasks-generator.service';
import { CreateTaskDto } from './dtos/create-task.dto';
import { UpdateTaskDto } from './dtos/update-task.dto';
import { QueryTasksDto } from './dtos/query-tasks.dto';

@Controller('accountant-tasks')
@UseGuards(FirebaseAuthGuard)
export class AccountantTasksController {
  constructor(
    private readonly tasksService: AccountantTasksService,
    private readonly tasksGeneratorService: TasksGeneratorService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query() query: QueryTasksDto) {
    const accountantId = await this.getAccountantId(request);
    return this.tasksService.list(accountantId, query);
  }

  /**
   * Manually trigger the periodic-task generator. Idempotent — re-running on the
   * same day creates no duplicates (unique index on (businessNumber, type, periodStart, periodEnd)).
   * ACCOUNTANT-only. Same logic the daily cron runs in handleDailyTask().
   */
  @Post('generate')
  async runGeneration(@Req() request: AuthenticatedRequest) {
    await this.getAccountantId(request);
    return this.tasksGeneratorService.generateForToday(new Date());
  }

  /**
   * One-shot migration: ensure every VAT/ADVANCE_TAX AccountantTask row has a paired
   * ReportWorkflow row. Idempotent — re-running is a no-op. Run once after the
   * collaboration feature ships, then forget about it.
   */
  @Post('backfill-workflows')
  async backfillWorkflows(@Req() request: AuthenticatedRequest) {
    await this.getAccountantId(request);
    return this.tasksGeneratorService.backfillWorkflows();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTaskDto) {
    const accountantId = await this.getAccountantId(request);
    return this.tasksService.create(accountantId, dto);
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const accountantId = await this.getAccountantId(request);
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) throw new BadRequestException('Invalid task ID');
    return this.tasksService.update(accountantId, taskId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const accountantId = await this.getAccountantId(request);
    const taskId = parseInt(id, 10);
    if (isNaN(taskId)) throw new BadRequestException('Invalid task ID');
    await this.tasksService.remove(accountantId, taskId);
  }

  private async getAccountantId(request: AuthenticatedRequest): Promise<string> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new ForbiddenException('לא אותחל משתמש');
    const isAccountant = await this.usersService.isAccountant(firebaseId);
    if (!isAccountant) throw new ForbiddenException('גישה מותרת רק לרואה חשבון');
    return firebaseId;
  }
}
