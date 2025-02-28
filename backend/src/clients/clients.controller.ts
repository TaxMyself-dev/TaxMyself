import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { FirebaseAuthGuard } from "src/guards/firebase-auth.guard";
import { AuthenticatedRequest } from "src/interfaces/authenticated-request.interface";

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

@Post('add-client')
  @UseGuards(FirebaseAuthGuard)
async addClient(@Body() clientData: any, @Req() request: AuthenticatedRequest) {
  const userId = request.user?.firebaseId;
  //console.log("🚀 ~ ClientsController ~ addClient ~ clientData:", clientData)
  return this.clientsService.addClient(clientData, userId);
}

@Get('get-clients')
@UseGuards(FirebaseAuthGuard)
async getClients(@Req() request: AuthenticatedRequest) {
  const userId = request.user?.firebaseId;
  return this.clientsService.getClients(userId);
}

@Delete('delete-client/:id')
@UseGuards(FirebaseAuthGuard)
async deleteClient(@Param('id') id: number, @Req() request: AuthenticatedRequest) {
  const userId = request.user?.firebaseId;
  return this.clientsService.deleteClient(userId, id);
}


}