import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IColumnDataTable, IRowDataTable } from '../interface';
import { FilesService } from 'src/app/services/files.service';
import { EMPTY, catchError, from } from 'rxjs';
import { getDownloadURL, getStorage, ref } from "@angular/fire/storage";
import { ExpenseFormHebrewColumns } from '../enums';


@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss'],
})
export class TableComponent {
  @Input() fieldsNames: IColumnDataTable[];
  @Input() set rows(val: IRowDataTable[]) {
    this.tableRows = [];
    this.originalRows = val;
    val.forEach((row: IRowDataTable) => {
      const { reductionDone, reductionPercent, expenseNumber, file, isEquipment, loadingDate, note, supplierID, userId, ...tableData } = row;
      //this.id = +id;
      this.tableRows.push(tableData);
    })

  }

  get rows(): IRowDataTable[] {
    return this.tableRows;
  }

  @Output() updateClicked = new EventEmitter<any>();
  @Output() deleteClicked = new EventEmitter<any>();

  id: number;
  isEquipment: boolean;
  tableRows: IRowDataTable[];
  originalRows: IRowDataTable[];

  constructor(private filesService: FilesService) { }

  previewFile(event: IRowDataTable): void {
    const selectedExpense = this.originalRows.find((row) => row.id === event.id);
    const fileName = selectedExpense.file;
    if (!(fileName === undefined || fileName === "" || fileName === null)) {
      from(this.filesService.downloadFile(fileName as string)).pipe(catchError((err) => {
        alert("can't open file");
        return EMPTY;
      })).subscribe((fileUrl) => {
        window.open(fileUrl, '_blank');
      });
    }
    else {
      alert("לא נשמר קובץ עבור הוצאה זו")
    }
  }

  deleteExpense(event: IRowDataTable): void {
    console.log("event in table", event.id);

    this.deleteClicked.emit(event.id);
  }

  updateExpense(expenseData: IRowDataTable): void {
    console.log(expenseData);
    console.log(this.originalRows);

    const expense: IRowDataTable = this.originalRows.find((row) => row.id === expenseData.id);
    console.log("after find", expense);
    this.updateClicked.emit(expense);
  }

  downloadFile(event: IRowDataTable): void {
    console.log("in download");
    const selectedExpense = this.originalRows.find((row) => row.id === event.id);
    const fileName = selectedExpense.file;
    if (!(fileName === undefined || fileName === "" || fileName === null)) {

      const storage = getStorage();
      getDownloadURL(ref(storage, fileName as string))
        .then((url) => {
          // `url` is the download URL for 'images/stars.jpg'
          console.log("'url: ", url);

          // This can be downloaded directly:
          const xhr = new XMLHttpRequest();
          xhr.responseType = 'blob';
          xhr.onload = (event) => {
            const blob = new Blob([xhr.response], { type: 'image/jpg' });
            const a: any = document.createElement('a');
            a.style = 'display: none';
            document.body.appendChild(a);
            const url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = fileName;
            a.click();
            window.URL.revokeObjectURL(url);
          };
          xhr.open('GET', url);
          xhr.send();
        })
        .catch((error) => {
          console.log("dhgsedgsdf", error);
          alert("לא ניתן להוריד את הקובץ")
        });
    }
    else {
      alert("לא נשמר עבור הוצאה שאת קובץ")
    }
  }
}
