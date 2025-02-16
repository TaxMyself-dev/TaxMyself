import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ClientsService } from "./clients.service";

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

@Post('add-client')
async addClient(@Body() clientData: any) {
  //console.log("🚀 ~ ClientsController ~ addClient ~ clientData:", clientData)
  const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
  return this.clientsService.addClient(clientData, userId);
}

@Get('get-clients')
async getClients() {
  const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
  return this.clientsService.getClients(userId);
}

@Delete('delete-client/:id')
async deleteClient(@Param('id') id: number) {
  const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
  return this.clientsService.deleteClient(userId, id);
}


}