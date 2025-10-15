import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
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
  ) { }

  isIncrement: boolean = false;
  isGeneralIncrement: boolean = false;

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


  async getCurrentIndexes(
    userId: string,
    docType: DocumentType
  ): Promise<{ docIndex: number; generalIndex: number | null; isInitial: boolean }> {

    const [docSetting, generalSetting] = await Promise.all([
      this.settingDocuments.findOne({ where: { userId, docType } }),
      this.settingDocuments.findOne({ where: { userId, docType: DocumentType.GENERAL } }),
    ]);

    const isInitial = !docSetting || docSetting.currentIndex === 0;

    return {
      docIndex: docSetting?.currentIndex ?? 0,              // 0 means uninitialized
      generalIndex: generalSetting?.currentIndex ?? null,   // Only return if exists
      isInitial,
    };
  }


  async setInitialDocDetails(userId: string, docType: DocumentType, initialIndex: number) {

    try {
      await this.settingGeneralIndex(userId);
      let docDetails = await this.settingDocuments.findOne({ where: { userId, docType } });
      if (!docDetails) {
        docDetails = await this.settingDocuments.save({ userId, docType, initialIndex, currentIndex: initialIndex });
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

  async settingGeneralIndex(userId: string) {
    let generalIndex: any;
    generalIndex = await this.settingDocuments.findOne({ where: { userId, docType: DocumentType.GENERAL } });
    if (!generalIndex) {
      generalIndex = await this.settingDocuments.insert({ userId, docType: DocumentType.GENERAL, initialIndex: 1000000, currentIndex: 1000000 });
      if (!generalIndex) {
        throw new HttpException('Error in add general serial number', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async incrementGeneralIndex(userId: string) {

    let generalIndex: any;
    
    try {
      generalIndex = await this.settingDocuments.findOne({ where: { userId, docType: DocumentType.GENERAL } });
      if (!generalIndex) {
        throw new NotFoundException("not found userId or documentType")
      }
      generalIndex = await this.settingDocuments.update({ userId, docType: DocumentType.GENERAL }, { currentIndex: generalIndex.currentIndex + 1 });
      this.isGeneralIncrement = true;
      return generalIndex;
    } catch (error) {
      throw error;
    }
  }

  async decrementGeneralIndex(userId: string) {
    if (!this.isGeneralIncrement) {
      return;
    }
    let generalIndex: any;
    try {
      generalIndex = await this.settingDocuments.findOne({ where: { userId, docType: DocumentType.GENERAL } });
      if (!generalIndex) {
        throw new NotFoundException("not found userId or documentType")
      }
      generalIndex = await this.settingDocuments.update({ userId, docType: DocumentType.GENERAL }, { currentIndex: generalIndex.currentIndex - 1 });
      return generalIndex;
    } catch (error) {
      throw error;
    }
  }


  async generatePDF(data: any, templateType: string): Promise<Blob> {

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
          docDate: data.docData.docDate,
          issuerDetails: [
            data.docData.issuerName,
            data.docData.issuerPhone,
            data.docData.issuerEmail,
            data.docData.issuerAddress,
          ].filter(Boolean).join('\n'),
          items_table: await this.transformLinesToItemsTable(data.linesData),
          subTotal: data.docData.sumAftDisBefVAT,
          totalTax: data.docData.vatSum,
          total: data.docData.sumAftDisWithVAT,
          documentType: 'מקור',
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

    return response.data;
  }



  async transformLinesToItemsTable(lines: any[]): Promise<any[]> {
    
    console.log("lines is ", lines);
    
    return lines.map(line => ({
        "סכום": `₪${line.sumBefVatPerUnit * line.unitQuantity}`,
        "מחיר": `₪${line.sumAftDisBefVatPerLine}`,
        "כמות": String(line.unitQuantity),
        "פירוט": line.description || ""
    }));
  }


    async transformLinesToPaymentsTable(PaymentLines: any[]): Promise<any[]> {
    
    return PaymentLines.map(line => {
      
      console.log("line is ", line);
      
      // let sum: number;
      let details: string;
      let paymentMethodHebrew: string;

      switch (line.paymentMethod) {
        case 'CASH':
          details = 'שולם במזומן';
          paymentMethodHebrew = 'מזומן';
          break;
        case 'BANK_TRANSFER':
          details = `${line.accountNumber} - חשבון ,${line.branchNumber} - סניף ,${line.bankNumber} - בנק`;
          paymentMethodHebrew = 'העברה בנקאית';
          break;
        case 'CHECK':
          details = `${line.checkNumber} - מספר המחאה`;
          paymentMethodHebrew = 'צ׳ק';
          break;
        case 'CREDIT_CARD':
          details = `${line.card4Number} - ${line.cardCompany}`;
          paymentMethodHebrew = 'כרטיס אשראי';
          break;
        default:
          throw new Error(`אמצעי תשלום לא ידוע: ${line.paymentMethod}`);
      }

      return {
        "סכום": `₪${Number(line.paymentAmount).toFixed(2)}`,
        "תאריך": line.paymentDate,
        "פירוט": details,
        "אמצעי תשלום": paymentMethodHebrew
      };
    });
  }

  
  async createDoc(data: any, userId: string, generatePdf: boolean = true): Promise<any> {
    
    try {

      // Generate the PDF
      let pdfBlob = null;
      if (generatePdf) {
        // Only generate the PDF if requested
        pdfBlob = await this.generatePDF(data, "createDoc");
      }

      // Increment the general index
      await this.incrementGeneralIndex(userId);

      // Increment the current index
      const docDetails = await this.incrementCurrentIndex(userId, data.docData.docType);
      // Check if the increment is valid
      if (!docDetails) {
        throw new HttpException('Error in update currentIndex', HttpStatus.INTERNAL_SERVER_ERROR);
      };

      // Add the document to the database
      const newDoc = await this.saveDocInfo(userId, data.docData);
      // Check if the document was added successfully
      if (!newDoc) {
        throw new HttpException('Error in saveDocInfo', HttpStatus.INTERNAL_SERVER_ERROR);
      };

      //console.log("After save doc");

      // Add the lines to the database
      await this.saveLinesInfo(userId, data.linesData);

      // Add the lines to the database
      await this.savePaymentsInfo(userId, data.paymentData);
      
      await this.bookkeepingService.createJournalEntry({
        issuerBusinessNumber: data.docData.issuerBusinessNumber,
        date: data.docData.docDate,
        referenceType: data.docData.docType,
        referenceId: parseInt(data.docData.docNumber),
        description: `${data.docData.docType} #${data.docData.docNumber} for ${data.docData.recipientName}`,
        lines: [
          { accountCode: '4000', credit: data.docData.sumAftDisBefVAT },
          { accountCode: '2400', credit: data.docData.vatSum },
        ]
      });

      return pdfBlob;
    }

    catch (error) {

      console.error('❌ Error in createDoc:', error);
    
      // Cancel the increment general index
      await this.decrementGeneralIndex(userId);

      // Cancel the increment current index
      await this.decrementCurrentIndex(userId, data.docData.documentType);
    
      throw error;
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

  async incrementCurrentIndex(userId: string, docType: DocumentType) {
    let docDetails: any;
    try {
      docDetails = await this.settingDocuments.findOne({ where: { userId, docType } });
      if (!docDetails) {
        throw new NotFoundException("not found userId or documentType")
      }
      docDetails = await this.settingDocuments.update({ userId, docType }, { currentIndex: docDetails.currentIndex + 1 });
      this.isIncrement = true;
      return docDetails;
    } catch (error) {
      throw error;
    }
  }

  async decrementCurrentIndex(userId: string, docType: DocumentType) {
    if (!this.isIncrement) {
      console.log("not increment");
      return;
    }
    let docDetails: any;
    try {
      console.log("decrementCurrentIndex - in service");
      docDetails = await this.settingDocuments.findOne({ where: { userId, docType } });
      if (!docDetails) {
        throw new NotFoundException("not found userId or documentType")
      }
      docDetails = await this.settingDocuments.update({ userId, docType }, { currentIndex: docDetails.currentIndex - 1 });
      return docDetails;
    } catch (error) {
      throw error;
    }
  }


  async saveDocInfo(userId: string, data: any) {
  
    try {

      // Get current time in HHMM format
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0'); // Ensures 2 digits
      const minutes = now.getMinutes().toString().padStart(2, '0'); // Ensures 2 digits
      const issueHour = `${hours}${minutes}`; // Format as HHMM
  
      // Default values set on the server
      const serverGeneratedValues = {
        issueDate: new Date(),
        docDate: data.docDate ? new Date(data.docDate) : new Date(),
        valueDate: data.valueDate ? new Date(data.valueDate) : new Date(),
        issueHour,
        isCancelled: data.isCancelled ?? false, // Default false if not provided
        docNumber: data.docNumber.toString(), // Ensure string type
      };
  
      // Merge body with server-generated values
      const docData = { userId, ...data, ...serverGeneratedValues };
  
      // Insert into database
      const doc = await this.documentsRepo.insert(docData);
  
      if (!doc) {
        throw new HttpException('Error in save', HttpStatus.INTERNAL_SERVER_ERROR);
      }
  
      return doc;
    } catch (error) {
      console.error("Error in saveDocInfo: ", error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  async saveLinesInfo(userId: string, data: any[]) {

    if (!Array.isArray(data)) {
      throw new HttpException('Expected an array of data', HttpStatus.BAD_REQUEST);
    }
    
    try {
      for (const item of data) {
        
        const vatOptsRaw = item.vatOpts;

        // Convert string to enum value
        const vatOpts = VatOptions[vatOptsRaw as keyof typeof VatOptions];

        if (vatOpts === undefined) {
          throw new HttpException(`Invalid vatOpts value: ${vatOptsRaw}`, HttpStatus.BAD_REQUEST);
        }

        // const linesData = { userId, ...item, vatOpts, paymentMethod };
        const linesData = { userId, ...item, vatOpts };
        await this.docLinesRepo.insert(linesData); // If this fails, it will throw
      }
      // No need to return anything
    } catch (error) {
      console.error("Error in saveLinesInfo: ", error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  async savePaymentsInfo(userId: string, data: any[]) {

    if (!Array.isArray(data)) {
      throw new HttpException('Expected an array of data', HttpStatus.BAD_REQUEST);
    }
  
    try {
      for (const item of data) {
        
        const paymentsData = { userId, ...item };
        await this.docPaymentsRepo.insert(paymentsData);
      }
      // No need to return anything
    } catch (error) {
      console.error("Error in savePaymentsInfo: ", error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  async generateMultipleDocs(userId: string): Promise<any[]> {

    const docs = [];

    // Ensure settings exist before starting
    await this.ensureDocumentSettingsExist(userId);
  
    const docCounters: Record<string, number> = {
      RECEIPT: 1000,
      TAX_INVOICE: 2000,
      TAX_INVOICE_RECEIPT: 3000,
      TRANSACTION_INVOICE: 4000,
      CREDIT_INVOICE: 5000,
    };
  
    for (let i = 0; i < 10; i++) {
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


  async ensureDocumentSettingsExist(userId: string): Promise<void> {

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
      const existing = await this.settingDocuments.findOne({
        where: { userId, docType },
      });
  
      if (!existing) {
        await this.settingDocuments.save({
          userId,
          docType,
          initialIndex: defaultInitialValues[docType],
          currentIndex: defaultInitialValues[docType],
        });
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
    const generalDocIndex = (1000010 + index).toString();
  
    // Random description
    const descriptions = ['בדיקה אוטומטית', 'מסמך בדיקה', 'בדיקה מספרית', 'בדיקה מהירה', 'בדיקה אקראית'];
    const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];

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
        recipientName: 'אבי אוחיון',
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
        //sumBefDisBefVat: 1000,
        sumBefDisBefVat: sumBefDisBefVat,
        disSum: 0,
        //sumAftDisBefVAT: 1000,
        sumAftDisBefVAT: sumAftDisBefVat,
        //vatSum: 180,
        vatSum: vatSum,
        //sumAftDisWithVAT: 1180,
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
      ]: []
    };
  }
  

}