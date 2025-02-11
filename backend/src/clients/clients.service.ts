import { HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Clients } from "./clients.entity";
import { Repository } from "typeorm";
import { CreateClientDto } from "./create-client.dto";

@Injectable()
export class ClientsService {

  constructor(
    @InjectRepository(Clients)
    private clientsRepo: Repository<Clients>,
  ) { }

  async addClient(clientData: CreateClientDto, userId: string) {
    console.log("🚀 ~ ClientsService ~ addClient ~ clientData:", clientData)
    const newClient = this.clientsRepo.create(clientData);
    console.log("🚀 ~ ClientsService ~ addClient ~ newClient:", newClient)

    newClient.userId = userId;
    try {
      const savedClient = await this.clientsRepo.save(newClient);
      console.log("🚀 ~ ClientsService ~ addClient ~ savedClient:", savedClient)

      if (!savedClient) {
        throw new Error('Client not saved');
      }
      //return savedClient
    }
    catch (error) {
      throw error;
    }
  }

  async getClients(userId: string) {
    try {
      const clients = await this.clientsRepo.find({ where: { userId } });
      if (clients.length === 0) {
        throw new NotFoundException('No clients found');
      }
      if (!clients) {
        throw new HttpException('Error in get clients', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return clients;

    }
    catch (error) {
      throw error;
    }
  }
}