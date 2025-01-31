import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import { ISelectItem } from 'src/app/shared/interface';


@Component({
  selector: 'app-clients-panel',
  templateUrl: './clients-panel.page.html',
  styleUrls: ['./clients-panel.page.scss', '../../shared/shared-styling.scss'],
})
export class ClientPanelPage implements OnInit {

  myClients: ISelectItem[] = []; // List of clients formatted as ISelectItem[]
  selectedClientId: string; // Currently selected client ID
  clientForm: FormGroup; // Reactive form for the dropdown
  inviteEmail: string = '';


  constructor(private clientService: ClientPanelService, private formBuilder: FormBuilder) {
    this.clientForm = this.formBuilder.group({
      clientName: new FormControl(
        null, Validators.required,
      ),
      clientId: new FormControl(
        null, Validators.required,
      ),
    })
  }  


  ngOnInit() {
    // Initialize the form group
    this.clientForm = new FormGroup({
      client: new FormControl(null), // Control for the selected client
    });

    //Fetch the list of clients
    this.fetchClients();
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


  // Fetch clients from the backend and format them for the dropdown
  fetchClients(): void {
    this.clientService.getMyClients().subscribe({
      next: (clients) => {
        console.log("clients is ", clients);
        
        this.myClients = clients.users.map(client => ({
          value: client.firebaseId,
          name: client.fullName,
        }));
        console.log("myClients is ", this.myClients);
      },
      
      
      error: (error) => {
        console.error('Failed to fetch clients:', error);
      },
      complete: () => {
        console.log('Client fetching completed successfully!');
      },
    });
    
  }
  

  onClientSelectionChange(selectedValue: any): void {
    this.selectedClientId = selectedValue; // Update selectedClientId
    console.log('Selected client ID:', this.selectedClientId);
  }

  setClient(): void {
    const formData = this.clientForm.value;
    console.log("formDate is ", formData);
  }


}
