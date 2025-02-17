import { Injectable, HttpException, HttpStatus, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { SourceType } from 'src/enum';
import { SettingDocuments } from './settingDocuments.entity';


@Injectable()
export class DocumentsService {

  private readonly apiClient: AxiosInstance;
  sessionID: string;

  constructor(
    @InjectRepository(SettingDocuments)
    private settingDocuments: Repository<SettingDocuments>,
  ) { }

  async getSettingDocByType(userId: string, documentType: number) {
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

  async setInitialDocDetails(userId: string, documentType: number, initialIndex: number) {
    console.log("updateSettingDocByType - in service");
    console.log("initialIndex: ", initialIndex);

    try {
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

  async createPDF(data: any): Promise<Blob | undefined> {
    console.log('in createPDF function');

    const url = 'https://api.fillfaster.com/v1/generatePDF';
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    try {
      const response = await axios.post<Blob>(url, data, {
        headers: headers,
        responseType: 'arraybuffer', // ensures the response is treated as a Blob
      });
      console.log('response.data:', response.data);

      return response.data;
    }
    catch (error) {
      console.error('Error in createPDF:', error);
      throw error;
      //throw new InternalServerErrorException("something went wrong in create PDF");
    }
  }

  async updateCurrentIndex(userId: string, documentType: number) {
    console.log("updateCurrentIndex - in service");
    let docDetails;
    docDetails = await this.settingDocuments.findOne({ where: { userId, documentType } });
    if (!docDetails) {
      throw new NotFoundException("not found userId or documentType")
    }
    docDetails = this.settingDocuments.update({ userId, documentType }, { currentIndex: docDetails.currentIndex + 1 });
  }

}