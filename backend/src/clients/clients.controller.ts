import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { FirebaseAuthGuard } from "src/guards/firebase-auth.guard";
import { AuthenticatedRequest } from "src/interfaces/authenticated-request.interface";
import { CreateClientDto } from "./create-client.dto";

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

@Post('add-client')
  @UseGuards(FirebaseAuthGuard)
async addClient(@Body() clientData: CreateClientDto, @Req() request: AuthenticatedRequest) {
  const userId = request.user?.firebaseId;
  return this.clientsService.addClient(clientData, userId);
}

@Get('get-clients/:businessNumber')
@UseGuards(FirebaseAuthGuard)
async getClients(@Req() request: AuthenticatedRequest, @Param('businessNumber') businessNumber: string  ) {
  const userId = request.user?.firebaseId;
  return this.clientsService.getClients(userId, businessNumber);
}

@Delete('delete-client/:id')
@UseGuards(FirebaseAuthGuard)
async deleteClient(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
  const userId = request.user?.firebaseId;
  const clientRowId = parseInt(id, 10);
  if (isNaN(clientRowId)) {
    throw new BadRequestException('Invalid client ID');
  }
  return this.clientsService.deleteClient(userId, clientRowId);
}


}