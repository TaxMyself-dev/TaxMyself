import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { SourceType } from 'src/enum';
import { SettingDocuments } from './settingDocuments.entity';


@Injectable()
export class DocumentsService {

  private readonly apiClient: AxiosInstance;
  sessionID : string;

  constructor(
    @InjectRepository(SettingDocuments)
    private settingDocuments: Repository<SettingDocuments>,
  ) {}

  async getSettingDocByType(userId: string, documentType: number) {
    console.log("getSettingDocByType - in service");
    
    try {
      const docDetails = await this.settingDocuments.findOne({ where: { userId,  documentType} });
      if(!docDetails) {
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
      let docDetails = await this.settingDocuments.findOne({ where: { userId,  documentType} });
      if(!docDetails) {
        docDetails = await this.settingDocuments.save({ userId,  documentType, initialIndex, currentIndex: initialIndex });
        if(!docDetails) {
          throw new HttpException('Error in save', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }
      return docDetails;
    } 
    catch (error) {
      throw error;
    }
  }

}