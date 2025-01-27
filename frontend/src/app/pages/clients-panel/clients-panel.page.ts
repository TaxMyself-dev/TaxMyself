import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import { ISelectItem } from 'src/app/shared/interface';


@Component({
  selector: 'app-clients-panel',
  templateUrl: './clients-panel.page.html',
  styleUrls: ['./clients-panel.page.scss'],
})
export class ClientPanelPage implements OnInit {

  myClients: ISelectItem[] = []; // List of clients formatted as ISelectItem[]
  selectedClientId: string; // Currently selected client ID
  clientForm: FormGroup; // Reactive form for the dropdown
  inviteEmail: string = '';

  constructor(private clientService: ClientPanelService) {}

  ngOnInit() {
    // Initialize the form group
    this.clientForm = new FormGroup({
      client: new FormControl(null), // Control for the selected client
    });

    // Fetch the list of clients
    //this.fetchClients();
  }


  sendInvitation() {
    if (!this.inviteEmail) {
      console.error('Email is required');
      return;
    }
    this.clientService.sendInvitation(this.inviteEmail).subscribe({
      next: (response) => {
        console.log('Invitation sent successfully:', response);
        alert('Invitation sent successfully!');
      },
      error: (error) => {
        console.error('Failed to send invitation:', error);
        alert('Failed to send invitation.');
      },
      complete: () => {
        console.log('Invitation process completed.');
      },
    });
  }


  fetchClients() {
    this.clientService.getMyClients().subscribe({
      next: (clients) => {
        this.myClients = clients.map((client) => ({
          value: client.id.toString(),
          label: client.name,
        }));
  
        if (this.myClients.length > 0) {
          this.selectedClientId = this.myClients[0].value.toString();
          this.clientForm.get('client')?.setValue(this.selectedClientId); // Set default value
        }
      },
      error: (error) => {
        console.error('Failed to fetch clients:', error);
      },
      complete: () => {
        console.log('Client fetching process completed.');
      },
    });
  }
  

  onClientSelectionChange(selectedValue: any): void {
    this.selectedClientId = selectedValue; // Update selectedClientId
    console.log('Selected client ID:', this.selectedClientId);
  }


}
