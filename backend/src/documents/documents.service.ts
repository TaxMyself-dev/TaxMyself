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
    const url = 'https://api.fillfaster.com/v1/generatePDF';
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    try {

      // Generate the PDF
      const response = await axios.post<Blob>(url, data, {
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

  async createDoc(data: any, userId: string): Promise<any> {
    console.log("🚀 ~ DocumentsService ~ createDoc ~ data:", data)
    try {
      // Generate the PDF
      const pdfBlob = await this.generatePDF(data, userId);
      // Increment the general index
      await this.incrementGeneralIndex(userId);

      // Increment the current index
      const docDetails = await this.incrementCurrentIndex(userId, data.prefill_data.documentType);
      // Check if the increment is valid
      if (!docDetails) {
        throw new HttpException('Error in update currentIndex', HttpStatus.INTERNAL_SERVER_ERROR);
      };

      // Convert the paymentMethod from hebrew to english
      data.prefill_data.paymentMethod = this.convertPaymentMethod(data.prefill_data.paymentMethod);

      // Add the document to the database
      const newDoc = await this.addDoc(userId, data.prefill_data);
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
      await this.decrementCurrentIndex(userId, data.prefill_data.documentType);
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

  async addDoc(userId: string, body: any) {
    console.log("addDoc - in service");
    console.log("body: ", body);
    try {
      const doc = await this.documents.insert({ userId, ...body });
      if (!doc) {
        throw new HttpException('Error in save', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return doc;
    } catch (error) {
      throw error;
    }
  }


}