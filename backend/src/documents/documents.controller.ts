import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors, UsePipes, ValidationPipe, } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DocumentType, DocumentStatusType, ModuleName } from 'src/enum';
import { DocumentsService } from './documents.service';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { SubscriptionGuard } from 'src/guards/subscription.guard';
import { RequireModule } from 'src/decorators/require-module.decorator';
import { CreateDocDto } from './dtos/create-doc.dto';



@Controller('documents')
@RequireModule(ModuleName.INVOICES)
@UseGuards(FirebaseAuthGuard, SubscriptionGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
  ) { }


  @Get('get-docs')
  async getFilteredDocs(
    @Req() request: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('docType') docType?: DocumentType,
    @Query('issuerBusinessNumber') issuerBusinessNumber?: string,
  ) {

    if (!issuerBusinessNumber) {
      throw new BadRequestException('issuerBusinessNumber is required');
    }

    return this.documentsService.getDocuments(issuerBusinessNumber, startDate, endDate, docType);
  }

  @Get('get-doc-lines')
  async getDocLines(
    @Query('issuerBusinessNumber') issuerBusinessNumber: string,
    @Query('docNumber') docNumber: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.documentsService.getDocLinesByDocNumber(issuerBusinessNumber, docNumber);
  }


  @Get('get-setting-doc-by-type/:typeDoc')
  async getSettingDocByType(
    @Param('typeDoc') typeDoc: DocumentType,
    @Query('issuerBusinessNumber') issuerBusinessNumber: string,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;

    try {
      if (typeDoc !== DocumentType.GENERAL) {
        if (!issuerBusinessNumber || !issuerBusinessNumber.trim()) {
          throw new BadRequestException('issuerBusinessNumber is required');
        }
      }
      const { docIndex, generalIndex, isInitial } = await this.documentsService.getCurrentIndexes(userId, typeDoc, issuerBusinessNumber);
      return { docIndex, generalIndex, isInitial };
    } catch (error) {
      throw error;
    }
  }


  @Post('setting-initial-index/:typeDoc')
  async setInitialDocDetails(
    @Param('typeDoc') typeDoc: DocumentType,
    @Body() body: any,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;
    const initialIndex = Number(body.initialIndex);
    const issuerBusinessNumber: string = body.issuerBusinessNumber;

    if (typeof initialIndex !== 'number' || isNaN(initialIndex)) {
      throw new BadRequestException('initialIndex must be a valid number');
    }

    if (!issuerBusinessNumber || !issuerBusinessNumber.trim()) {
      throw new BadRequestException('issuerBusinessNumber is required');
    }

    const docDetails = await this.documentsService.setInitialDocDetails(userId, typeDoc, initialIndex, issuerBusinessNumber);
    return docDetails;
  }


  @Post('create-doc')
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false,
    transformOptions: { enableImplicitConversion: true },
    skipMissingProperties: false,
    exceptionFactory: (errors) => {
      const errorDetails = errors.map(err => {
        const errorInfo: any = {
          property: err.property,
          constraints: err.constraints,
          value: err.value,
          valueType: typeof err.value
        };

        if (err.children && err.children.length > 0) {
          errorInfo.children = err.children.map(child => ({
            property: child.property,
            constraints: child.constraints,
            value: child.value,
            valueType: typeof child.value
          }));
        }

        return errorInfo;
      });

      console.error("❌ VALIDATION ERRORS:");
      console.error(JSON.stringify(errorDetails, null, 2));

      errorDetails.forEach((err, index) => {
        console.error(`  Error ${index + 1}:`);
        console.error(`    Property: ${err.property}`);
        console.error(`    Value: ${JSON.stringify(err.value)} (${err.valueType})`);
        console.error(`    Constraints:`, err.constraints);
        if (err.children) {
          console.error(`    Nested errors:`, err.children);
        }
      });

      return new BadRequestException({
        message: 'Validation failed',
        errors: errorDetails
      });
    }
  }))
  async createDoc(@Body() createDocDto: CreateDocDto, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const transformedData = await this.documentsService.transformDocumentData(createDocDto);
    const result = await this.documentsService.createDoc(transformedData, userId);
    return result;
  }


  @Post('preview-doc')
  @UsePipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false,
    transformOptions: { enableImplicitConversion: true },
    skipMissingProperties: false,
    exceptionFactory: (errors) => {
      const errorDetails = errors.map(err => {
        const errorInfo: any = {
          property: err.property,
          constraints: err.constraints,
          value: err.value,
          valueType: typeof err.value
        };

        if (err.children && err.children.length > 0) {
          errorInfo.children = err.children.map(child => ({
            property: child.property,
            constraints: child.constraints,
            value: child.value,
            valueType: typeof child.value
          }));
        }

        return errorInfo;
      });

      console.error("❌ VALIDATION ERRORS:");
      console.error(JSON.stringify(errorDetails, null, 2));

      errorDetails.forEach((err, index) => {
        console.error(`  Error ${index + 1}:`);
        console.error(`    Property: ${err.property}`);
        console.error(`    Value: ${JSON.stringify(err.value)} (${err.valueType})`);
        console.error(`    Constraints:`, err.constraints);
        if (err.children) {
          console.error(`    Nested errors:`, err.children);
        }
      });

      return new BadRequestException({
        message: 'Validation failed',
        errors: errorDetails
      });
    }
  }))
  async previewDoc(@Body() createDocDto: CreateDocDto, @Res() res: Response, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const transformedData = await this.documentsService.transformDocumentData(createDocDto);
    const pdfBuffer = await this.documentsService.previewDoc(transformedData);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }


  @Post('rollback')
  async rollback(@Body() body: { issuerBusinessNumber: string; generalDocIndex: string }) {
    const { issuerBusinessNumber, generalDocIndex } = body;
    return this.documentsService.rollbackDocumentAndIndexes(issuerBusinessNumber, generalDocIndex);
  }



  @Post('generate-multiple')
  async generateMultipleDocuments(@Body() body: { userId: string }) {
    return this.documentsService.generateMultipleDocs(body.userId);
  }

  @Post('finalize-allocation')
  async finalizeAllocation(
    @Body() body: { issuerBusinessNumber: string; docNumber: string; docType: DocumentType; allocationNum?: string | null },
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.firebaseId;
    const { issuerBusinessNumber, docNumber, docType } = body;
    if (!issuerBusinessNumber || !docNumber || !docType) {
      throw new BadRequestException('issuerBusinessNumber, docNumber and docType are required');
    }
    return this.documentsService.finalizeAllocation(userId, {
      issuerBusinessNumber,
      docNumber,
      docType,
      allocationNum: body.allocationNum ?? null,
    });
  }

  @Patch('update-status')
  async updateDocStatus(
    @Body() body: { issuerBusinessNumber: string; docNumber: string; docType: DocumentType; status: DocumentStatusType },
    @Req() request: AuthenticatedRequest
  ) {
    const { issuerBusinessNumber, docNumber, docType, status } = body;
    if (!issuerBusinessNumber || !docNumber || !docType || !status) {
      throw new BadRequestException('issuerBusinessNumber, docNumber, docType, and status are required');
    }
    return this.documentsService.updateDocStatus(issuerBusinessNumber, docNumber, docType, status);
  }

  @Post('save-draft')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async saveDraft(
    @Body() createDocDto: CreateDocDto,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;
    const transformedData = await this.documentsService.transformDocumentData(createDocDto);
    const draft = await this.documentsService.saveDraft(userId, transformedData);
    return { success: true, draftId: draft.id };
  }

  @Get('load-draft')
  async loadDraft(
    @Query('issuerBusinessNumber') issuerBusinessNumber: string,
    @Query('docType') docType: DocumentType,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;
    if (!issuerBusinessNumber || !docType) {
      throw new BadRequestException('issuerBusinessNumber and docType are required');
    }
    const draft = await this.documentsService.loadDraft(userId, issuerBusinessNumber, docType);
    if (!draft) {
      return { exists: false };
    }
    return { exists: true, draft };
  }

  @Delete('delete-draft')
  async deleteDraft(
    @Query('issuerBusinessNumber') issuerBusinessNumber: string,
    @Query('docType') docType: DocumentType,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;
    if (!issuerBusinessNumber || !docType) {
      throw new BadRequestException('issuerBusinessNumber and docType are required');
    }
    await this.documentsService.deleteDraft(userId, issuerBusinessNumber, docType);
    return { success: true };
  }

  // =====================================================================
  // Drive-folder sync + OCR-extracted documents (Claude)
  // =====================================================================

  @Post('me/process-inbox')
  async processMyInbox(
    @Req() request: AuthenticatedRequest,
    @Body() body: { businessNumber: string },
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new BadRequestException('Not authenticated');
    const businessNumber = body?.businessNumber?.trim();
    if (!businessNumber) throw new BadRequestException('businessNumber is required');
    return this.documentsService.processInboxForUser(firebaseId, businessNumber);
  }

  @Post('me/archive/:documentId')
  async archiveExtractedDoc(
    @Req() request: AuthenticatedRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new BadRequestException('Not authenticated');
    return this.documentsService.archiveDocument(firebaseId, documentId);
  }

  @Post('me/ocr-file')
  @UseInterceptors(FileInterceptor('file'))
  async ocrSingleFile(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { businessNumber?: string },
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new BadRequestException('Not authenticated');
    if (!file?.buffer) throw new BadRequestException('file is required');
    const businessNumber = body?.businessNumber?.trim();
    if (!businessNumber) throw new BadRequestException('businessNumber is required');
    return this.documentsService.ocrSingleFile(
      firebaseId,
      businessNumber,
      file.buffer,
      file.mimetype,
    );
  }

  /** Drop one or more files straight into the business's Drive inbox/
   *  folder — no OCR, just storage. multipart/form-data with `files`
   *  (1..10) + `businessNumber` form field. */
  @Post('me/upload-to-inbox')
  @UseInterceptors(
    FilesInterceptor('files', 10, { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadFilesToInbox(
    @Req() request: AuthenticatedRequest,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { businessNumber?: string },
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new BadRequestException('Not authenticated');
    const businessNumber = body?.businessNumber?.trim();
    if (!businessNumber) throw new BadRequestException('businessNumber is required');
    if (!files?.length) throw new BadRequestException('At least one file is required');
    return this.documentsService.uploadFilesToInbox(firebaseId, businessNumber, files);
  }

  @Get('me/catalog')
  async getMyCatalog(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new BadRequestException('Not authenticated');
    if (!businessNumber?.trim()) {
      throw new BadRequestException('businessNumber query param required');
    }
    return this.documentsService.buildExtractionCatalog(firebaseId, businessNumber.trim());
  }

  @Get('me/review')
  async listMyReviewable(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new BadRequestException('Not authenticated');
    if (!businessNumber?.trim()) {
      throw new BadRequestException('businessNumber query param required');
    }
    return this.documentsService.getReviewableForUser(firebaseId, businessNumber.trim());
  }

  @Get('me/archived')
  async listMyArchived(
    @Req() request: AuthenticatedRequest,
    @Query('businessNumber') businessNumber: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new BadRequestException('Not authenticated');
    if (!businessNumber?.trim()) {
      throw new BadRequestException('businessNumber query param required');
    }
    return this.documentsService.getArchivedForUser(firebaseId, businessNumber.trim());
  }

}
