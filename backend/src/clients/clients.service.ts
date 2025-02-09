import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Clients } from "./clients.entity";
import { Repository } from "typeorm";

@Injectable()
export class ClientsService {

  constructor(
    @InjectRepository(Clients)
    private clientsRepo: Repository<Clients>,
  ) {}
}