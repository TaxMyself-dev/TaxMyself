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
import { AnnualReportService } from './annual-report.service';
import { GetOrCreateAnnualReportDto } from './dtos/get-or-create.dto';
import { SaveAnswersDto } from './dtos/save-answers.dto';
import { UploadFileDto } from './dtos/upload-file.dto';
import { SetReportedDto } from './dtos/set-reported.dto';

@Controller('annual-report')
@UseGuards(FirebaseAuthGuard)
export class AnnualReportController {
  constructor(private readonly service: AnnualReportService) {}

  @Get('questions')
  getQuestions() {
    return this.service.getQuestionSchema();
  }

  @Get()
  async getOrCreate(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetOrCreateAnnualReportDto,
  ) {
    const firebaseId = this.getFirebaseId(request);
    return this.service.getOrCreate(firebaseId, query.businessNumber, query.taxYear);
  }

  @Patch(':id/answers')
  async saveAnswers(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SaveAnswersDto,
  ) {
    const firebaseId = this.getFirebaseId(request);
    const reportId = this.parseId(id);
    return this.service.saveAnswers(firebaseId, reportId, dto.answers);
  }

  @Post(':id/files')
  @HttpCode(HttpStatus.CREATED)
  async addFile(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UploadFileDto,
  ) {
    const firebaseId = this.getFirebaseId(request);
    const reportId = this.parseId(id);
    return this.service.addFile(firebaseId, reportId, dto);
  }

  @Delete('files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFile(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
  ) {
    const firebaseId = this.getFirebaseId(request);
    await this.service.removeFile(firebaseId, this.parseId(fileId));
  }

  @Post(':id/finish')
  async finish(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const firebaseId = this.getFirebaseId(request);
    return this.service.finish(firebaseId, this.parseId(id));
  }

  @Patch(':id/reported')
  async setReported(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SetReportedDto,
  ) {
    const firebaseId = this.getFirebaseId(request);
    return this.service.setReported(firebaseId, this.parseId(id), dto.reported);
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
