import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import { ISelectItem } from 'src/app/shared/interface';

@Component({
  selector: 'app-clients-panel',
  templateUrl: './clients-panel.page.html',
  styleUrls: ['./clients-panel.page.scss', '../../shared/shared-styling.scss'],
})
export class ClientPanelPage implements OnInit {
  myClients: ISelectItem[] = []; // Clients formatted as ISelectItem[]
  selectedClientId: string | null = null; // Selected client ID
  selectedClientName: string | null = null; // Selected client Name
  inviteEmail: string = '';

  constructor(
    private clientService: ClientPanelService, 
    private router: Router
  ) {}

  ngOnInit() {
    this.fetchClients();

    // ✅ Subscribe to selected client changes
    this.clientService.selectedClientId$.subscribe(clientId => {
      this.selectedClientId = clientId;
    });
  }

  // ✅ Fetch clients from the backend and update dropdown list
  fetchClients(): void {
    this.clientService.getMyClients().subscribe({
      next: (clients) => {
        console.log("clients is ", clients);
        
        this.myClients = clients.map(client => ({
          value: client.id,
          name: client.name,
        }));

        console.log("myClients is ", this.myClients);

        // ✅ Auto-select first client if none is selected
        if (!this.selectedClientId && this.myClients.length > 0) {
          this.onClientSelectionChange(this.myClients[0].value);
        }
      },
      error: (error) => console.error('Failed to fetch clients:', error),
      complete: () => console.log('Client fetching completed successfully!'),
    });
  }

  // ✅ Handle client selection from dropdown
  onClientSelectionChange(selectedValue: any): void {
    const client = this.myClients.find(client => client.value === selectedValue.value);

    if (!client) return;

    this.selectedClientId = selectedValue.value;
    this.selectedClientName = client.name as string;

    // ✅ Store selected client globally in the service
    this.clientService.setSelectedClientId(this.selectedClientId);
  }

  // ✅ Navigate to another page while maintaining selected client
  setClient(): void {
    if (!this.selectedClientId) {
      console.warn('No client selected!');
      return;
    }

    this.router.navigate(['my-account']);
  }

  // ✅ Send an invitation to a new user
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
      complete: () => console.log('Invitation process completed.'),
    });
  }
}



// import { Component, OnInit } from '@angular/core';
// import { FormBuilder } from '@angular/forms';
// import { Router } from '@angular/router';
// import { ClientPanelService } from 'src/app/services/clients-panel.service';
// import { ISelectItem } from 'src/app/shared/interface';


// @Component({
//   selector: 'app-clients-panel',
//   templateUrl: './clients-panel.page.html',
//   styleUrls: ['./clients-panel.page.scss', '../../shared/shared-styling.scss'],
// })
// export class ClientPanelPage implements OnInit {

//   myClients: ISelectItem[] = []; // List of clients formatted as ISelectItem[]
//   selectedClientId: string; // Currently selected client ID
//   selectedClientName: string; // Currently selected client Name
//   inviteEmail: string = '';


//   constructor(private clientService: ClientPanelService, private router: Router) {
//   }  


//   ngOnInit() {
//     this.fetchClients();
//   }


//   sendInvitation() {
//     if (!this.inviteEmail) {
//       console.error('Email is required');
//       return;
//     }
//     this.clientService.sendInvitation(this.inviteEmail).subscribe({
//       next: (response) => {
//         console.log('Invitation sent successfully:', response);
//         alert('Invitation sent successfully!');
//       },
//       error: (error) => {
//         console.error('Failed to send invitation:', error);
//         alert('Failed to send invitation.');
//       },
//       complete: () => {
//         console.log('Invitation process completed.');
//       },
//     });
//   }


//   // Fetch clients from the backend and format them for the dropdown
//   fetchClients(): void {
//     this.clientService.getMyClients().subscribe({
//       next: (clients) => {
//         console.log("clients is ", clients);
        
//         this.myClients = clients.users.map(client => ({
//           value: client.firebaseId,
//           name: client.fullName,
//         }));
//         console.log("myClients is ", this.myClients);
//       },
      
      
//       error: (error) => {
//         console.error('Failed to fetch clients:', error);
//       },
//       complete: () => {
//         console.log('Client fetching completed successfully!');
//       },
//     });
    
//   }
  

//   onClientSelectionChange(selectedValue: any): void {
//     const client = this.myClients.find((client)=>client.value === selectedValue.value);
//     this.selectedClientId = selectedValue.value;
//     this.selectedClientName = client.name as string;
//   }


//   setClient(): void {
//     localStorage.setItem('clientId', JSON.stringify(this.selectedClientId));
//     localStorage.setItem('clientName', JSON.stringify(this.selectedClientName)); 
//     //this.updateTokenFields(this.selectedClientId)   
//     this.router.navigate(['my-account']);
//   }

  
//   // updateTokenFields(newfield) {
//   //   // Get the token from localStorage
//   //   let token = localStorage.getItem("token");
  
//   //   if (!token) {
//   //     console.warn("No token found in localStorage.");
//   //     return;
//   //   }
  
//   //   try {
//   //     // Parse it as an object (if it's JSON formatted)
//   //     //let tokenObj = JSON.parse(token);
//   //     let tokenObj = {token: token , userId: newfield};
  
//   //     // Save the updated token back to localStorage
//   //     localStorage.setItem("token", JSON.stringify(tokenObj));
  
//   //     console.log("Token updated:", tokenObj);
//   //   } catch (error) {
//   //     console.error("Token is not a valid JSON object:", error);
//   //   }
//   // }
  


// }
