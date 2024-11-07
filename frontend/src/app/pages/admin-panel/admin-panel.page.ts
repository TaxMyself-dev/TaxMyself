import { Component, OnInit } from '@angular/core';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';


@Component({
  selector: 'app-admin-panel',
  templateUrl: './admin-panel.page.html',
  styleUrls: ['./admin-panel.page.scss'],
})
export class AdminPanelPage implements OnInit {

  readonly buttonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;
  selectedFile: File = null;


  constructor() { }

  ngOnInit() {
  }

  onFileSelected(event: any): void {
    console.log("in file");
    this.selectedFile = event.target.files[0];
    console.log(this.selectedFile);
  }


  // onUpload(): void {
  //   if (this.selectedFile) {
  //     this.expenseDataService.getLoader().subscribe()
  //     const reader = new FileReader();

  //     reader.onload = (e) => {
  //       const arrayBuffer = reader.result;
  //       console.log("array buffer: ", arrayBuffer);

  //       this.transactionService.uploadFile(arrayBuffer as ArrayBuffer)
  //         .pipe(
  //           finalize(() => this.expenseDataService.dismissLoader()),
  //           takeUntil(this.destroy$))
  //         .subscribe(
  //           (response) => {
  //             this.messageToast = `הקובץ ${this.selectedFile.name} הועלה בהצלחה`;
  //             this.isToastOpen = true;
  //             console.log(response.message);
  //             // Handle successful response
  //           },
  //           error => {
  //             console.error('Error uploading file', error);
  //             // Handle error response
  //             alert("העלאת קובץ נכשלה. אנא בחר קובץ תקין או נסה מאוחר יותר")
  //           }
  //           );
  //     };

  //     reader.readAsArrayBuffer(this.selectedFile);
  //   } else {
  //     console.error('No file selected.');
  //     alert("אנא בחר קובץ")
  //   }
  // }

}
