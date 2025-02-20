import { Component, inject, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Route } from '@angular/router';
import { Location } from '@angular/common';
import { AuthService } from 'src/app/services/auth.service';
import { IUserData } from '../interface';
import { ClientPanelService } from 'src/app/services/clients-panel.service';


@Component({
  selector: 'app-custom-toolbar',
  templateUrl: './custom-toolbar.component.html',
  styleUrls: ['./custom-toolbar.component.scss'],
})
export class CustomToolbarComponent implements OnInit {

  @Input() title: string = "";
  loggedInUserData: IUserData;
  loggedInUserName: string | null = null;
  clientName: string | null = null;
  constructor(
    private location: Location, 
    public authService: AuthService,
    public clientService: ClientPanelService,  
  ) { };

  public folder!: string;
  public name: string = "";
  ngOnInit() {
    this.loadUserData();
    if (this.title != "") {
      this.folder = this.title;
    }
    else {
      this.folder = this.location.path().slice(1);
      console.log(this.folder);

      switch (this.folder) {
        case "my-account":
          this.folder = "איזור אישי";
          this.name = "person-circle-outline";
          break;

        case "home":
          this.folder = "בית";
          this.name = "home-outline";
          break;

        case "register":
          this.folder = "הרשמה"
          break;

        case "my-storage":
          this.folder = "הענן שלי"
          break;

        case "reports":
          this.folder = "הגשת דוחות"
          break;

        case "login":
          this.folder = "כניסה"
          break;

        case "vat-report":
          this.folder = 'דו"ח מע"מ'
          break;

        case "annual-report":
          this.folder = 'דו"ח שנתי'
          break;

        case "advance-income-tax-report":
          this.folder = 'דו"ח מקדמות מס הכנסה'
          break;

        case "uniform-file":
          this.folder = 'מבנה קבצים אחיד'
          break;

        case "income-statement":
          this.folder = 'דו"ח רווח והפסד'
          break;

          case "flow-report":
          this.folder = 'דוח-תזרים'
          break;

        case "admin-panel":
          this.folder = 'פאנל ניהול'
          break;

        case "transactions":
          this.folder = 'תזרים'
          break;

          case "my-status":
            this.folder = 'הסטטוס שלי'
            break;
            case "pnl-report":
              this.folder = 'דוח רווח והפסד'
              break;
  
        default:
          this.folder = "עצמאי בעצמי"
          break;
      }
    }
  };


  loadUserData(): void {

    this.loggedInUserData = this.authService.getUserDataFromLocalStorage();
    this.loggedInUserName = this.loggedInUserData.fName + " " + this.loggedInUserData.lName;     
    const clientId = this.clientService.getSelectedClientId();

    if (clientId) {
      this.clientName = this.clientService.getFullNameById(clientId); // ✅ Get from cache
    }

  }


  isAgentActingOnClient(): boolean {
    return this.clientName !== null;
  }


}

