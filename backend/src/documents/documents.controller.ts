import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards, UsePipes, ValidationPipe, } from '@nestjs/common';
import { Response } from 'express';
import { DocumentType, DocumentStatusType } from 'src/enum';
import { DocumentsService } from './documents.service';
import { UsersService } from 'src/users/users.service';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { log } from 'node:console';
import { CreateDocDto } from './dtos/create-doc.dto';



@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
  ) { }


  @Get('get-docs')
  @UseGuards(FirebaseAuthGuard)
  async getFilteredDocs(
    @Req() request: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('docType') docType?: DocumentType,
    @Query('issuerBusinessNumber') issuerBusinessNumber?: string, // optional query param
  ) {

    if (!issuerBusinessNumber) {
      throw new BadRequestException('issuerBusinessNumber is required');
    }

    return this.documentsService.getDocuments(issuerBusinessNumber, startDate, endDate, docType);
  }

  @Get('get-doc-lines')
  @UseGuards(FirebaseAuthGuard)
  async getDocLines(
    @Query('issuerBusinessNumber') issuerBusinessNumber: string,
    @Query('docNumber') docNumber: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.documentsService.getDocLinesByDocNumber(issuerBusinessNumber, docNumber);
  }


  @Get('get-setting-doc-by-type/:typeDoc')
  @UseGuards(FirebaseAuthGuard)
  async getSettingDocByType(
    @Param('typeDoc') typeDoc: DocumentType,
    @Query('issuerBusinessNumber') issuerBusinessNumber: string,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;

    try {
      // For non-GENERAL types, a valid issuerBusinessNumber is required
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
  @UseGuards(FirebaseAuthGuard)
  async setInitialDocDetails(
    @Param('typeDoc') typeDoc: DocumentType,
    @Body() body: any,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;
    const initialIndex = Number(body.initialIndex);
    const issuerBusinessNumber: string = body.issuerBusinessNumber;
    console.log("🚀 ~ DocumentsController ~ setInitialDocDetails ~ issuerBusinessNumber:", issuerBusinessNumber)

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
  @UseGuards(FirebaseAuthGuard)
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
      
      // Log each error separately for clarity
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
    console.log("createDoc in controller - start");
    console.log("📦 Received and validated DTO");
    const userId = request.user?.firebaseId;

    console.log("🚀 ~ DocumentsController ~ createDoc ~ createDocDto:", createDocDto);
    
    // Transform the DTO data before passing to service
    const transformedData = await this.documentsService.transformDocumentData(createDocDto);
    
    const result = await this.documentsService.createDoc(transformedData, userId);
    return result;
  }


  @Post('preview-doc')
  @UseGuards(FirebaseAuthGuard)
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
        
        // Log nested errors
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
      
      // Log each error separately for clarity
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
    console.log("previewDoc in controller - start");
    console.log("📦 Received and validated DTO");
    const userId = request.user?.firebaseId;
    
    // Transform the DTO data before passing to service
    const transformedData = await this.documentsService.transformDocumentData(createDocDto);
    
    const pdfBuffer = await this.documentsService.previewDoc(transformedData);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }
  

  @Post('rollback')
  @UseGuards(FirebaseAuthGuard)
  async rollback(@Body() body: { issuerBusinessNumber: string; generalDocIndex: string }) {
    const { issuerBusinessNumber, generalDocIndex } = body;
    return this.documentsService.rollbackDocumentAndIndexes(issuerBusinessNumber, generalDocIndex);
  }


  @Post('generate-pdf')
  @UseGuards(FirebaseAuthGuard)
  async generatePDF(@Body() body: any, @Res() res: Response, @Req() request: AuthenticatedRequest) {    
    const pdfBuffer = await this.documentsService.generatePDF(body, "pnlReport");
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }

  
  @Post('generate-multiple')
  async generateMultipleDocuments(@Body() body: { userId: string }) {
    return this.documentsService.generateMultipleDocs(body.userId);
  }

  @Patch('update-status')
  @UseGuards(FirebaseAuthGuard)
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


}