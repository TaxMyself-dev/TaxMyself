import { Injectable, HttpException, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { EntityManager, Repository, In } from 'typeorm';
import { SettingDocuments } from './settingDocuments.entity';
import { Documents } from './documents.entity';
import { DocLines } from './doc-lines.entity';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from 'src/bookkeeping/account.entity'
import { DocumentType, DocumentStatusType, PaymentMethodType, VatOptions, Currency, UnitOfMeasure, CardCompany, CreditTransactionType, BusinessType } from 'src/enum';
import { Business } from 'src/business/business.entity';
import { SharedService } from 'src/shared/shared.service';
import { BookkeepingService } from 'src/bookkeeping/bookkeeping.service';
import { DocPayments } from './doc-payments.entity';
import { DataSource } from 'typeorm';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CreateDocDto } from './dtos/create-doc.dto';
import { BusinessService } from 'src/business/business.service';
import { MailService } from 'src/mail/mail.service';
import { User } from 'src/users/user.entity';

@Injectable()
export class DocumentsService {

  private readonly apiClient: AxiosInstance;
  sessionID: string;

  constructor(
    private readonly sharedService: SharedService,
    private readonly businessService: BusinessService,
    private readonly bookkeepingService: BookkeepingService,
    private readonly mailService: MailService,
    @InjectRepository(SettingDocuments)
    private settingDocuments: Repository<SettingDocuments>,
    @InjectRepository(Documents)
    private documentsRepo: Repository<Documents>,
    @InjectRepository(DocLines)
    private docLinesRepo: Repository<DocLines>,
    @InjectRepository(DocPayments)
    private docPaymentsRepo: Repository<DocPayments>,
    @InjectRepository(JournalEntry)
    private journalEntryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private journalLineRepo: Repository<JournalLine>,
    @InjectRepository(DefaultBookingAccount)
    private defaultBookingAccountRepo: Repository<DefaultBookingAccount>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private dataSource: DataSource
  ) { }

  isIncrement: boolean = false;
  isGeneralIncrement: boolean = false;


  async getDocuments(
    issuerBusinessNumber: string,
    startDate?: string,
    endDate?: string,
    docType?: DocumentType
  ): Promise<Documents[]> {

    // -------------------------------
    // 1) Convert dates safely
    // -------------------------------
    let startDateSql: Date | null = null;
    let endDateSql: Date | null = null;

    if (startDate && typeof startDate === 'string') {
      try {
        startDateSql = this.sharedService.convertStringToDateObject(startDate);
      } catch {
        console.warn("Invalid startDate format:", startDate);
      }
    }

    if (endDate && typeof endDate === 'string') {
      try {
        endDateSql = this.sharedService.convertStringToDateObject(endDate);
      } catch {
        console.warn("Invalid endDate format:", endDate);
      }
    }

    // -------------------------------
    // 2) Base Query
    // -------------------------------
    const query = this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :issuerBusinessNumber', { issuerBusinessNumber });

    // docType filter
    if (docType) {
      query.andWhere('doc.docType = :docType', { docType });
    }

    // -------------------------------
    // 3) Date logic
    // -------------------------------
    const hasDateFilter = !!startDateSql || !!endDateSql;
    const hasDocTypeFilter = !!docType;

    // Case 1: User provided real date filters
    if (startDateSql && endDateSql) {
      query.andWhere('doc.docDate BETWEEN :start AND :end', {
        start: startDateSql,
        end: endDateSql,
      });
    }
    else if (startDateSql) {
      query.andWhere('doc.docDate >= :start', { start: startDateSql });
    }
    else if (endDateSql) {
      query.andWhere('doc.docDate <= :end', { end: endDateSql });
    }
    else {
      // Case 2: NO DATES PROVIDED
      if (!hasDocTypeFilter) {
        // --------- ⭐ RETURN ALL DOCS ⭐ ---------
        // Do NOT add any date filter
      } else {
        // Case 3: No dates but YES docType → default range
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        query.andWhere('doc.docDate BETWEEN :start AND :end', {
          start: startOfYear,
          end: now,
        });
      }
    }

    // -------------------------------
    // 4) Execute
    // -------------------------------
    const docs = await query.getMany();

    return docs;
  }

  async getDocLinesByDocNumber(
    issuerBusinessNumber: string,
    docNumber: string,
  ): Promise<DocLines[]> {
    if (!issuerBusinessNumber || !issuerBusinessNumber.trim()) {
      throw new BadRequestException('issuerBusinessNumber is required');
    }
    if (!docNumber || !docNumber.trim()) {
      throw new BadRequestException('docNumber is required');
    }

    const doc = await this.documentsRepo.findOne({
      where: { issuerBusinessNumber, docNumber },
      select: ['generalDocIndex'],
    });

    if (!doc?.generalDocIndex) {
      throw new NotFoundException('Document not found for given issuer and docNumber');
    }

    return this.docLinesRepo.find({
      where: {
        issuerBusinessNumber,
        generalDocIndex: doc.generalDocIndex,
      },
      order: { lineNumber: 'ASC' },
    });
  }


  async getSettingDocByType(userId: string, docType: DocumentType) {

    try {
      const docDetails = await this.settingDocuments.findOne({ where: { userId, docType } });
      if (!docDetails) {
        throw new NotFoundException("not found userId or documentType")
      }
      return docDetails;
    }
    catch (error) {
      throw error;
    }
  }

