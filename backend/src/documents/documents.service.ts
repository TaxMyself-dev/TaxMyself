import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { SettingDocuments } from './settingDocuments.entity';
import { Documents } from './documents.entity';
import { DocLines } from './doc-lines.entity';
import { DocumentType, PaymentMethodType, VatOptions } from 'src/enum';



@Injectable()
export class DocumentsService {

  private readonly apiClient: AxiosInstance;
  sessionID: string;

  constructor(
    @InjectRepository(SettingDocuments)
    private settingDocuments: Repository<SettingDocuments>,
    @InjectRepository(Documents)
    private documentsRepo: Repository<Documents>,
    @InjectRepository(DocLines)
    private docLinesRepo: Repository<DocLines>,
  ) { }

  isIncrement: boolean = false;
  isGeneralIncrement: boolean = false;

  async getSettingDocByType(userId: string, documentType: DocumentType) {
    console.log("getSettingDocByType - in service");

    try {
      const docDetails = await this.settingDocuments.findOne({ where: { userId, documentType } });
      if (!docDetails) {
        throw new NotFoundException("not found userId or documentType")
      }
      return docDetails;
    }
    catch (error) {
      throw error;
    }
  }

  async setInitialDocDetails(userId: string, documentType: DocumentType, initialIndex: number) {
    console.log("updateSettingDocByType - in service");
    console.log("initialIndex: ", initialIndex);

    try {
      await this.settingGeneralIndex(userId);
      let docDetails = await this.settingDocuments.findOne({ where: { userId, documentType } });
      if (!docDetails) {
        docDetails = await this.settingDocuments.save({ userId, documentType, initialIndex, currentIndex: initialIndex });
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
    generalIndex = await this.settingDocuments.findOne({ where: { userId, documentType: DocumentType.GENERAL } });
    if (!generalIndex) {
      generalIndex = await this.settingDocuments.insert({ userId, documentType: DocumentType.GENERAL, initialIndex: 1000000, currentIndex: 1000000 });
      if (!generalIndex) {
        throw new HttpException('Error in add general serial number', HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async incrementGeneralIndex(userId: string) {
    console.log("incrementGeneralIndex - in service");
    let generalIndex: any;
    try {
      generalIndex = await this.settingDocuments.findOne({ where: { userId, documentType: DocumentType.GENERAL } });
      if (!generalIndex) {
        throw new NotFoundException("not found userId or documentType")
      }
      generalIndex = await this.settingDocuments.update({ userId, documentType: DocumentType.GENERAL }, { currentIndex: generalIndex.currentIndex + 1 });
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
      generalIndex = await this.settingDocuments.findOne({ where: { userId, documentType: DocumentType.GENERAL } });
      if (!generalIndex) {
        throw new NotFoundException("not found userId or documentType")
      }
      generalIndex = await this.settingDocuments.update({ userId, documentType: DocumentType.GENERAL }, { currentIndex: generalIndex.currentIndex - 1 });
      return generalIndex;
    } catch (error) {
      throw error;
    }
  }

  async generatePDF(data: any, userId: string): Promise<Blob | undefined> {
    console.log('in generate PDF function');
    console.log("docData is ", data.docData);
    console.log("line_0 is ", data.linesData[0].description);
    //console.log("line_1 is ", data.lines[1].description);
    
    const url = 'https://api.fillfaster.com/v1/generatePDF';
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const fileData =
    { "fid": "RVxpym2O68",
      "digitallySign": true,
      "prefill_data":
    { 
      "recipientName": data.docData.recipientName,
      "recipientTaxNumber": data.docData.recipientId,
      "docTitle": data.fileData.hebrewNameDoc  + " מספר " + data.docData.docNumber,
      "docDescription": "",
      "docDate": data.docData.docDate,
      "issuerDetails": 
        data.fileData.issuerName + '\n' +
        data.fileData.issuerPhone + '\n' +
        data.fileData.issuerEmail + '\n' +
        data.fileData.issuerAddress,
      "items_table": await this.transformLinesToItemsTable(data.linesData),
      "payments_table": await this.transformLinesToPaymentsTable(data.linesData),
      "subTotal": data.docData.sumAftDisBefVAT,
      "totalTax": data.docData.vatSum,
      "total": data.docData.sumAftDisWithVAT,
      "documentType": "מקור"
    }
  };

    try {

      // Generate the PDF
      const response = await axios.post<Blob>(url, fileData, {
        headers: headers,
        responseType: 'arraybuffer', // ensures the response is treated as a Blob
      });
      // Check if the response is valid
      if (!response.data) {
        throw new HttpException('Error in create PDF', HttpStatus.INTERNAL_SERVER_ERROR);
      };
      return response.data;
    }
    catch (error) {
      throw error;
    }
  }


  async transformLinesToItemsTable(lines: any[]): Promise<any[]> {
    return lines.map(line => ({
        "סכום": `₪${line.sumBefVat * line.unitAmount}`,
        "מחיר": `₪${line.sumBefVat}`,
        "כמות": String(line.unitAmount),
        "פירוט": line.description || ""
    }));
  }

  
  async transformLinesToPaymentsTable(lines: any[]): Promise<any[]> {
    return lines.map(line => {
      
      console.log("line is ", line);
      
      let sum: number;
      let details: string;
      let paymentMethodHebrew: string;

      console.log("line.vatOpts is ", line.vatOpts);
      
      if (line.vatOpts === 'INCLUDE') {
        sum = line.sumBefVat + (line.sumBefVat * line.vatRate / 100);
      } else if (line.vatOpts === 'EXCLUDE' || line.vatOpts === 'WITHOUT') {
        sum = line.sumBefVat;
      }

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
        "סכום": `₪${Number(sum).toFixed(2)}`,
        "תאריך": line.payDate,
        "פירוט": details,
        "אמצעי תשלום": paymentMethodHebrew
      };
    });
  }


  async createDoc(data: any, userId: string): Promise<any> {
    console.log("DocumentsService ~ createDoc ~ data:", data)
    try {
      // Generate the PDF
      const pdfBlob = await this.generatePDF(data, userId);
      // Increment the general index
      await this.incrementGeneralIndex(userId);

      // Increment the current index
      const docDetails = await this.incrementCurrentIndex(userId, data.docData.documentType);
      // Check if the increment is valid
      if (!docDetails) {
        throw new HttpException('Error in update currentIndex', HttpStatus.INTERNAL_SERVER_ERROR);
      };

      // Convert the paymentMethod from hebrew to english
      data.docData.paymentMethod = this.convertPaymentMethod(data.docData.paymentMethod);

      // Add the document to the database
      const newDoc = await this.saveDocInfo(userId, data.docData);
      // Check if the document was added successfully
      if (!newDoc) {
        throw new HttpException('Error in saveDocInfo', HttpStatus.INTERNAL_SERVER_ERROR);
      };

       // Add the lines to the database
       await this.saveLinesInfo(userId, data.linesData);

      return pdfBlob;
    }
    catch (error) {
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

  async incrementCurrentIndex(userId: string, documentType: DocumentType) {
    console.log("incrementCurrentIndex - in service");
    let docDetails: any;
    try {
      docDetails = await this.settingDocuments.findOne({ where: { userId, documentType } });
      if (!docDetails) {
        throw new NotFoundException("not found userId or documentType")
      }
      docDetails = await this.settingDocuments.update({ userId, documentType }, { currentIndex: docDetails.currentIndex + 1 });
      this.isIncrement = true;
      return docDetails;
    } catch (error) {
      throw error;
    }
  }

  async decrementCurrentIndex(userId: string, documentType: DocumentType) {
    if (!this.isIncrement) {
      console.log("not increment");
      return;
    }
    let docDetails: any;
    try {
      console.log("decrementCurrentIndex - in service");
      docDetails = await this.settingDocuments.findOne({ where: { userId, documentType } });
      if (!docDetails) {
        throw new NotFoundException("not found userId or documentType")
      }
      docDetails = await this.settingDocuments.update({ userId, documentType }, { currentIndex: docDetails.currentIndex - 1 });
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
  

}