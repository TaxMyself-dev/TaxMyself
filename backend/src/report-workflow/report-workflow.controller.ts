import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { ReportWorkflowService } from './report-workflow.service';
import { ListWorkflowsDto } from './dtos/list-workflows.dto';
import { SetReportedDto } from './dtos/set-reported.dto';
import { ReportedSource } from './report-workflow.entity';

@Controller('report-workflows')
@UseGuards(FirebaseAuthGuard)
export class ReportWorkflowController {
  constructor(private readonly service: ReportWorkflowService) {}

  /** Client lists their own workflows (filter applied server-side by req.user). */
  @Get('me')
  async listMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListWorkflowsDto,
  ) {
    const firebaseId = this.getFirebaseId(request);
    return this.service.listForClient(firebaseId, query);
  }

  @Get(':id')
  async getOne(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const firebaseId = this.getFirebaseId(request);
    return this.service.getById(firebaseId, this.parseId(id));
  }

  /** Client confirms they uploaded all docs for the period. */
  @Post(':id/confirm')
  async confirm(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const firebaseId = this.getFirebaseId(request);
    return this.service.confirm(firebaseId, this.parseId(id));
  }

  /** Stream the stored as-filed report PDF for a workflow. */
  @Get(':id/report-file')
  async getReportFile(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const firebaseId = this.getFirebaseId(request);
    const { buffer, filename } = await this.service.getReportFile(
      firebaseId,
      this.parseId(id),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"`,
    );
    res.send(buffer);
  }

  /**
   * Self-served client dismisses (soft-deletes) one of their workflows.
   * Service rejects the call when the client has an active delegation.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    const firebaseId = this.getFirebaseId(request);
    await this.service.dismiss(firebaseId, this.parseId(id));
  }

  /** Accountant marks the workflow as reported (or unmarks it). */
  @Patch(':id/reported')
  async setReported(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SetReportedDto,
  ) {
    const firebaseId = this.getFirebaseId(request);
    return this.service.setReported({
      workflowId: this.parseId(id),
      reported: dto.reported,
      source: dto.source ?? ReportedSource.MANUAL_ACCOUNTANT,
      actorFirebaseId: firebaseId,
    });
  }

  private getFirebaseId(request: AuthenticatedRequest): string {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new ForbiddenException('לא אותחל משתמש');
    return firebaseId;
  }

  private parseId(value: string): number {
    const n = parseInt(value, 10);
    if (isNaN(n)) throw new BadRequestException('Invalid id');
    return n;
  }
}
