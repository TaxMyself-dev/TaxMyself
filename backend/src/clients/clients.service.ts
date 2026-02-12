import { HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Clients } from "./clients.entity";
import { Repository } from "typeorm";
import { CreateClientDto } from "./create-client.dto";
import { User } from "src/users/user.entity";

@Injectable()
export class ClientsService {

  constructor(
    @InjectRepository(Clients,)
    private clientsRepo: Repository<Clients>,
  ) { }

  async addClient(clientData: CreateClientDto, userId: string) {
    const newClient = this.clientsRepo.create(clientData);
    newClient.userId = userId;
    try {
      const client = await this.clientsRepo.findOne({ where: { userId: userId, name: clientData.name } });
      
      if (client) {
        throw new HttpException('Client already exists', HttpStatus.CONFLICT);
      }
      
      const savedClient = await this.clientsRepo.insert(newClient);
      if (!savedClient) {
        
        throw new HttpException('Something went wrong. Client not saved', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return savedClient
    }
    catch (error) {
      throw error;
    }
  }

  async getClients(userId: string, businessNumber: string) {
    try {
      const clients = await this.clientsRepo.find({ where: { userId, businessNumber } });

      // Return empty array if no clients found instead of throwing error
      if (!clients || clients.length === 0) {
        return [];
      }
      return clients;

    }
    catch (error) {
      throw error;
    }
  }

  async deleteClient(userId: string, clientRowId: number) {
    try {
      const client = await this.clientsRepo.findOne({ where: { userId, clientRowId } });

      if (!client) {
        throw new NotFoundException('Client not found');
      }
      const deletedClient = await this.clientsRepo.delete({ clientRowId });
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