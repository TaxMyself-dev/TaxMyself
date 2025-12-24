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
    console.log("🚀 ~ ClientsService ~ addClient ~ clientData", clientData);
    
    const newClient = this.clientsRepo.create(clientData);
    newClient.userId = userId;
    console.log("🚀 ~ ClientsService ~ addClient ~ newClient:", newClient)
    try {
      const client = await this.clientsRepo.findOne({ where: { userId: userId, name: clientData.name } });
      console.log("🚀 ~ ClientsService ~ addClient ~ client:", client)
      
      if (client) {
        throw new HttpException('Client already exists', HttpStatus.CONFLICT);
      }
      
      const savedClient = await this.clientsRepo.insert(newClient);
      console.log("🚀 ~ ClientsService ~ addClient ~ savedClient", savedClient)
      if (!savedClient) {
        console.log("🚀 ~ ClientsService ~ addClient ~ savedClient2222", savedClient);
        
        throw new HttpException('Something went wrong. Client not saved', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return savedClient
    }
    catch (error) {
      throw error;
    }
  }

  async getClients(userId: string) {
    try {
      const clients = await this.clientsRepo.find({ where: { userId } });
      console.log("🚀 ~ ClientsService ~ getClients ~ clients", clients);

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

  async deleteClient(userId: string, clientId: string) {
    try {
      const client = await this.clientsRepo.findOne({ where: { userId, id: clientId } });

      if (!client) {
        throw new NotFoundException('Client not found');
      }
      const deletedClient = await this.clientsRepo.delete(clientId);
      if (!deletedClient) {
        throw new HttpException('Error in delete client', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return deletedClient;
    }
    catch (error) {
      throw error;
    }
  }
}