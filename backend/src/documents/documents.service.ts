import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { SourceType } from 'src/enum';


@Injectable()
export class DocumentsService {

  private readonly apiClient: AxiosInstance;
  sessionID : string;

  constructor(
    // @InjectRepository(Finsite)
    // private finsiteRepo: Repository<Finsite>,
  ) {
  }


}