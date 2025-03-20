import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { SettingDocuments } from './settingDocuments.entity';
import { Documents } from './documents.entity';
import { DocumentType } from 'src/enum';



@Injectable()
export class DocumentsService {

  private readonly apiClient: AxiosInstance;
  sessionID: string;

  constructor(
    @InjectRepository(SettingDocuments)
    private settingDocuments: Repository<SettingDocuments>,
    @InjectRepository(Documents)
    private documents: Repository<Documents>,
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
    console.log("data is ", data);
    console.log("line_0 is ", data.lines[0].description);
    console.log("line_1 is ", data.lines[1].description);
    



    
    const url = 'https://api.fillfaster.com/v1/generatePDF';
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // const fileData = {
    //   "fid": data.fid,
    //   "digitallySign": true,
    //   "prefill_data": {
    //     "recipientName": data.prefill_data.recipientName,
    //     "recipientTaxNumber": data.prefill_data.recipientId,
    //     "docTitle": `${data.prefill_data.docType} ${data.prefill_data.docNumber}`,
    //     "docDescription": data.prefill_data.docDescription,
    //     "docDate": data.prefill_data.docDate,
    //     "issuerName": data.prefill_data.issuerName,
    //     "issuerbusinessNumber": data.prefill_data.issuerbusinessNumber,
    //     "issuerAddress": data.prefill_data.issuerAddress,
    //     "issuerPhone": data.prefill_data.issuerPhone,
    //     "issuerEmail": data.prefill_data.issuerEmail,
    //     "subTotal": data.prefill_data.sumBefDisBefVat,
    //     "totalTax": data.prefill_data.vatSum,
    //     "total": data.prefill_data.sumAftDisWithVAT,
    //     "documentType": data.prefill_data.docType,
    //     "items_table": [
    //       {
    //           "סכום": "$2,000",
    //           "מחיר": "$1,000",
    //           "כמות": "2",
    //           "פירוט": "Website Development"
    //       },
    //       {
    //           "סכום": "$500",
    //           "מחיר": "$250",
    //           "כמות": "2",
    //           "פירוט": "Hosting Services"
    //       }
    //     ],
    //     "payments_table": [
    //       {
    //           "סכום": "$1,000",
    //           "תאריך": "2025-03-20",
    //           "פירוט": "First payment",
    //           "אמצעי תשלום": "Bank Transfer"
    //       },
    //       {
    //           "סכום": "$1,500",
    //           "תאריך": "2025-03-25",
    //           "פירוט": "Final payment",
    //           "אמצעי תשלום": "Credit Card"
    //       }
    //     ],
    //   }
    // };


    const fileData =
    { "fid": "RVxpym2O68",
      "digitallySign": true,
      "prefill_data":
    { 
      "recipientName": data.generalData.recipientName,
      "recipientTaxNumber": data.generalData.recipientId,
      "docTitle": "data.prefill_data.docType" ,
      "docDescription": "Invoice for web development services",
      "docDate": "2025-03-19",
      "issuerName": "Tech Solutions Ltd.",
      "issuerbusinessNumber": "987654321",
      "issuerAddress": "123 Tech Street, Da Nang, Vietnam",
      "issuerPhone": "+84-123-456-7890",
      "issuerEmail": "contact@techsolutions.com",
      "items_table": await this.transformLinesToItemsTable(data.lines),
      // "items_table": [
      //     {
      //         "סכום": "$2,000",
      //         "מחיר": "$1,000",
      //         "כמות": "2",
      //         "פירוט": "Website Development"
      //     },
      //     {
      //         "סכום": "$500",
      //         "מחיר": "$250",
      //         "כמות": "2",
      //         "פירוט": "Hosting Services"
      //     }
      // ],
      "payments_table": [
          {
              "סכום": "$1,000",
              "תאריך": "2025-03-20",
              "פירוט": "First payment",
              "אמצעי תשלום": "Bank Transfer"
          },
          {
              "סכום": "$1,500",
              "תאריך": "2025-03-25",
              "פירוט": "Final payment",
              "אמצעי תשלום": "Credit Card"
          }
      ],
      "subTotal": "$2,500",
      "totalTax": "$450",
      "total": "$2,950",
      "documentType": "Original"
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
        "סכום": `$${line.sumBefVat ?? 0}`,  // Convert numbers to strings with $
        "מחיר": `$${line.unitAmount ?? 0}`,
        "כמות": String(line.quantity ?? 1), // Ensure quantity is a string
        "פירוט": line.description || ""
    }));
  }


  async createDoc(data: any, userId: string): Promise<any> {
    console.log("🚀 ~ DocumentsService ~ createDoc ~ data:", data)
    try {
      // Generate the PDF
      const pdfBlob = await this.generatePDF(data, userId);
      // Increment the general index
      await this.incrementGeneralIndex(userId);

      // Increment the current index
      const docDetails = await this.incrementCurrentIndex(userId, data.generalData.documentType);
      // Check if the increment is valid
      if (!docDetails) {
        throw new HttpException('Error in update currentIndex', HttpStatus.INTERNAL_SERVER_ERROR);
      };

      // Convert the paymentMethod from hebrew to english
      data.generalData.paymentMethod = this.convertPaymentMethod(data.generalData.paymentMethod);

      // Add the document to the database
      const newDoc = await this.addDoc(userId, data.generalData);
      // Check if the document was added successfully
      if (!newDoc) {
        throw new HttpException('Error in addDoc', HttpStatus.INTERNAL_SERVER_ERROR);
      };

      return pdfBlob;
    }
    catch (error) {
      // Cancel the increment general index
      await this.decrementGeneralIndex(userId);
      // Cancel the increment current index
      await this.decrementCurrentIndex(userId, data.generalData.documentType);
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


  // async addDoc(userId: string, body: any) {
  //   console.log("addDoc - in service");
  //   console.log("body: ", body);
  //   try {
  //     const doc = await this.documents.insert({ userId, ...body });
  //     if (!doc) {
  //       throw new HttpException('Error in save', HttpStatus.INTERNAL_SERVER_ERROR);
  //     }
  //     return doc;
  //   } catch (error) {
  //     throw error;
  //   }
  // }



  async addDoc(userId: string, body: any) {
    console.log("addDoc - in service");
    console.log("body: ", body);
  
    try {
      // // Ensure required fields are present
      // if (!body.docType || !body.docNumber || !body.docVatRate || !body.sumBefDisBefVat) {
      //   throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      // }

      // Get current time in HHMM format
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0'); // Ensures 2 digits
      const minutes = now.getMinutes().toString().padStart(2, '0'); // Ensures 2 digits
      const issueHour = `${hours}${minutes}`; // Format as HHMM
  
      // Default values set on the server
      const serverGeneratedValues = {
        issueDate: new Date(),
        docDate: body.docDate ? new Date(body.docDate) : new Date(),
        valueDate: body.valueDate ? new Date(body.valueDate) : new Date(),
        issueHour,
        isCancelled: body.isCancelled ?? false, // Default false if not provided
        docNumber: body.docNumber.toString(), // Ensure string type
      };

      console.log("issueHour is ", serverGeneratedValues.issueHour);
      
  
      // Ensure the provided `docType` and `currency` are valid enum values
      // if (!(body.docType in DocumentType)) {
      //   throw new HttpException(`Invalid docType: ${body.docType}`, HttpStatus.BAD_REQUEST);
      // }
      // if (!(body.currency in Currency)) {
      //   throw new HttpException(`Invalid currency: ${body.currency}`, HttpStatus.BAD_REQUEST);
      // }
  
      // Merge body with server-generated values
      const docData = { userId, ...body, ...serverGeneratedValues };
  
      // Insert into database
      const doc = await this.documents.insert(docData);
  
      if (!doc) {
        throw new HttpException('Error in save', HttpStatus.INTERNAL_SERVER_ERROR);
      }
  
      return doc;
    } catch (error) {
      console.error("Error in addDoc: ", error);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  



}