  /**
   * Upload a PDF buffer to Firebase Storage
   * @returns fullPath in Firebase Storage
   */
  private async uploadToFirebase(
    pdfBuffer: Buffer,
    issuerBusinessNumber: string,
    generalDocIndex: string,
    docType: string,
    fileName: string,
    fileType: 'original' | 'copy'
  ): Promise<string> {

    try {
      const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
      const uniqueId = randomUUID();
      const filePath = `systemDocs/${issuerBusinessNumber}/${docType}/${fileType}/${uniqueId}/${fileName}.pdf`;
      const file = bucket.file(filePath);
      await file.save(pdfBuffer, {
        metadata: {
          contentType: 'application/pdf',
        },
      });

      return filePath; // Return the fullPath
    } catch (error) {
      console.log('Error uploading to Firebase:', error);
      throw new HttpException(
        {
          message: 'Failed to upload PDF to Firebase',
          error: error.message || error.toString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete a file from Firebase Storage (best-effort, no throw)
   */
  private async deleteFromFirebase(fullPath: string): Promise<void> {
    try {
      const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
      await bucket.file(fullPath).delete();
      console.log(`Deleted Firebase file: ${fullPath}`);
    } catch (error) {
      console.error(`Failed to delete Firebase file: ${fullPath}`, error);
    }
  }

  /**
   * Download a file from Firebase Storage
   */
  private async downloadFromFirebase(filePath: string): Promise<Buffer> {
    try {
      const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
      const file = bucket.file(filePath);
      const [buffer] = await file.download();
      return buffer;
    } catch (error) {
      console.error(`Failed to download Firebase file: ${filePath}`, error);
      throw new HttpException(
        `Failed to download file from Firebase: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async rollbackDocumentAndIndexes(
    issuerBusinessNumber: string,
    generalDocIndex: string,
  ): Promise<{ rolledBack: boolean }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const documentsRepo = queryRunner.manager.getRepository(Documents);
      const docLinesRepo = queryRunner.manager.getRepository(DocLines);
      const docPaymentsRepo = queryRunner.manager.getRepository(DocPayments);
      const settingsRepo = queryRunner.manager.getRepository(SettingDocuments);

      const doc = await documentsRepo.findOne({ where: { issuerBusinessNumber, generalDocIndex } });
      if (!doc) {
        throw new NotFoundException('Document not found to rollback');
      }

      const docType = doc.docType;

      // Delete Firebase files if they exist (best-effort)
      if (doc.file) {
        await this.deleteFromFirebase(doc.file);
      }
      if (doc.copyFile) {
        await this.deleteFromFirebase(doc.copyFile);
      }

      await docPaymentsRepo.delete({ issuerBusinessNumber, generalDocIndex });
      await docLinesRepo.delete({ issuerBusinessNumber, generalDocIndex });
      await documentsRepo.delete({ issuerBusinessNumber, generalDocIndex });

      const generalSetting = await settingsRepo.findOne({ where: { issuerBusinessNumber, docType: DocumentType.GENERAL } });
      if (generalSetting && generalSetting.currentIndex > generalSetting.initialIndex) {
        generalSetting.currentIndex -= 1;
        await settingsRepo.save(generalSetting);
      }

      const typeSetting = await settingsRepo.findOne({ where: { issuerBusinessNumber, docType } });
      if (typeSetting && typeSetting.currentIndex > typeSetting.initialIndex) {
        typeSetting.currentIndex -= 1;
        if (typeSetting.currentIndex === typeSetting.initialIndex) {
          await settingsRepo.delete({ issuerBusinessNumber, docType });
        } else {
          await settingsRepo.save(typeSetting);
        }
      }

      await queryRunner.commitTransaction();
      return { rolledBack: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getCurrentIndexes(
    userId: string,
    docType: DocumentType,
    issuerBusinessNumber: string,
  ): Promise<{ docIndex: number; generalIndex: number; isInitial: boolean }> {
    if (docType !== DocumentType.GENERAL) {
      if (!issuerBusinessNumber || !issuerBusinessNumber.trim()) {
        throw new BadRequestException('issuerBusinessNumber is required');
      }
    }
    const [docSetting, generalSetting] = await Promise.all([
      this.settingDocuments.findOne({ where: { userId, issuerBusinessNumber, docType } }),
      this.settingDocuments.findOne({ where: { userId, issuerBusinessNumber, docType: DocumentType.GENERAL } }),
    ]);

    const docIndex = docSetting?.currentIndex ?? 0;                // 0 means uninitialized
    const generalIndex = generalSetting?.currentIndex ?? 1000001;  // 1000001 means is the first doc
    const isInitial = !docSetting || docIndex === 0 || docIndex == null;

    return {
      docIndex,
      generalIndex,
      isInitial,
    };
  }



  async setInitialDocDetails(userId: string, docType: DocumentType, initialIndex: number, issuerBusinessNumber: string) {

    try {
      if (docType !== DocumentType.GENERAL) {
        if (!issuerBusinessNumber || !issuerBusinessNumber.trim()) {
          throw new BadRequestException('issuerBusinessNumber is required');
        }
      }
      await this.settingGeneralIndex(userId, issuerBusinessNumber);
      let docDetails = await this.settingDocuments.findOne({ where: { userId, issuerBusinessNumber, docType } });
      if (!docDetails) {
        docDetails = await this.settingDocuments.save({ userId, issuerBusinessNumber, docType, initialIndex, currentIndex: initialIndex });
        if (!docDetails) {
          throw new HttpException('Error in save', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }
      return docDetails;
    }
    catch (error) {
      throw error;
    }
  }

  async settingGeneralIndex(userId: string, issuerBusinessNumber: string) {
    let generalIndex: any;
    generalIndex = await this.settingDocuments.findOne({ where: { userId, issuerBusinessNumber, docType: DocumentType.GENERAL } });
    if (!generalIndex) {
      generalIndex = await this.settingDocuments.insert({ userId, issuerBusinessNumber, docType: DocumentType.GENERAL, initialIndex: 1000000, currentIndex: 1000000 });
      if (!generalIndex) {
        throw new HttpException('Error in add general serial number', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }


  async incrementGeneralIndex(userId: string, issuerBusinessNumber: string, manager?: EntityManager): Promise<SettingDocuments> {
    try {
      const repo = manager
        ? manager.getRepository(SettingDocuments)
        : this.settingDocuments;

      let generalIndex = await repo.findOne({
        where: { userId, issuerBusinessNumber, docType: DocumentType.GENERAL },
      });

      if (!generalIndex) {
        // First-time setup: initialize with default starting value
        generalIndex = repo.create({
          userId,
          issuerBusinessNumber,
          docType: DocumentType.GENERAL,
          initialIndex: 1000001,
          currentIndex: 1000002,
        });
      } else {
        // Increment normally
        generalIndex.currentIndex += 1;
      }

      const updated = await repo.save(generalIndex);
      this.isGeneralIncrement = true;

      return updated;
    } catch (error) {
      throw error;
    }
  }


  async generatePDF(data: any, templateType: string, isCopy: boolean = false): Promise<Blob> {

    const isProduction = process.env.NODE_ENV === 'production';

    console.log("data is ", data);

    
    // FID mapping based on environment and document type
    const fidMap = {
      // Production FIDs
      prod: {
        receipt: 'EaHjg6fsRL',
        // invoice: 'AKmqQkevbM',           // TAX_INVOICE, TRANSACTION_INVOICE, CREDIT_INVOICE
        invoice: 'TrBvfW6p6P'
      },
      // Development FIDs
      dev: {
        receipt: '95gqltPdeC',          // RECEIPT, TAX_INVOICE_RECEIPT (with payments)
        invoice: 'zjnzfjd1K3',           // TAX_INVOICE, TRANSACTION_INVOICE, CREDIT_INVOICE (no payments)
      }
    };

    let fid: string;
    let prefill_data: any;

    const url = 'https://api.fillfaster.com/v1/generatePDF';
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';
    const docType = data.docData.docType;

    // Read draft image and convert to base64 only for previewDoc
    let draftImageBase64: string | null = null;
    if (templateType === 'previewDoc') {
      try {
        const draftImagePath = path.resolve(__dirname, '..', 'assets', 'draft.jpeg');
        // const draftImagePath = path.join(__dirname, '..', '..', 'src', 'assets', 'draft.jpeg');
        const imageBuffer = fs.readFileSync(draftImagePath);
        draftImageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      } catch (error) {
        console.error('❌ Error reading draft image:', error);
      }
    }

    switch (templateType) {
      case 'createDoc':
      case 'previewDoc':
        const envFids = isProduction ? fidMap.prod : fidMap.dev;
        if (['RECEIPT', 'TAX_INVOICE_RECEIPT'].includes(docType)) {
          fid = envFids.receipt;
        } else if (['TAX_INVOICE', 'TRANSACTION_INVOICE', 'CREDIT_INVOICE'].includes(docType)) {
          fid = envFids.invoice;
        } else {
          fid = 'UNKNOWN FID';
        }

        const hebrewNameDoc = data.docData.docType === DocumentType.RECEIPT ? 'קבלה' : 
                              data.docData.docType === DocumentType.TAX_INVOICE ? 'חשבונית מס' :
                              data.docData.docType === DocumentType.TAX_INVOICE_RECEIPT ? 'חשבונית מס קבלה' :
                              data.docData.docType === DocumentType.TRANSACTION_INVOICE ? 'חשבון עסקה' :
                              data.docData.docType === DocumentType.CREDIT_INVOICE ? 'חשבונית זיכוי' : '';
        prefill_data = {
          recipientName: data.docData.recipientName,
          recipientTaxNumber: data.docData.recipientId ? `מ.ע. / ח.פ.:  ${data.docData.recipientId}` : null,
          docTitle: `${hebrewNameDoc} מספר ${data.docData.docNumber}`,
          docSubtitle: data.docData.docSubtitle ?? null,
          allocationNum: data.docData.allocationNum ?? null,
          docDate: this.formatDateToDDMMYYYY(data.docData.docDate),
          issuerName: data.docData.issuerName ? `שם העסק: ${data.docData.issuerName}` : null,
          issuerDetails: [
            data.docData.issuerBusinessNumber ? `מ.ע. / ח.פ.:  ${data.docData.issuerBusinessNumber}` : null,
            data.docData.issuerPhone          ? `טלפון:  ${data.docData.issuerPhone}` : null,
            data.docData.issuerEmail          ? `כתובת מייל:  ${data.docData.issuerEmail}` : null,
            data.docData.issuerAddress        ? `כתובת:  ${data.docData.issuerAddress}` : null,
          ].filter(Boolean).join('\n'),
          items_table: await this.transformLinesToItemsTable(data.linesData),
          sumTable: await this.transformSumsToSumTable(data.docData, data.docData.issuerBusinessNumber),
          documentType: isCopy ? 'העתק נאמן למקור' : 'מקור',
          paymentMethod: data.docData.paymentMethod,
          draft_image: templateType === 'previewDoc' ? draftImageBase64 : null
        };
        
        // Add VAT-related fields only for non-receipts
        const isReceipt = docType === 'RECEIPT';
        if (!isReceipt) {
          prefill_data.vatableAmountLabel = 'חייב במע"מ';
          prefill_data.vatableAmount = `${data.docData.sumAftDisBefVAT - data.docData.sumWithoutVat} ש"ח`;
          prefill_data.vatLabel = 'מע"מ';
          prefill_data.vat = `${data.docData.vatSum} ש"ח`;
        }

        if (data.paymentData && data.paymentData.length > 0) {
          prefill_data.payments_table = await this.transformLinesToPaymentsTable(data.paymentData);
          prefill_data.sumPaymentsTable = await this.transformPaymentsToSumTable(data.paymentData, data.docData);
        }


        break;


      default:
        throw new Error(`Unknown template type: ${templateType}`);
    }

    const payload = {
      fid,
      digitallySign: templateType === 'createDoc',
      prefill_data,
    };

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    try {
      
      const response = await axios.post<Blob>(url, payload, {
        headers,
        responseType: 'arraybuffer',
      });

      if (!response.data) {
        throw new Error('Failed to generate PDF');
      }

      return response.data;
    } catch (error: any) {
      console.error('❌ FillFaster API Error:');
      console.error('   Status:', error.response?.status);
      console.error('   Status Text:', error.response?.statusText);
      console.error('   URL:', url);
      console.error('   FID:', fid);
      
      // Try to parse error response body
      if (error.response?.data) {
        try {
          // Try to parse as JSON first
          const errorText = Buffer.from(error.response.data).toString('utf-8');
          console.error('   Error Response Body:', errorText);
          
          try {
            const errorJson = JSON.parse(errorText);
            console.error('   Parsed Error JSON:', JSON.stringify(errorJson, null, 2));
          } catch (parseError) {
            // Not JSON, just log as text
            console.error('   Error Response (text):', errorText);
          }
        } catch (bufferError) {
          console.error('   Could not parse error response body');
        }
      }
      
      // Log the payload that was sent (but truncate large fields)
      const payloadForLog = {
        ...payload,
        prefill_data: {
          ...prefill_data,
          items_table: prefill_data.items_table ? `[${Array.isArray(prefill_data.items_table) ? prefill_data.items_table.length : 'N/A'} items]` : null,
          payments_table: prefill_data.payments_table ? `[${Array.isArray(prefill_data.payments_table) ? prefill_data.payments_table.length : 'N/A'} items]` : null,
          sumTable: prefill_data.sumTable ? `[${Array.isArray(prefill_data.sumTable) ? prefill_data.sumTable.length : 'N/A'} items]` : null,
          draft_image: prefill_data.draft_image ? `[base64 image ${prefill_data.draft_image.length} chars]` : null,
        }
      };
      console.error('   Payload sent:', JSON.stringify(payloadForLog, null, 2));
      
      throw new HttpException(
        `FillFaster API error: ${error.response?.status || 'Unknown'} - ${error.response?.statusText || error.message}`,
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }


  /**
   * Format a number with commas as thousand separators and 2 decimal places
   * @param num - The number to format
   * @returns Formatted string (e.g., "1,000.00")
   */
  private formatNumberWithCommas(num: number): string {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async transformSumsToSumTable(docData: any, issuerBusinessNumber: string): Promise<any[]> {
    
    // Get businessType from database
    const business = await this.businessRepo.findOne({
      where: { businessNumber: issuerBusinessNumber },
      select: ['businessType'],
    });

    const businessType = business?.businessType || null;
    const docType = docData.docType;
    const sumBefDisBefVat = Number(docData.sumWithoutVat || 0);
    const disSum = Number(docData.disSum || 0);
    const sumAftDisWithVAT = Number(docData.sumAftDisWithVAT || 0);
    const sumAftDisBefVAT = Number(docData.sumAftDisBefVAT || 0);
    const vatSum = Number(docData.vatSum || 0);
    const sumWithoutVat = Number(docData.sumWithoutVat || 0);

    const sumTable: any[] = [];

    // For EXEMPT (עוסק פטור)
    if (businessType === 'EXEMPT') {
      // If discount is 0, show only total; otherwise show all fields
      if (disSum > 0) {
        // Show: סה"כ לפני הנחה
        sumTable.push({
          'תיאור': 'סה"כ לפני הנחה:',
          'סכום': `₪${this.formatNumberWithCommas(sumBefDisBefVat)}`,
        });

        // Show: הנחה
        sumTable.push({
          'תיאור': 'הנחה:',
          'סכום': `₪${this.formatNumberWithCommas(disSum)}`,
        });
      }

      // Always show: סה"כ 
      sumTable.push({
        'תיאור': 'סה"כ:',
        'סכום': `₪${this.formatNumberWithCommas(sumAftDisWithVAT)}`,
      });
    } else {
      // For LICENSED (עוסק מורשה) or COMPANY (חברה)
      // For TAX_INVOICE and TAX_INVOICE_RECEIPT
      
      if (docType === DocumentType.TAX_INVOICE || docType === DocumentType.TAX_INVOICE_RECEIPT || docType === DocumentType.TRANSACTION_INVOICE) {
        // סה"כ חייב במע"מ
        sumTable.push({
          'תיאור': 'סה"כ חייב במע"מ:',
          'סכום': `₪${this.formatNumberWithCommas(sumAftDisBefVAT)}`,
        });

        // מע"מ
        sumTable.push({
          'תיאור': 'מע"מ:',
          'סכום': `₪${this.formatNumberWithCommas(vatSum)}`,
        });

        // סה"כ ללא מע"מ (רק אם שונה מאפס)
        if (sumWithoutVat > 0) {
          sumTable.push({
            'תיאור': 'סה"כ ללא מע"מ:',
            'סכום': `₪${this.formatNumberWithCommas(sumWithoutVat)}`,
          });
        }

        // סה"כ
        sumTable.push({
          'תיאור': 'סה"כ:',
          'סכום': `₪${this.formatNumberWithCommas(sumAftDisWithVAT)}`,
        });
      } else {
        // For other document types, return default structure
        sumTable.push({
          'תיאור': 'סה"כ:',
          'סכום': `₪${this.formatNumberWithCommas(sumAftDisWithVAT)}`,
        });
      }
    }

    return sumTable;
  }


  async transformLinesToItemsTable(lines: any[]): Promise<any[]> {
    return lines.map(line => ({
      'סה"כ': `₪${this.formatNumberWithCommas(line.sumBefVatPerUnit * line.unitQuantity)}`,
      'מחיר': `₪${this.formatNumberWithCommas(line.sumBefVatPerUnit)}`,
      'כמות': String(line.unitQuantity),
      'פירוט': line.description || ""
    }));
  }


  async transformLinesToPaymentsTable(PaymentLines: any[]): Promise<any[]> {
    return PaymentLines.map(line => {
      let details: string;
      let paymentMethodHebrew: string;

      switch (line.paymentMethod) {
        case 'CASH':
          details = 'שולם במזומן';
          paymentMethodHebrew = 'מזומן';
          break;

        case 'BANK_TRANSFER':
          const bankDetails: string[] = [];

          if (line.bankNumber) bankDetails.push(`בנק ${line.hebrewBankName}`);
          if (line.branchNumber) bankDetails.push(`סניף ${line.branchNumber}`);
          if (line.accountNumber) bankDetails.push(`חשבון ${line.accountNumber}`);

          details = bankDetails.join(', ');
          paymentMethodHebrew = 'העברה בנקאית';
          break;

        case 'CHECK':
          details = line.checkNumber ? `מספר המחאה ${line.checkNumber}` : '';
          paymentMethodHebrew = 'צ׳ק';
          break;

        case 'CREDIT_CARD':
          const creditDetails: string[] = [];

          if (line.cardCompany) creditDetails.push(`${line.cardCompany}`);
          if (line.card4Number) creditDetails.push(`${line.card4Number}`);

          details = creditDetails.join(' - ');
          paymentMethodHebrew = 'כרטיס אשראי';
          break;

        case 'APP':
          details = line.appName || 'שולם דרך אפליקציה';
          paymentMethodHebrew = 'אפליקציה';
          break;

        default:
          throw new Error(`אמצעי תשלום לא ידוע: ${line.paymentMethod}`);
      }

      return {
        "סכום": `₪${this.formatNumberWithCommas(line.paymentAmount)}`,
        "תאריך": this.formatDateToDDMMYYYY(line.paymentDate),
        "פירוט": details,
        "אמצעי תשלום": paymentMethodHebrew
      };
    });
  }

  /**
   * Transform payments data to sum payments table with withholding tax logic
   * @param paymentData - Array of payment objects
   * @param docData - Document data containing withholdingTaxAmount
   * @returns Array of table rows with description and amount
   */
  async transformPaymentsToSumTable(paymentData: any[], docData: any): Promise<any[]> {
    // Calculate total payments amount
    const totalPayments = paymentData.reduce((sum, payment) => {
      const paymentAmount = Number(payment.paymentAmount || payment.paymentSum || 0);
      return sum + paymentAmount;
    }, 0);

    const withholdingTaxAmount = Number(docData.withholdingTaxAmount || 0);
    const sumPaymentsTable: any[] = [];

    if (withholdingTaxAmount === 0) {
      // If withholding tax is 0, show only total
      sumPaymentsTable.push({
        'תיאור': 'סה"כ',
        'סכום': `₪${this.formatNumberWithCommas(totalPayments)}`,
      });
    } else {
      // If withholding tax is not 0, show: התקבל, ניכוי מס במקור, סה"כ
      sumPaymentsTable.push({
        'תיאור': 'התקבל:',
        'סכום': `₪${this.formatNumberWithCommas(totalPayments)}`,
      });

      sumPaymentsTable.push({
        'תיאור': 'ניכוי מס במקור:',
        'סכום': `₪${this.formatNumberWithCommas(withholdingTaxAmount)}`,
      });

      // Calculate final total (payments minus withholding tax)
      const finalTotal = totalPayments - withholdingTaxAmount;
      sumPaymentsTable.push({
        'תיאור': 'סה"כ:',
        'סכום': `₪${this.formatNumberWithCommas(finalTotal)}`,
      });
    }

    return sumPaymentsTable;
  }


  async transformDocumentData(dto: CreateDocDto): Promise<any> {

    // ============================================================================
    // 1. TRANSFORM DOCDATA (Documents entity fields)
    // ============================================================================
    const docData = dto.docData;
    console.log('📧 [transformDocumentData] sendEmailToRecipient from DTO:', docData.sendEmailToRecipient);
    console.log('📧 [transformDocumentData] withholdingTaxAmount from DTO:', docData.withholdingTaxAmount, 'type:', typeof docData.withholdingTaxAmount);

    // Calculate totals
    let sumBefDisBefVat = 0;
    let disSum = 0;
    let sumAftDisBefVAT = 0;
    let vatSum = 0;
    let sumAftDisWithVAT = 0;

    disSum = docData.totalDiscount;

    if (docData.businessType === BusinessType.EXEMPT) {
      sumBefDisBefVat = docData.totalWithoutVat;
      sumAftDisBefVAT = docData.totalWithoutVat - docData.totalDiscount;
      vatSum = 0;
      sumAftDisWithVAT = sumAftDisBefVAT;
    } else {
      sumBefDisBefVat = docData.totalVatApplicable + docData.totalWithoutVat;
      sumAftDisBefVAT = sumBefDisBefVat - docData.totalDiscount;
      vatSum = docData.totalVat;
      sumAftDisWithVAT = sumAftDisBefVAT + vatSum;
    }

    // Get business details
    const business = await this.businessService.getBusinessByNumber(docData.issuerBusinessNumber);

    // Transform Documents entity fields
    const transformedDocData: any = {
      // Issuer details
      issuerBusinessNumber: docData.issuerBusinessNumber,
      issuerName: business?.businessName,
      issuerAddress: business?.businessAddress,
      issuerPhone: business?.businessPhone,
      issuerEmail: business?.businessEmail,
      // Recipient details
      recipientName: docData.recipientName,
      recipientId: docData.recipientId,
      recipientPhone: docData.recipientPhone || null,
      recipientEmail: docData.recipientEmail || null,
      // Document details
      docType: docData.docType,
      generalDocIndex: String(docData.generalDocIndex),
      allocationNum: docData.allocationNum || null,
      docDescription: docData.docDescription || null,
      docSubtitle: docData.docSubtitle || null,
      docNumber: String(docData.docNumber),
      docVatRate: Number(docData.docVatRate),
      currency: docData.currency || Currency.ILS,
      // Summary totals
      sumBefDisBefVat: Number(sumBefDisBefVat.toFixed(2)),
      disSum: Number(disSum.toFixed(2)),
      sumAftDisBefVAT: Number(sumAftDisBefVAT.toFixed(2)),
      vatSum: Number(vatSum.toFixed(2)),
      sumAftDisWithVAT: Number(sumAftDisWithVAT.toFixed(2)),
      withholdingTaxAmount: docData.withholdingTaxAmount !== undefined && docData.withholdingTaxAmount !== null ? Number(docData.withholdingTaxAmount) : 0,
      sumWithoutVat: docData.totalWithoutVat || 0,
      // Dates
      docDate: new Date(docData.docDate),
      valueDate: new Date(docData.docDate), // TODO: Need to understand if we should support this value 
      customerKey: (docData as any).customerKey || null,
      matchField: (docData as any).matchField || null,
      isCancelled: (docData as any).isCancelled ?? false,
      branchCode: (docData as any).branchCode || null,
      operationPerformer: (docData as any).operationPerformer || null,
      // Parent document details
      parentDocType: docData.parentDocType || null,
      parentDocNumber: docData.parentDocNumber || null,
      // Email sending flag
      sendEmailToRecipient: docData.sendEmailToRecipient || false,
      
    };

    // ============================================================================
    // 2. TRANSFORM LINESDATA (DocLines entity fields)
    // ============================================================================
    const transformedLinesData = dto.linesData.map((line, index) => {

      return {
        // Required fields
        issuerBusinessNumber: docData.issuerBusinessNumber,
        generalDocIndex: docData.generalDocIndex,
        lineNumber: String(line.lineNumber),
        docType: docData.docType,
        transType: line.transType || '3', // varchar(1), default '3'
        description: line.description || '', // string

        // Optional product fields (may not be in DTO)
        internalNumber: (line as any).internalNumber || null, // varchar(20), nullable
        manufacturerName: (line as any).manufacturerName || null, // varchar, nullable
        productSerialNumber: (line as any).productSerialNumber || null, // varchar, nullable

        // Unit and quantity
        unitType: line.unitType, // enum UnitOfMeasure, default UNIT
        unitQuantity: Number(line.unitQuantity),

        // Amounts
        sumBefVatPerUnit: Number((line.sumBefVatPerUnit || line.sum || 0).toFixed(4)),
        disBefVatPerLine: Number((line.disBefVatPerLine || line.discount || 0).toFixed(2)),
        sumAftDisBefVatPerLine: Number((line.sumAftDisBefVatPerLine || 
          ((line.sumBefVatPerUnit || line.sum || 0) * (line.unitQuantity || 1) - (line.discount || 0))
        ).toFixed(2)),

        // VAT
        vatOpts: line.vatOpts, // enum VatOptions, default INCLUDE
        vatRate: Number(line.vatRate), // decimal(5,2)
        vatPerLine: Number((line.vatPerLine || 0).toFixed(2)), // decimal(10,2)
        sumAftDisWithVat: Number((line.sumAftDisWithVat || 
          (line.sumAftDisBefVatPerLine || ((line.sumBefVatPerUnit || line.sum || 0) * (line.unitQuantity || 1) - (line.discount || 0))) + (line.vatPerLine || 0)
        ).toFixed(2)), // decimal(10,2)

        // Journal entry (may not be in DTO)
        journalEntryMainId: (line as any).journalEntryMainId || null, // varchar, nullable
      };
    });

    // ============================================================================
    // 3. TRANSFORM PAYMENTDATA (DocPayments entity fields)
    // ============================================================================
    const transformedPaymentData = (dto.paymentData || []).map((payment) => {
      // Convert cardCompany to enum if needed
      let cardCompany: CardCompany | null = null;
      if (payment.cardCompany !== undefined && payment.cardCompany !== null) {
        if (typeof payment.cardCompany === 'number') {
          cardCompany = payment.cardCompany as CardCompany;
        } else if (typeof payment.cardCompany === 'string') {
          const cardCompanyUpper = payment.cardCompany.toUpperCase();
          cardCompany = CardCompany[cardCompanyUpper as keyof typeof CardCompany] || null;
        }
      }

      // Convert creditTransType to enum if needed (may not be in DTO)
      let creditTransType: CreditTransactionType | null = null;
      const creditTransTypeValue = (payment as any).creditTransType;
      if (creditTransTypeValue !== undefined && creditTransTypeValue !== null) {
        if (typeof creditTransTypeValue === 'number') {
          creditTransType = creditTransTypeValue as CreditTransactionType;
        } else if (typeof creditTransTypeValue === 'string') {
          const creditTransTypeUpper = creditTransTypeValue.toUpperCase();
          creditTransType = CreditTransactionType[creditTransTypeUpper as keyof typeof CreditTransactionType] || null;
        }
      }

      // Convert paymentDate to Date
      const paymentDate = payment.paymentDate ? new Date(payment.paymentDate) : new Date();

      return {
        // Required fields
        issuerBusinessNumber: docData.issuerBusinessNumber, // string
        generalDocIndex: docData.generalDocIndex, // varchar(7), nullable
        paymentLineNumber: String(payment.paymentLineNumber), // varchar(4), nullable
        paymentMethod: payment.paymentMethod, // varchar (not enum in entity)
        paymentDate: paymentDate, // date
        paymentAmount: Number(payment.paymentAmount || payment.paymentSum || 0), // decimal(10,4)

        // Bank transfer fields
        hebrewBankName: payment.hebrewBankName || null, // varchar(20), nullable
        bankNumber: payment.bankNumber || null, // varchar(10), nullable
        branchNumber: payment.branchNumber || null, // varchar(10), nullable
        accountNumber: payment.accountNumber || null, // varchar(15), nullable

        // Check fields
        checkNumber: payment.checkNumber || null, // varchar(10), nullable

        // Credit card fields
        cardCompany: cardCompany, // enum CardCompany, nullable
        creditCardName: payment.creditCardName || null, // varchar(20), nullable
        creditTransType: creditTransType, // enum CreditTransactionType, nullable
        card4Number: payment.card4Number || null, // varchar(4), nullable
        creditPayNumber: (payment as any).creditPayNumber || null, // varchar(3), nullable

        // App payment fields
        appName: (payment as any).appName || null, // varchar(50), nullable
      };
    });

    // ============================================================================
    // 4. RETURN TRANSFORMED DATA
    // ============================================================================
    return {
      docData: transformedDocData,
      linesData: transformedLinesData,
      paymentData: transformedPaymentData,
    };
  }
  

  async createDoc(data: any, userId: string, generatePdf: boolean = true): Promise<any> {

    // Ensure docStatus is not DRAFT when creating actual document
    // Remove any DRAFT status that might have been set from draft restoration
    if (data.docData && data.docData.docStatus === DocumentStatusType.DRAFT) {
      console.log('⚠️ Removing DRAFT status from docData before document creation');
      delete data.docData.docStatus;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {

      // 1. Increment general index (use manager for DB operation)
      const updatedGeneralIndex = await this.incrementGeneralIndex(userId, data.docData.issuerBusinessNumber, queryRunner.manager);
      // IMPORTANT: Use the NEW incremented generalIndex from the database, not from the request
      // This ensures we always use a fresh, incremented value, not the parent document's index
      const newGeneralDocIndex = String(updatedGeneralIndex.currentIndex);
      data.docData.generalDocIndex = newGeneralDocIndex;
      
      // Update all lines and payments to use the new generalDocIndex
      if (data.linesData && Array.isArray(data.linesData)) {
        data.linesData.forEach(line => {
          line.generalDocIndex = newGeneralDocIndex;
        });
      }
      if (data.paymentData && Array.isArray(data.paymentData)) {
        data.paymentData.forEach(payment => {
          payment.generalDocIndex = newGeneralDocIndex;
        });
      }
      
      console.log(new Date().toLocaleTimeString(), "Step 1 complete - General index incremented to:", newGeneralDocIndex);

      // 2. Increment document-specific index
      const docDetails = await this.incrementCurrentIndex(userId, data.docData.issuerBusinessNumber, data.docData.docType, queryRunner.manager, data.docData.docNumber);
      if (!docDetails) {
        throw new HttpException('Error in update currentIndex', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      console.log(new Date().toLocaleTimeString(), "Step 2 complete - Current index incremented");

      // 3. Save main document info (now with the correct incremented generalDocIndex)
      const newDoc = await this.saveDocInfo(userId, data.docData, queryRunner.manager);
      if (!newDoc) {
        throw new HttpException('Error in saveDocInfo', HttpStatus.INTERNAL_SERVER_ERROR);
      }            
      console.log(new Date().toLocaleTimeString(), "Step 3 complete - Document info saved");

      // 4. Save line items (now with the correct incremented generalDocIndex)
      await this.saveLinesInfo(userId, data.linesData, queryRunner.manager);
      console.log(new Date().toLocaleTimeString(), "Step 4 complete - Lines info saved");

      // 5. Save payments (now with the correct incremented generalDocIndex)
      await this.savePaymentsInfo(userId, data.paymentData, queryRunner.manager);
      console.log(new Date().toLocaleTimeString(), "Step 5 complete - Payments info saved");

      // 6. Bookkeeping entry - only for specific document types
      const docTypesWithJournalEntry = [
        DocumentType.TAX_INVOICE,           // חשבונית מס
        DocumentType.TAX_INVOICE_RECEIPT,   // חשבונית מס קבלה
        DocumentType.RECEIPT,                // קבלה
        DocumentType.CREDIT_INVOICE,        // חשבונית זיכוי
      ];

      if (docTypesWithJournalEntry.includes(data.docData.docType)) {
        await this.bookkeepingService.createJournalEntry({
          issuerBusinessNumber: data.docData.issuerBusinessNumber,
          date: this.sharedService.normalizeToMySqlDate(data.docData.docDate),
          referenceType: data.docData.docType,
          referenceId: parseInt(data.docData.docNumber),
          description: `${data.docData.docType} #${data.docData.docNumber} for ${data.docData.recipientName}`,
          lines: [
            { accountCode: '4000', credit: data.docData.sumAftDisBefVAT },
            { accountCode: '2400', credit: data.docData.vatSum },
          ]
        }, queryRunner.manager);
        console.log(new Date().toLocaleTimeString(), "Step 6 complete - BookKeeping info saved");
      } else {
        console.log(new Date().toLocaleTimeString(), "Step 6 skipped - Document type does not require journal entry");
      }

      // 7. Generate both PDFs (original and copy)
      let originalFilePath: string | null = null;
      let copyFilePath: string | null = null;

      if (generatePdf) {
        try {
          // Generate original PDF (מקור)
          const originalPdfBlob = await this.generatePDF(data, "createDoc");
          if (!originalPdfBlob) {
            throw new Error("Original PDF generation failed");
          }
          const originalBuffer = Buffer.from(originalPdfBlob as any);

          // Generate copy PDF (העתק נאמן למקור)
          const copyData = {
            ...data,
            docData: {
              ...data.docData,
              // Mark as certified copy
            }
          };
          const copyPdfBlob = await this.generatePDF(copyData, "createDoc", true); // Pass true for copy
          if (!copyPdfBlob) {
            throw new Error("Copy PDF generation failed");
          }
          const copyBuffer = Buffer.from(copyPdfBlob as any);
          console.log(new Date().toLocaleTimeString(), "Step 7 complete - PDFs generated");

          // 8. Upload both PDFs to Firebase
          originalFilePath = await this.uploadToFirebase(
            originalBuffer,
            data.docData.issuerBusinessNumber,
            data.docData.generalDocIndex,
            data.docData.docType,
            data.docData.docDescription,
            'original'
          );
          console.log(new Date().toLocaleTimeString(), "Step 8.1 complete - Original PDF uploaded");
          
          copyFilePath = await this.uploadToFirebase(
            copyBuffer,
            data.docData.issuerBusinessNumber,
            data.docData.generalDocIndex,
            data.docData.docType,
            data.docData.docDescription,
            'copy'
          );
          console.log(new Date().toLocaleTimeString(), "Step 8.1 complete - Copy PDF uploaded");

          // 9. Update document with Firebase paths
          const documentsRepo = queryRunner.manager.getRepository(Documents);
          newDoc.file = originalFilePath;
          newDoc.copyFile = copyFilePath;
          await documentsRepo.save(newDoc);
          console.log(new Date().toLocaleTimeString(), "Step 9 complete - files paths saved to document");

          // 10. Update parent document status to CLOSE if this is a closing document (RECEIPT or TAX_INVOICE_RECEIPT) for TRANSACTION_INVOICE
          if (data.docData.parentDocType && data.docData.parentDocNumber) {
            const closingDocTypes = [DocumentType.RECEIPT, DocumentType.TAX_INVOICE_RECEIPT];
            // Only update status if closing a TRANSACTION_INVOICE (חשבון עסקה)
            if (closingDocTypes.includes(data.docData.docType) && data.docData.parentDocType === DocumentType.TRANSACTION_INVOICE) {
              const parentDoc = await documentsRepo.findOne({
                where: {
                  issuerBusinessNumber: data.docData.issuerBusinessNumber,
                  docType: data.docData.parentDocType,
                  docNumber: data.docData.parentDocNumber,
                }
              });
              
              if (parentDoc && parentDoc.docStatus === DocumentStatusType.OPEN) {
                parentDoc.docStatus = DocumentStatusType.CLOSE;
                await documentsRepo.save(parentDoc);
                console.log(new Date().toLocaleTimeString(), "Step 10 complete - Parent document status updated to CLOSE");
              }
            }
          }

          // 11. Send email to recipient if requested
          console.log(new Date().toLocaleTimeString(), "Step 11 - Checking email sending conditions:");
          console.log("  - sendEmailToRecipient:", data.docData.sendEmailToRecipient);
          console.log("  - recipientEmail:", data.docData.recipientEmail);
          console.log("  - originalFilePath:", originalFilePath);
          
          if (data.docData.sendEmailToRecipient && data.docData.recipientEmail && originalFilePath) {
            try {
              console.log(new Date().toLocaleTimeString(), "Step 11.1 - Starting email sending process");
              console.log("  📧 Email will be sent to:", data.docData.recipientEmail);
              
              // Get business info for email content
              const business = await this.businessService.getBusinessByNumber(data.docData.issuerBusinessNumber);
              const businessName = business?.businessName || data.docData.issuerBusinessNumber;
              console.log("  📧 Business name:", businessName);

              // Get Hebrew document type name
              const docTypeNames: Partial<Record<DocumentType, string>> = {
                [DocumentType.RECEIPT]: 'קבלה',
                [DocumentType.TAX_INVOICE]: 'חשבונית מס',
                [DocumentType.TAX_INVOICE_RECEIPT]: 'חשבונית מס קבלה',
                [DocumentType.CREDIT_INVOICE]: 'חשבונית זיכוי',
                [DocumentType.TRANSACTION_INVOICE]: 'חשבון עסקה',
                [DocumentType.GENERAL]: 'מסמך כללי',
              };
              const docTypeName = docTypeNames[data.docData.docType] || data.docData.docType;
              console.log("  📧 Document type:", docTypeName, "Number:", data.docData.docNumber);

              // Download PDF from Firebase
              console.log("  📧 Downloading PDF from Firebase:", originalFilePath);
              const pdfBuffer = await this.downloadFromFirebase(originalFilePath);
              console.log("  📧 PDF downloaded successfully, size:", pdfBuffer.length, "bytes");

              // Get owner name - use issuerName from transformed data if available, otherwise get from user
              let ownerName = data.docData.issuerName;
              if (!ownerName && business?.firebaseId) {
                const user = await this.userRepo.findOne({ where: { firebaseId: business.firebaseId } });
                ownerName = user ? `${user.fName} ${user.lName}`.trim() : null;
              }
              const finalOwnerName = ownerName?.trim() || businessName;
              console.log("  📧 Owner name:", finalOwnerName);
              
              // Prepare email content
              const recipientName = data.docData.recipientName || 'לקוח נכבד';
              
              const emailSubject = `${docTypeName} #${data.docData.docNumber}`;
              const emailText = `שלום ${recipientName},

מצורף בזאת ${docTypeName} מספר ${data.docData.docNumber}.

בברכה,
${finalOwnerName}`;

              // Generate attachment filename
              const attachmentName = `${data.docData.docType}_${data.docData.docNumber}_${data.docData.generalDocIndex}.pdf`;
              console.log("  📧 Email subject:", emailSubject);
              console.log("  📧 Attachment name:", attachmentName);

              // Send email with attachment
              console.log("  📧 Sending email via BREVO...");
              const emailResponse = await this.mailService.sendMailWithAttachment(
                data.docData.recipientEmail,
                emailSubject,
                emailText,
                pdfBuffer,
                attachmentName
              );

              console.log(new Date().toLocaleTimeString(), "✅ Step 11 complete - Email sent successfully to:", data.docData.recipientEmail);
              console.log("  📧 Email response:", JSON.stringify(emailResponse, null, 2));
            } catch (emailError) {
              // Don't fail document creation if email fails - just log the error
              console.error(new Date().toLocaleTimeString(), "❌ Error sending email to recipient:", data.docData.recipientEmail);
              console.error("  Error details:", emailError);
              if (emailError instanceof Error) {
                console.error("  Error message:", emailError.message);
                console.error("  Error stack:", emailError.stack);
              }
              console.error("  Document was created successfully, but email sending failed");
            }
          } else {
            console.log(new Date().toLocaleTimeString(), "Step 11 skipped - Email sending conditions not met");
          }

        } catch (uploadError) {
          // If upload fails, delete any uploaded files
          if (originalFilePath) {
            await this.deleteFromFirebase(originalFilePath);
          }
          if (copyFilePath) {
            await this.deleteFromFirebase(copyFilePath);
          }
          throw uploadError;
        }

      }

      // ✅ All good – commit the transaction
      await queryRunner.commitTransaction();

      return {
        success: true,
        docType: data.docData.docType,
        message: 'Document created successfully',
        generalDocIndex: data.docData.generalDocIndex,
        docNumber: data.docData.docNumber,
        file: originalFilePath,
        copyFile: copyFilePath
      };

    } catch (error) {

      console.error('❌ Error in createDoc transaction:', error);
      // 🔁 Rollback anything saved so far
      await queryRunner.rollbackTransaction();
      throw error;

    } finally {
      await queryRunner.release();
    }
  }


  async previewDoc(data: any, generatePdf: boolean = true): Promise<any> {

    try {
      // Generate the PDF
      let pdfBlob = null;
      if (generatePdf) {
        // Only generate the PDF if requested
        pdfBlob = await this.generatePDF(data, "previewDoc");
      }
      return pdfBlob;
    }
    catch (error) {
      console.error('❌ Error in createDoc:', error);
      throw error;
    }

  }
  

  convertPaymentMethod(paymentMethod: string): string {
    switch (paymentMethod) {
      case 'מזומן':
        return 'CASH';
      case 'העברה בנקאית':
        return 'TRANSFER';
      case 'ביט':
        return 'BIT';
      case 'פייבוקס':
        return 'PAYBOX';
      case "צ'ק":
        return 'CHECK';
      case 'כרטיס אשראי':
        return 'CREDIT_CARD';
      case 'אפליקציה':
        return 'APP';
    }
  }


  async incrementCurrentIndex(
    userId: string,
    issuerBusinessNumber: string,
    docType: DocumentType,
    manager?: EntityManager,
    initialDocIndex?: number // optional starting value from frontend
  ): Promise<SettingDocuments> {
    try {
      if (docType !== DocumentType.GENERAL) {
        if (!issuerBusinessNumber || !issuerBusinessNumber.trim()) {
          throw new BadRequestException('issuerBusinessNumber is required');
        }
      }
      const repo = manager
        ? manager.getRepository(SettingDocuments)
        : this.settingDocuments;

      let docSetting = await repo.findOne({
        where: { userId, issuerBusinessNumber, docType },
      });

      // First time
      if (!docSetting) {
        if (initialDocIndex == null) {
          throw new BadRequestException(
            `Initial document index required for first-time setup of ${docType}`
          );
        }
        // Create new setting with initial index
        docSetting = repo.create({
          userId,
          issuerBusinessNumber,
          docType,
          initialIndex: initialDocIndex,
          currentIndex: initialDocIndex + 1,
        });
        return await repo.save(docSetting);
      }

      // Existing setting — increment currentIndex
      docSetting.currentIndex += 1;
      return await repo.save(docSetting);
    } catch (error) {
      throw error;
    }
  }


  async saveDocInfo(userId: string, data: any, manager?: EntityManager): Promise<Documents> {
    
    try {
      const repo = manager
        ? manager.getRepository(Documents)
        : this.documentsRepo;

      // Get current time in HHMM format
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const issueHour = `${hours}${minutes}`;

      const autoClosedTypes = [
        DocumentType.RECEIPT,
        DocumentType.TAX_INVOICE_RECEIPT,
        DocumentType.CREDIT_INVOICE
      ];

      // Default values set on the server
      // Don't override docStatus if it's already set (e.g., for DRAFT)
      const serverGeneratedValues: any = {
        issueDate: new Date(),
        docDate: data.docDate ? new Date(data.docDate) : new Date(),
        valueDate: data.valueDate ? new Date(data.valueDate) : new Date(),
        issueHour,
        isCancelled: data.isCancelled ?? false,
        docNumber: data.docNumber.toString(),
      };

      // Only set docStatus if it's not already set (e.g., not DRAFT)
      if (!data.docStatus) {
        serverGeneratedValues.docStatus = autoClosedTypes.includes(data.docType) ? 'CLOSE' : 'OPEN';
      }

      // Merge all values
      const docData: Partial<Documents> = { userId, ...data, ...serverGeneratedValues };

      // Save and return the inserted document
      const savedDoc = await repo.save(docData);

      if (!savedDoc) {
        throw new HttpException('Error in saveDocInfo', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return savedDoc;
    } catch (error) {
      console.error("❌ Error in saveDocInfo:", error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  async saveLinesInfo(userId: string, data: any[], manager?: EntityManager): Promise<void> {

    if (!Array.isArray(data)) {
      throw new HttpException('Expected an array of data', HttpStatus.BAD_REQUEST);
    }

    try {
      const repo = manager
        ? manager.getRepository(DocLines)
        : this.docLinesRepo;

      for (const item of data) {
        const vatOptsRaw = item.vatOpts;
        let vatOpts: VatOptions;

        // Handle different input types
        if (typeof vatOptsRaw === 'number') {
          // Already a number (enum value), validate it's a valid enum value
          if (vatOptsRaw === VatOptions.INCLUDE || vatOptsRaw === VatOptions.EXCLUDE || vatOptsRaw === VatOptions.WITHOUT) {
            vatOpts = vatOptsRaw as VatOptions;
          } else {
            throw new HttpException(`Invalid vatOpts numeric value: ${vatOptsRaw}`, HttpStatus.BAD_REQUEST);
          }
        } else if (typeof vatOptsRaw === 'string') {
          // Convert string to enum
          const vatOptsUpper = vatOptsRaw.toUpperCase();
          if (vatOptsUpper === 'INCLUDE') {
            vatOpts = VatOptions.INCLUDE;
          } else if (vatOptsUpper === 'EXCLUDE') {
            vatOpts = VatOptions.EXCLUDE;
          } else if (vatOptsUpper === 'WITHOUT') {
            vatOpts = VatOptions.WITHOUT;
          } else {
            // Try enum key lookup
            const enumValue = VatOptions[vatOptsUpper as keyof typeof VatOptions];
            if (enumValue !== undefined) {
              vatOpts = enumValue;
            } else {
              throw new HttpException(`Invalid vatOpts string value: ${vatOptsRaw}`, HttpStatus.BAD_REQUEST);
            }
          }
        } else {
          throw new HttpException(`Invalid vatOpts type: ${typeof vatOptsRaw}, value: ${vatOptsRaw}`, HttpStatus.BAD_REQUEST);
        }

        const linesData = { userId, ...item, vatOpts };

        await repo.insert(linesData); // Will throw if insert fails
      }
    } catch (error) {
      console.error("❌ Error in saveLinesInfo:", error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  async savePaymentsInfo(userId: string, data: any[], manager?: EntityManager): Promise<void> {
    if (!Array.isArray(data)) {
      throw new HttpException('Expected an array of data', HttpStatus.BAD_REQUEST);
    }

    try {
      const repo = manager
        ? manager.getRepository(DocPayments)
        : this.docPaymentsRepo;

      const payments = data.map(item => {
        // Normalize date to YYYY-MM-DD for MySQL DATE column
          const paymentDate = this.sharedService.normalizeToMySqlDate(item.paymentDate);

        // Map paymentSum (from frontend) to paymentAmount (DB column)
        const paymentAmount = item.paymentAmount ?? item.paymentSum ?? 0;

        return {
          userId,
          ...item,
          paymentAmount,
          paymentDate,
        } as Partial<DocPayments>;
      });

      await repo.insert(payments); // Insert all at once

    } catch (error) {
      console.error("❌ Error in savePaymentsInfo:", error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  // Save draft before SHAAM redirect
  async saveDraft(userId: string, data: any): Promise<Documents> {
    console.log('=== SAVING DRAFT TO DATABASE ===');
    console.log('User ID:', userId);
    console.log('Business Number (issuerBusinessNumber):', data.docData.issuerBusinessNumber);
    console.log('Document Type:', data.docData.docType);
    console.log('Lines Count:', data.linesData?.length || 0);
    console.log('Payments Count:', data.paymentData?.length || 0);
    console.log('Full docData:', JSON.stringify(data.docData, null, 2));
    
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Delete existing draft for this user/business/docType
      console.log('Deleting existing draft if exists...');
      await this.deleteDraft(userId, data.docData.issuerBusinessNumber, data.docData.docType, queryRunner.manager);

      // 2. Generate temporary generalDocIndex for draft (not incrementing real index)
      // Use a short hash based on timestamp to fit in varchar(7)
      // Format: D + last 6 digits of timestamp (e.g., D123456)
      const timestamp = Date.now();
      const shortHash = timestamp % 1000000; // Last 6 digits
      const draftGeneralDocIndex = `D${String(shortHash).padStart(6, '0')}`;
      data.docData.generalDocIndex = draftGeneralDocIndex;
      console.log('Generated draft generalDocIndex:', draftGeneralDocIndex, '(from timestamp:', timestamp, ')');
      
      // Update lines and payments with draft index
      if (data.linesData && Array.isArray(data.linesData)) {
        data.linesData.forEach(line => {
          line.generalDocIndex = draftGeneralDocIndex;
        });
      }
      if (data.paymentData && Array.isArray(data.paymentData)) {
        data.paymentData.forEach(payment => {
          payment.generalDocIndex = draftGeneralDocIndex;
        });
      }

      // 3. Set docStatus to DRAFT
      data.docData.docStatus = DocumentStatusType.DRAFT;
      
      // 4. Set docNumber to temporary value (not incrementing real index)
      if (!data.docData.docNumber || data.docData.docNumber === '') {
        data.docData.docNumber = 'DRAFT';
      }

      // 5. Save document with DRAFT status
      console.log('Saving draft document to database...');
      const draftDoc = await this.saveDocInfo(userId, data.docData, queryRunner.manager);
      if (!draftDoc) {
        throw new HttpException('Error saving draft document', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      console.log('✅ Draft document saved with ID:', draftDoc.id);

      // 6. Save lines
      if (data.linesData && data.linesData.length > 0) {
        console.log('Saving draft lines to database...');
        await this.saveLinesInfo(userId, data.linesData, queryRunner.manager);
        console.log(`✅ Saved ${data.linesData.length} lines`);
      }

      // 7. Save payments
      if (data.paymentData && data.paymentData.length > 0) {
        console.log('Saving draft payments to database...');
        await this.savePaymentsInfo(userId, data.paymentData, queryRunner.manager);
        console.log(`✅ Saved ${data.paymentData.length} payments`);
      }

      await queryRunner.commitTransaction();
      console.log('=== DRAFT SAVED SUCCESSFULLY ===');
      return draftDoc;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Load draft after returning from SHAAM
  async loadDraft(userId: string, issuerBusinessNumber: string, docType: DocumentType): Promise<any | null> {
    console.log('=== LOADING DRAFT FROM DATABASE ===');
    console.log('Business Number:', issuerBusinessNumber);
    console.log('Document Type:', docType);
    console.log('User ID:', userId);
    
    try {
      // Find draft document
      console.log('Querying database for draft document...');
      const draftDoc = await this.documentsRepo.findOne({
        where: {
          issuerBusinessNumber,
          docType,
          docStatus: DocumentStatusType.DRAFT,
        },
        order: { id: 'DESC' }
      });

      if (!draftDoc) {
        console.log('❌ No draft found in database');
        return null;
      }

      console.log('✅ Draft document found with ID:', draftDoc.id);
      console.log('Draft generalDocIndex:', draftDoc.generalDocIndex);

      // Get lines and payments
      console.log('Querying database for draft lines...');
      const lines = await this.docLinesRepo.find({
        where: {
          issuerBusinessNumber,
          generalDocIndex: draftDoc.generalDocIndex,
          docType
        }
      });
      console.log(`✅ Found ${lines.length} lines`);

      console.log('Querying database for draft payments...');
      const payments = await this.docPaymentsRepo.find({
        where: {
          issuerBusinessNumber,
          generalDocIndex: draftDoc.generalDocIndex
        }
      });
      console.log(`✅ Found ${payments.length} payments`);

      console.log('=== DRAFT LOADED SUCCESSFULLY ===');
      return {
        docData: draftDoc,
        linesData: lines,
        paymentData: payments
      };
    } catch (error) {
      console.error('❌ Error loading draft:', error);
      return null;
    }
  }

  // Delete draft (called before saving new draft or after creating document)
  async deleteDraft(userId: string, issuerBusinessNumber: string, docType: DocumentType, manager?: EntityManager): Promise<void> {
    try {
      const repo = manager 
        ? manager.getRepository(Documents)
        : this.documentsRepo;

      // Find all drafts for this business/docType
      const drafts = await repo.find({
        where: {
          issuerBusinessNumber,
          docType,
          docStatus: DocumentStatusType.DRAFT
        }
      });

      if (drafts.length === 0) {
        return;
      }

      // Get all generalDocIndexes of drafts
      const draftIndexes = drafts.map(d => d.generalDocIndex).filter(Boolean);

      if (draftIndexes.length === 0) {
        return;
      }

      // Delete lines
      const linesRepo = manager 
        ? manager.getRepository(DocLines)
        : this.docLinesRepo;
      await linesRepo.delete({
        issuerBusinessNumber,
        generalDocIndex: In(draftIndexes),
        docType
      });

      // Delete payments
      const paymentsRepo = manager 
        ? manager.getRepository(DocPayments)
        : this.docPaymentsRepo;
      await paymentsRepo.delete({
        issuerBusinessNumber,
        generalDocIndex: In(draftIndexes)
      });

      // Delete documents
      await repo.delete({
        issuerBusinessNumber,
        docType,
        docStatus: DocumentStatusType.DRAFT
      });
    } catch (error) {
      console.error('Error deleting draft:', error);
      // Don't throw - allow draft save to continue even if delete fails
    }
  }

  async generateMultipleDocs(userId: string): Promise<any[]> {

    const docs = [];

    // Ensure settings exist before starting
    // Use the same issuer business number used in generateDocData()
    const issuerBusinessNumber = '204245724';
    await this.ensureDocumentSettingsExist(userId, issuerBusinessNumber);

    const docCounters: Record<string, number> = {
      RECEIPT: 1000,
      TAX_INVOICE: 2000,
      TAX_INVOICE_RECEIPT: 3000,
      TRANSACTION_INVOICE: 4000,
      CREDIT_INVOICE: 5000,
    };

    for (let i = 0; i < 500; i++) {
      const data = this.generateDocData(i, docCounters);
      try {
        const pdfBlob = await this.createDoc(data, userId, false);
        docs.push(pdfBlob);
        console.log(`[${new Date().toLocaleTimeString()}] Document ${i + 1} created successfully. Total so far: ${docs.length}`);
      } catch (error) {
        console.error(`Error generating document ${i + 1}`, error);
      }
    }

    return docs;
  }


  async ensureDocumentSettingsExist(userId: string, issuerBusinessNumber: string): Promise<void> {

    const docTypes: DocumentType[] = [
      DocumentType.RECEIPT,
      DocumentType.TAX_INVOICE,
      DocumentType.TAX_INVOICE_RECEIPT,
      DocumentType.TRANSACTION_INVOICE,
      DocumentType.CREDIT_INVOICE,
      DocumentType.GENERAL,
      DocumentType.JOURNAL_ENTRY,
    ];

    const defaultInitialValues: Record<DocumentType, number> = {
      [DocumentType.RECEIPT]: 10000,
      [DocumentType.TAX_INVOICE]: 20000,
      [DocumentType.TAX_INVOICE_RECEIPT]: 30000,
      [DocumentType.TRANSACTION_INVOICE]: 40000,
      [DocumentType.CREDIT_INVOICE]: 50000,
      [DocumentType.GENERAL]: 1000000,
      [DocumentType.JOURNAL_ENTRY]: 10000000,
    };

    for (const docType of docTypes) {
      const whereClause = { userId, issuerBusinessNumber, docType };

      const existing = await this.settingDocuments.findOne({ where: whereClause });

      if (!existing) {
        const payload: any = {
          userId,
          issuerBusinessNumber,
          docType,
          initialIndex: defaultInitialValues[docType],
          currentIndex: defaultInitialValues[docType],
        };
        await this.settingDocuments.save(payload);
      }
    }
  }


  generateDocData(index: number, docCounters: Record<string, number>): any {

    const docTypes: DocumentType[] = [
      DocumentType.RECEIPT,
      DocumentType.TAX_INVOICE,
      DocumentType.TAX_INVOICE_RECEIPT,
      DocumentType.TRANSACTION_INVOICE,
      DocumentType.CREDIT_INVOICE,
    ];

    // Randomly select a docType
    const docType = docTypes[Math.floor(Math.random() * docTypes.length)];

    // Increment the counter for the specific docType
    const docNumber = (docCounters[docType]++).toString();

    // General document index (always incrementing by all docs)
    const generalDocIndex = (1000000 + index).toString();

    // Random description
    const descriptions = ['בדיקה אוטומטית', 'מסמך בדיקה', 'בדיקה מספרית', 'בדיקה מהירה', 'בדיקה אקראית'];
    const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];

    // Random recipient names
    const recipientNames = ['אבי אוחיון', 'נועה כהן', 'רועי לוי', 'טל שרון', 'דנה יעקב', 'אורן מזרחי', 'יובל בן דוד', 'מיכל ישראלי', 'עדי פרידמן', 'איתי ברקוביץ'];
    const randomRecipient = recipientNames[Math.floor(Math.random() * recipientNames.length)];

    // Random sum (before VAT)
    const possibleSums = [100, 1000, 500, 750, 2500, 300, 400];
    const sumBefDisBefVat = possibleSums[Math.floor(Math.random() * possibleSums.length)];
    const vatRate = 18;
    // Calculate dependent sums
    const disSum = 0;
    const sumAftDisBefVat = sumBefDisBefVat - disSum;
    const vatSum = (sumAftDisBefVat * vatRate) / 100;
    const sumAftDisWithVat = sumAftDisBefVat + vatSum;

    // const docDate = new Date(2025, 9, 3).toISOString().split('T')[0]; // 2025-04-18
    const docDate = new Date(
      new Date(2025, 7, 1).getTime() + Math.random() * (new Date(2025, 8, 30).getTime() - new Date(2025, 7, 1).getTime())
    ).toISOString().split('T')[0];

    return {
      docData: {
        issuerBusinessNumber: '204245724',
        issuerName: 'אוריה הראל אדריכלות',
        issuerAddress: null,
        issuerPhone: '0545401296',
        issuerEmail: 'harelazar@gmail.com',
        recipientName: randomRecipient,
        recipientId: null,
        recipientStreet: null,
        recipientHomeNumber: null,
        recipientCity: null,
        recipientPostalCode: null,
        recipientState: null,
        recipientStateCode: null,
        recipientPhone: null,
        recipientEmail: null,
        docType: docType,
        hebrewNameDoc: '',
        generalDocIndex: generalDocIndex,
        docDescription: randomDescription,
        docNumber: docNumber,
        docVatRate: 18,
        transType: 3,
        amountForeign: 0,
        currency: 'ILS',
        sumBefDisBefVat: sumBefDisBefVat,
        disSum: 0,
        sumAftDisBefVAT: sumAftDisBefVat,
        vatSum: vatSum,
        sumAftDisWithVAT: sumAftDisWithVat,
        withholdingTaxAmount: 0,
        docDate: docDate,
        issueDate: docDate,
        customerKey: null,
        matchField: null,
        isCancelled: false,
        branchCode: null,
        operationPerformer: null,
        parentDocType: null,
        parentDocNumber: null,
        parentBranchCode: null
      },
      linesData: [
        {
          issuerBusinessNumber: '204245724',
          generalDocIndex: generalDocIndex,
          docType: docType,
          lineNumber: '1',
          description: 'דוגמה',
          unitQuantity: 1,
          vatOpts: 'EXCLUDE',
          vatRate: 18,
          sum: sumBefDisBefVat,
          discount: disSum,
          sumBefVatPerUnit: sumBefDisBefVat,
          disBefVatPerLine: disSum,
          sumAftDisBefVatPerLine: sumAftDisBefVat,
          vatPerLine: vatSum,
          sumAftDisWithVat: sumAftDisWithVat,
          unitType: 1,
          transType: '3',
        }
      ],
      paymentData: [DocumentType.RECEIPT, DocumentType.TAX_INVOICE_RECEIPT].includes(docType) ? [
        {
          issuerBusinessNumber: '204245724',
          generalDocIndex: generalDocIndex,
          paymentLineNumber: 1,
          paymentDate: docDate,
          bankName: 'LEUMI',
          branchNumber: null,
          accountNumber: null,
          paymentAmount: sumAftDisWithVat,
          paymentMethod: 'BANK_TRANSFER',
          hebrewBankName: 'לאומי',
          bankNumber: '10'
        }
      ] : []
    };
  }


  private formatDateToDDMMYYYY(dateInput: string | Date): string {
    const date = new Date(dateInput);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // months are zero-based
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  /**
   * Update document status
   */
  async updateDocStatus(
    issuerBusinessNumber: string,
    docNumber: string,
    docType: DocumentType,
    status: DocumentStatusType
  ): Promise<{ success: boolean; message: string }> {
    const doc = await this.documentsRepo.findOne({
      where: {
        issuerBusinessNumber,
        docNumber,
        docType,
      },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    doc.docStatus = status;
    await this.documentsRepo.save(doc);

    return {
      success: true,
      message: 'Document status updated successfully',
    };
  }


}