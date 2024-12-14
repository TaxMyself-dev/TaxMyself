import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import { Finsite } from './finsite.entity';
import { Repository } from 'typeorm';
import { SourceType } from 'src/enum';


@Injectable()
export class FinsiteService {

  private readonly apiClient: AxiosInstance;
  sessionID : string;

  constructor(
    @InjectRepository(Finsite)
    private finsiteRepo: Repository<Finsite>,
  ) {
    this.apiClient = axios.create({
      baseURL: 'https://app.finsite.co.il/api/Kraken/ExternalAPI',
      headers: { 'Content-Type': 'application/json' },
    });
  }


  async getFinsiteBills(Username: string, Password: string): Promise<any> {

    this.sessionID = await this.getFinsiteToken(Username, Password);

    const companies = await this.getCompanies(this.sessionID);
    const accounts = await this.getAccounts(this.sessionID);
    const bookingAccounts = await this.getBookingAccounts(this.sessionID);

    const companiesData = companies.Entities.map((company: any) => ({
      id: company.EntryID,
      name: company.Name,
      accounts: [],
    }));

    companiesData.forEach(company => {
      company.accounts = accounts.Entities.filter((account: any) => account.CompanyID === company.id);
    });

    const paymentMethods = bookingAccounts.Entities.map((method: any) => ({
      id: method.EntryID,
      accountId: method.AccountID,
      subtype: method.Subtype,
      bookingAccountCode: method.BookingAccountCode,
      currency: method.Currency,
      cc4Digits: method.CC4Digits,
      isActiveDownload: method.IsActiveDownload,
      isActiveUpload: method.IsActiveUpload,
    }));

    companiesData.forEach(company => {
      company.accounts.forEach(account => {
        account.paymentMethods = paymentMethods.filter(
          method => method.accountId === account.EntryID
        );
      });
    });

    console.log("companiesData is ", companiesData);
    let isAllDataExist: boolean = true;
    // Save each payment method in the Finsite entity
    for (const company of companiesData) {
      for (const account of company.accounts) {
        //console.log("######### account is ", account);

        for (const method of account.paymentMethods) {          

          // Save only if subtype is "CreditCard" or "Current"
          if (method.subtype !== 'CreditCard' && method.subtype !== 'Current') {
            continue;
          }

          //console.log("--------method is ", method);

          // Check if the method.id already exists in the database
          const existingRecord = await this.finsiteRepo.findOneBy({ getTransFid: method.id });
          if (existingRecord) {
            console.log(`Skipping payment method with id ${method.id} - already exists`);
            continue;
          }

          const finsiteMethod = new Finsite();
          finsiteMethod.getTransFid = method.id;
          finsiteMethod.accountFid = method.accountId;
          finsiteMethod.paymentId =  method.bookingAccountCode;
          finsiteMethod.accountId = account.AccountNumber;
          finsiteMethod.companyName = company.name;
          finsiteMethod.finsiteId = company.id;
          finsiteMethod.paymentMethodType = method.subtype === 'CreditCard' ? SourceType.CREDIT_CARD : method.subtype === 'Current' ? SourceType.BANK_ACCOUNT : null;
        
          // Save the entity to the database
          isAllDataExist = false;
          await this.finsiteRepo.save(finsiteMethod);
        }
      }
    }
    if (isAllDataExist) {
      return {message: "all data is already exist"};
    }
    else {
      return {message: "saved new data"};
    }

  }


  async getFinsiteToken(Username: string, Password: string): Promise<string> {
    try {
      const response = await this.apiClient.post('/Login', {
        Username,
        Password,
      });
      //console.log("SessionID is ", response.data.Entity.SessionID);
      return response.data.Entity.SessionID;
    } catch (error) {
      throw new HttpException(`Authentication failed: ${error.message}`, HttpStatus.UNAUTHORIZED);
    }
  }


  async getBookingAccounts(sessionId: string): Promise<any> {
    try {
      const response = await this.apiClient.get('/GetBookingAccounts', {                                      
        headers: {
          'M4u-Session': sessionId,
        },
      });
      //console.log("GetBookingAccounts: data is ", response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching booking accounts');
      throw new HttpException(
        `Failed to fetch companies: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }


  async getTransactionsById(sessionId: string, id: string, startDate: string, endDate: string): Promise<any> {
    
    try {
      const response = await this.apiClient.get('/GetTransactions', {
        headers: {
          'M4u-Session': sessionId,
        },
        params: {
          StartDate: startDate,
          EndDate: endDate,
          BookingAccountID: id,
        },
      });
      return response.data.Entities;
    } catch (error) {
      throw new HttpException(`Authentication failed: ${error.message}`, HttpStatus.UNAUTHORIZED);
    }
  }


  async getAccounts(sessionId: string): Promise<any> {
    try {
      // Set the M4u-Session header for this request
      const response = await this.apiClient.get('/GetAccounts', {
        headers: {
          'M4u-Session': sessionId,
        },
      });
  
      return response.data;
    } catch (error) {
      console.error('Error fetching accounts:', error.response?.data || error.message);
  
      throw new HttpException(
        `Failed to fetch companies: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }


  async getCompanies(sessionId: string): Promise<any> {
    console.log("sessionId: ", sessionId);
    
    try {
      // Set the M4u-Session header for this request
      const response = await this.apiClient.get('/GetCompanies', {
        headers: {
          'M4u-Session': sessionId,
        },
      });
  
      return response.data;
    } catch (error) {
      console.error('Error fetching companies:', error.response?.data || error.message);
  
      throw new HttpException(
        `Failed to fetch companies: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }









}
