import { Injectable, HttpException, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { EntityManager, Repository } from 'typeorm';
import { SettingDocuments } from './settingDocuments.entity';
import { Documents } from './documents.entity';
import { DocLines } from './doc-lines.entity';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from 'src/bookkeeping/account.entity'
import { DocumentType, PaymentMethodType, VatOptions } from 'src/enum';
import { SharedService } from 'src/shared/shared.service';
import { BookkeepingService } from 'src/bookkeeping/bookkeeping.service';
import { log } from 'console';
import { DocPayments } from './doc-payments.entity';
import { DataSource } from 'typeorm';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';


@Injectable()
export class DocumentsService {

  private readonly apiClient: AxiosInstance;
  sessionID: string;

  constructor(
    private readonly sharedService: SharedService,
    private readonly bookkeepingService: BookkeepingService,
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
    private dataSource: DataSource
  ) { }

  isIncrement: boolean = false;
  isGeneralIncrement: boolean = false;


  async getDocuments(issuerBusinessNumber: string, startDate?: string, endDate?: string, docType?: DocumentType): Promise<Documents[]> {


    const query = this.documentsRepo
    .createQueryBuilder('doc')
    .where('doc.issuerBusinessNumber = :issuerBusinessNumber', { issuerBusinessNumber });

    if (docType) {
      query.andWhere('doc.docType = :docType', { docType });
    }

    if (startDate && endDate) {
      query.andWhere('doc.docDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      query.andWhere('doc.docDate >= :startDate', { startDate });
    } else if (endDate) {
      query.andWhere('doc.docDate <= :endDate', { endDate });
    } else {
      // Default: start of year → today
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1); // Jan 1st
      query.andWhere('doc.docDate BETWEEN :start AND :end', {
        start: startOfYear,
        end: now,
      });
    }

    query.orderBy('doc.docDate', 'DESC');

    return await query.getMany();
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
    console.log('Bucketttttttttttttttttt:', process.env.FIREBASE_STORAGE_BUCKET);

    try {
      const bucket = admin.storage().bucket('taxmyself-5d8a0.appspot.com');
      console.log("🚀 ~ DocumentsService ~ uploadToFirebase ~ bucket:", bucket)
      console.log('FB PROJECT:', process.env.FIREBASE_PROJECT_ID);
      console.log('FB CLIENT :', process.env.FIREBASE_CLIENT_EMAIL);
      console.log('FB BUCKET :', process.env.FIREBASE_STORAGE_BUCKET);
      console.log('PK len    :', process.env.FIREBASE_PRIVATE_KEY?.length || 0);

      const uniqueId = randomUUID();
      const filePath = `systemDocs/${issuerBusinessNumber}/${docType}/${fileType}/${uniqueId}/${fileName}.pdf`;
      const file = bucket.file(filePath);
      console.log("🚀 ~ DocumentsService ~ uploadToFirebase ~ file:", file)
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
      const bucket = admin.storage().bucket('taxmyself-5d8a0.appspot.com');
      await bucket.file(fullPath).delete();
      console.log(`Deleted Firebase file: ${fullPath}`);
    } catch (error) {
      console.error(`Failed to delete Firebase file: ${fullPath}`, error);
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
      if (doc.originalFile) {
        await this.deleteFromFirebase(doc.originalFile);
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

    let fid: string;
    let prefill_data: any;

    const url = 'https://api.fillfaster.com/v1/generatePDF';
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';
    const docType = data.docData.docType;

    switch (templateType) {
      case 'createDoc':
      case 'previewDoc':
        fid = ['RECEIPT', 'TAX_INVOICE_RECEIPT'].includes(docType) ? 'RVxpym2O68' : ['TAX_INVOICE', 'TRANSACTION_INVOICE', 'CREDIT_INVOICE'].includes(docType) ? 'AKmqQkevbM' : 'UNKNOWN FID';
        prefill_data = {
          recipientName: data.docData.recipientName,
          recipientTaxNumber: data.docData.recipientId,
          docTitle: `${data.docData.hebrewNameDoc} מספר ${data.docData.docNumber}`,
          docDate: this.formatDateToDDMMYYYY(data.docData.documentDate),
          // issuerDetails: [
          issuerName: data.docData.issuerName ? `שם העסק:           ${data.docData.issuerName}` : null,
          issuerBusinessNumber: data.docData.issuerBusinessNumber ? `מ.ע. / ח.פ.:         ${data.docData.issuerBusinessNumber}` : null,
          issuerPhone: data.docData.issuerPhone ? `טלפון:                 ${data.docData.issuerPhone}` : null,
          issuerEmail: data.docData.issuerEmail ? `כתובת מייל:         ${data.docData.issuerEmail}` : null,
          issuerAddress: data.docData.issuerAddress ? `כתובת:              ${data.docData.issuerAddress}` : null,
          // ].filter(Boolean).join('\n'),
          items_table: await this.transformLinesToItemsTable(data.linesData),
          subTotal: `₪${data.docData.sumAftDisBefVAT - data.docData.sumWithoutVat}`,
          // subTotal: data.docData.sumAftDisBefVAT,
          totalWithoutVat: `₪${data.docData.sumWithoutVat}`,
          totalDiscount: `₪${data.docData.disSum}`,
          totalTax: `₪${data.docData.vatSum}`,
          //totalTax: data.docData.vatSum,
          total: `₪${data.docData.sumAftDisWithVAT}`,
          //total: data.docData.sumAftDisWithVAT,
          documentType: isCopy ? 'העתק נאמן למקור' : 'מקור',
          paymentMethod: data.docData.paymentMethod,
        };

        if (data.paymentData && data.paymentData.length > 0) {
          prefill_data.payments_table = await this.transformLinesToPaymentsTable(data.paymentData);
        }

        break;

      case 'pnlReport':
        fid = 'ydAEQsvSbC';
        prefill_data = {
          name: data.prefill_data.name,
          id: data.prefill_data.id,
          period: data.prefill_data.period,
          income: data.prefill_data.income,
          profit: data.prefill_data.profit,
          expenses: data.prefill_data.expenses,
          table: data.prefill_data.table || [],
        };
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

    const response = await axios.post<Blob>(url, payload, {
      headers,
      responseType: 'arraybuffer',
    });

    if (!response.data) {
      throw new Error('Failed to generate PDF');
    }

    // if (templateType === 'createDoc') {
    //   try {
    //     const payloadCopy = {
    //       ...payload,
    //       prefill_data: { ...prefill_data, documentType: 'העתק נאמן למקור' },
    //     };
    //     await axios.post<Blob>(url, payloadCopy, {
    //       headers,
    //       responseType: 'arraybuffer',
    //     });
    //   } catch (e) { }
    // }

    return response.data;
  }


  async transformLinesToItemsTable(lines: any[]): Promise<any[]> {
    return lines.map(line => ({
      'סה"כ': `₪${Number(line.sumBefVatPerUnit * line.unitQuantity).toFixed(2)}`,
      'מחיר': `₪${Number(line.sumAftDisBefVatPerLine).toFixed(2)}`,
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

        default:
          throw new Error(`אמצעי תשלום לא ידוע: ${line.paymentMethod}`);
      }

      return {
        "סכום": `₪${Number(line.paymentSum).toFixed(2)}`,
        // "תאריך": line.paymentDate,
        "תאריך": this.formatDateToDDMMYYYY(line.paymentDate),
        "פירוט": details,
        "אמצעי תשלום": paymentMethodHebrew
      };
    });
  }



  async createDoc(data: any, userId: string, generatePdf: boolean = true): Promise<any> {

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {

      console.log("data is ", data);
      

      // 1. Increment general index (use manager for DB operation)
      await this.incrementGeneralIndex(userId, data.docData.issuerBusinessNumber, queryRunner.manager);

      // 2. Increment document-specific index
      console.log("🚀 ~ DocumentsService ~ createDoc ~ data.docData:", data.docData)

      const docDetails = await this.incrementCurrentIndex(userId, data.docData.issuerBusinessNumber, data.docData.docType, queryRunner.manager, data.docData.docNumber);
      if (!docDetails) {
        throw new HttpException('Error in update currentIndex', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 3. Save main document info
      const newDoc = await this.saveDocInfo(userId, data.docData, queryRunner.manager);
      if (!newDoc) {
        throw new HttpException('Error in saveDocInfo', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 4. Save line items
      await this.saveLinesInfo(userId, data.linesData, queryRunner.manager);

      // 5. Save payments
      await this.savePaymentsInfo(userId, data.paymentData, queryRunner.manager);

      // 6. Bookkeeping entry
      await this.bookkeepingService.createJournalEntry({
        issuerBusinessNumber: data.docData.issuerBusinessNumber,
        date: this.sharedService.normalizeToMySqlDate(data.docData.documentDate),
        referenceType: data.docData.docType,
        referenceId: parseInt(data.docData.docNumber),
        description: `${data.docData.docType} #${data.docData.docNumber} for ${data.docData.recipientName}`,
        lines: [
          { accountCode: '4000', credit: data.docData.sumAftDisBefVAT },
          { accountCode: '2400', credit: data.docData.vatSum },
        ]
      }, queryRunner.manager);

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

          // 8. Upload both PDFs to Firebase
          originalFilePath = await this.uploadToFirebase(
            originalBuffer,
            data.docData.issuerBusinessNumber,
            data.docData.generalDocIndex,
            data.docData.docType,
            data.docData.docDescription,
            'original'
          );
          
          copyFilePath = await this.uploadToFirebase(
            copyBuffer,
            data.docData.issuerBusinessNumber,
            data.docData.generalDocIndex,
            data.docData.docType,
            data.docData.docDescription,
            'copy'
          );

          // 9. Update document with Firebase paths
          const documentsRepo = queryRunner.manager.getRepository(Documents);
          newDoc.originalFile = originalFilePath;
          newDoc.copyFile = copyFilePath;
          await documentsRepo.save(newDoc);

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
        originalFile: originalFilePath,
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


  async previewDoc(data: any, userId: string, generatePdf: boolean = true): Promise<any> {

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

      // Default values set on the server
      const serverGeneratedValues = {
        issueDate: new Date(),
        docDate: data.docDate ? new Date(data.docDate) : new Date(),
        valueDate: data.valueDate ? new Date(data.valueDate) : new Date(),
        issueHour,
        isCancelled: data.isCancelled ?? false,
        docNumber: data.docNumber.toString(),
      };

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

        // Convert string to enum
        const vatOpts = VatOptions[vatOptsRaw as keyof typeof VatOptions];

        if (vatOpts === undefined) {
          throw new HttpException(`Invalid vatOpts value: ${vatOptsRaw}`, HttpStatus.BAD_REQUEST);
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
        console.log(`✅ Created initial setting for ${docType} for user ${userId}`);
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


}