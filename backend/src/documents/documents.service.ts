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

    console.log("getSettingDocByType - in service");
    console.log("userId: ", userId);
    console.log("docType: ", docType);
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


  // async getCurrentIndexes(userId: string, docType: DocumentType): Promise<{ docIndex: number; generalIndex: number }> {
  //   const [docSetting, generalSetting] = await Promise.all([
  //     this.settingDocuments.findOne({ where: { userId, docType } }),
  //     this.settingDocuments.findOne({ where: { userId, docType: DocumentType.GENERAL } }),
  //   ]);
  
  //   if (!docSetting) {
  //     throw new HttpException(`Document settings for type "${docType}" not found`, HttpStatus.NOT_FOUND);
  //   }
  
  //   if (!generalSetting) {
  //     throw new HttpException(`Document settings for type "GENERAL" not found`, HttpStatus.NOT_FOUND);
  //   }
  
  //   return {
  //     docIndex: docSetting.currentIndex,
  //     generalIndex: generalSetting.currentIndex,
  //   };
  // }


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
    console.log("updateSettingDocByType - in service");
    console.log("initialIndex: ", initialIndex);

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
    console.log("settingGeneralIndex - in service");
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
    console.log("incrementGeneralIndex - in service");
    let generalIndex: any;

    console.log("userId is ", userId);
    
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
      console.log("not increment");
      return;
    }
    console.log("decrementGeneralIndex - in service");
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

  // async generatePDF(data: any, userId: string): Promise<Blob | undefined> {
  //   console.log('in generate PDF function');
  //   // console.log("docData is ", data.docData);
  //   // console.log("line_0 is ", data.linesData[0].description);
  //   //console.log("line_1 is ", data.lines[1].description);
    
  //   const url = 'https://api.fillfaster.com/v1/generatePDF';
  //   const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';

  //   const headers = {
  //     'Authorization': `Bearer ${token}`,
  //     'Content-Type': 'application/json'
  //   };

  //   // const fileData =
  //   // { "fid": "RVxpym2O68",
  //   //   "digitallySign": true,
  //   //   "prefill_data":
  //   //   { 
  //   //     "recipientName": data.docData.recipientName,
  //   //     "recipientTaxNumber": data.docData.recipientId,
  //   //     "docTitle": data.fileData.hebrewNameDoc  + " מספר " + data.docData.docNumber,
  //   //     "docDescription": "",
  //   //     "docDate": data.docData.docDate,
  //   //     "issuerDetails": 
  //   //       data.fileData.issuerName + '\n' +
  //   //       data.fileData.issuerPhone + '\n' +
  //   //       data.fileData.issuerEmail + '\n' +
  //   //       data.fileData.issuerAddress,
  //   //     "items_table": await this.transformLinesToItemsTable(data.linesData),
  //   //     "payments_table": await this.transformLinesToPaymentsTable(data.linesData),
  //   //     "subTotal": data.docData.sumAftDisBefVAT,
  //   //     "totalTax": data.docData.vatSum,
  //   //     "total": data.docData.sumAftDisWithVAT,
  //   //     "documentType": "מקור",
  //   //     "paymentMethod": data.docData.paymentMethod,
  //   //   }
  //   // };

  //   const fileData =
  //   { "fid": "ydAEQsvSbC",
  //     "digitallySign": true,
  //     "prefill_data":
  //     { 
  //       "name": "Elazar Harel",
  //       "id": "123456789",
  //     }
  //   };



  //   try {

  //     // Generate the PDF
  //     const response = await axios.post<Blob>(url, fileData, {
  //       headers: headers,
  //       responseType: 'arraybuffer', // ensures the response is treated as a Blob
  //     });
  //     // Check if the response is valid
  //     if (!response.data) {
  //       throw new HttpException('Error in create PDF', HttpStatus.INTERNAL_SERVER_ERROR);
  //     };
  //     return response.data;
  //   }
  //   catch (error) {
  //     throw error;
  //   }
  // }


  async generatePDF(data: any, templateType: string): Promise<Blob> {

    console.log("templateType is ", templateType);
    console.log("data is ", data);

    console.log("name is ", data.docData.hebrewNameDoc);
    

    let fid: string;
    let prefill_data: any;
    
    const url = 'https://api.fillfaster.com/v1/generatePDF';
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';

    switch (templateType) {
      case 'createDoc':
        fid = 'RVxpym2O68';
        prefill_data = {
          recipientName: data.docData.recipientName,
          recipientTaxNumber: data.docData.recipientId,
          docTitle: `${data.docData.hebrewNameDoc} מספר ${data.docData.docNumber}`,
          docDate: data.docData.docDate,
          issuerDetails:
            `${data.docData.issuerName}\n${data.docData.issuerPhone}\n${data.docData.issuerEmail}\n${data.docData.issuerAddress}`,
          items_table: await this.transformLinesToItemsTable(data.linesData),
          payments_table: await this.transformLinesToPaymentsTable(data.paymentData),
          subTotal: data.docData.sumAftDisBefVAT,
          totalTax: data.docData.vatSum,
          total: data.docData.sumAftDisWithVAT,
          documentType: 'מקור',
          paymentMethod: data.docData.paymentMethod,
        };
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
      digitallySign: true,
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

  
  // async transformLinesToPaymentsTable(lines: any[]): Promise<any[]> {

  //   return lines.map(line => {
      
  //     console.log("line is ", line);
      
  //     let sum: number;
  //     let details: string;
  //     let paymentMethodHebrew: string;

  //     console.log("line.vatOpts is ", line.vatOpts);
      
  //     if (line.vatOpts === 'INCLUDE') {
  //       sum = line.sumBefVat + (line.sumBefVat * line.vatRate / 100);
  //     } else if (line.vatOpts === 'EXCLUDE' || line.vatOpts === 'WITHOUT') {
  //       sum = line.sumBefVat;
  //     }

  //     switch (line.paymentMethod) {
  //       case 'CASH':
  //         details = 'שולם במזומן';
  //         paymentMethodHebrew = 'מזומן';
  //         break;
  //       case 'BANK_TRANSFER':
  //         details = `${line.accountNumber} - חשבון ,${line.branchNumber} - סניף ,${line.bankNumber} - בנק`;
  //         paymentMethodHebrew = 'העברה בנקאית';
  //         break;
  //       case 'CHECK':
  //         details = `${line.checkNumber} - מספר המחאה`;
  //         paymentMethodHebrew = 'צ׳ק';
  //         break;
  //       case 'CREDIT_CARD':
  //         details = `${line.card4Number} - ${line.cardCompany}`;
  //         paymentMethodHebrew = 'כרטיס אשראי';
  //         break;
  //       default:
  //         throw new Error(`אמצעי תשלום לא ידוע: ${line.paymentMethod}`);
  //     }

  //     return {
  //       "סכום": `₪${Number(sum).toFixed(2)}`,
  //       "תאריך": line.payDate,
  //       "פירוט": details,
  //       "אמצעי תשלום": paymentMethodHebrew
  //     };
  //   });
  // }


  async createDoc(data: any, userId: string, generatePdf: boolean = true): Promise<any> {

    console.log("createDoc in service - start");
    
    console.log("DocumentsService ~ createDoc ~ data:", data)

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

      console.log("docDetails is ", docDetails);
      
      // Convert the paymentMethod from hebrew to english
      //data.docData.paymentMethod = this.convertPaymentMethod(data.docData.paymentMethod);

      // Add the document to the database
      const newDoc = await this.saveDocInfo(userId, data.docData);
      // Check if the document was added successfully
      if (!newDoc) {
        throw new HttpException('Error in saveDocInfo', HttpStatus.INTERNAL_SERVER_ERROR);
      };

      console.log("After save doc");

      // Add the lines to the database
      await this.saveLinesInfo(userId, data.linesData);

      console.log("After save lines");

      // Add the jouranl entry to the database
      await this.bookkeepingService.createJournalEntry({
        businessNumber: data.docData.issuerbusinessNumber,
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
    console.log("incrementCurrentIndex - in service");
    console.log("documentType is ", docType);
    let docDetails: any;
    try {
      docDetails = await this.settingDocuments.findOne({ where: { userId, docType } });
      if (!docDetails) {
        throw new NotFoundException("not found userId or documentType")
      }
      console.log("docDetails is ", docDetails);
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
    console.log("saveDocInfo - in service");
    console.log("data: ", data);
  
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

        console.log("vatOpts is ", item.vatOpts);
        console.log("unitAmount is ", item.unitAmount);
        
        const vatOptsRaw = item.vatOpts;
        const paymentMethodRaw = item.paymentMethod;
        console.log("vatOptsRaw is ", vatOptsRaw);

        // Convert string to enum value
        const vatOpts = VatOptions[vatOptsRaw as keyof typeof VatOptions];
        const paymentMethod = PaymentMethodType[paymentMethodRaw as keyof typeof PaymentMethodType];

        if (vatOpts === undefined) {
          throw new HttpException(`Invalid vatOpts value: ${vatOptsRaw}`, HttpStatus.BAD_REQUEST);
        }

        const linesData = { userId, ...item, vatOpts, paymentMethod };
        await this.docLinesRepo.insert(linesData); // If this fails, it will throw
      }
      // No need to return anything
    } catch (error) {
      console.error("Error in saveLinesInfo: ", error);
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
  
    for (let i = 0; i < 1; i++) {
      const data = this.generateDocData(i, docCounters);
      try {
        const pdfBlob = await this.createDoc(data, userId, false);
        docs.push(pdfBlob);
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
  
    const docDate = new Date(2025, 3, 18).toISOString().split('T')[0]; // 2025-04-18
  
    return {
      fileData: {
        issuerName: 'אוריה הראל אדריכלות',
        issuerAddress: 'נוב',
        issuerPhone: '0545401296',
        issuerEmail: 'harelazar@gmail.com',
        hebrewNameDoc: 'קבלה'
      },
      docData: {
        issuerbusinessNumber: '204245724',
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
        generalDocIndex: generalDocIndex,
        docDescription: randomDescription,
        docNumber: docNumber,
        docVatRate: 18,
        transType: 3,
        amountForeign: 0,
        currency: 'ILS',
        sumBefDisBefVat: 1000,
        disSum: 0,
        sumAftDisBefVAT: 1000,
        vatSum: 180,
        sumAftDisWithVAT: 1180,
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
          issuerbusinessNumber: '204245724',
          generalDocIndex: generalDocIndex,
          description: 'דוגמה',
          unitAmount: 1,
          sumBefVat: 1000,
          sumAftDisWithVat: 1180,
          vatOpts: 'EXCLUDE',
          vatRate: 18,
          paymentMethod: 'CASH',
          disBefVat: 0,
          lineNumber: '1',
          unitType: 1,
          payDate: docDate,
          bankNumber: null,
          branchNumber: null,
          accountNumber: null,
          checkNumber: null,
          paymentCheckDate: null,
          cardCompany: null,
          card4Number: null,
          creditCardName: null,
          creditTransType: null,
          creditPayNumber: null,
          manufacturerName: null,
          productSerialNumber: null,
          internalNumber: null,
          journalEntryMainId: null
        }
      ]
    };
  }
  


}