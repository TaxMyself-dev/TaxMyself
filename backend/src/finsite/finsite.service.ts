import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';


@Injectable()
export class FinsiteService {

  private readonly apiClient: AxiosInstance;
  sessionID : string;

  constructor(
  ) {
    this.apiClient = axios.create({
      baseURL: 'https://app.finsite.co.il/api/Kraken/ExternalAPI',
      headers: { 'Content-Type': 'application/json' },
    });
  }


  async getTransactions(Username: string, Password: string, startDate: string, endDate: string): Promise<any> {

    this.sessionID = await this.getFinsiteToken(Username, Password);

    const bookingAccounts = await this.getBookingAccounts(this.sessionID);
    //console.log("bookingAccounts is ", bookingAccounts.data);

    const entryIds = bookingAccounts.Entities.map((entity: any) => entity.EntryID);
    console.log('Extracted EntryIDs:', entryIds);
    console.log('EntryID:', entryIds[0]);

    //const BookingAccountID = bookingAccounts.data.Entities.EntityId;

    //console.log("BookingAccountID is ", BookingAccountID);

    const companiess = await this.getCompanies(this.sessionID);
    console.log("companiess are ", companiess);
    



    //const trans =  await this.getTransactionByUserId(this.sessionID, entryIds[0], startDate, endDate);
    const trans =  await this.getTransactionByUserId(this.sessionID);
    console.log("trans are ", trans);
    


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
      console.log("GetBookingAccounts: data is ", response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching booking accounts');
      throw new HttpException(
        `Failed to fetch companies: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }


  //async getTransactionByUserId(sessionId: string, bookingAccountID: string, startDate: string, endDate: string): Promise<any> {
  async getTransactionByUserId(sessionId: string): Promise<any> {
    // console.log("bookingAccountID is ", bookingAccountID);
    // console.log("startDate is ", startDate);
    // console.log("endDate is ", endDate);

    let sstartDate = "2024-07-01";
    const eendDate = "2024-07-30";
    const bbookingAccountID = "8711";

    
    try {
      const response = await this.apiClient.post('/GetTransactions', {
        headers: {
          'M4u-Session': sessionId,
        },
        params: {
          StartDate: "2024-07-01", // Query parameter: Start date
          EndDate: "2024-07-30",    // Query parameter: End date
          BookingAccountID: "422698", // Query parameter: BookingAccountID
        },
      });
      //console.log("SessionID is ", response.data.Entity.SessionID);
      return response.data.Entity.SessionID;
    } catch (error) {
      throw new HttpException(`Authentication failed: ${error.message}`, HttpStatus.UNAUTHORIZED);
    }
  }


  async getCompanies(sessionId: string): Promise<any> {
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
