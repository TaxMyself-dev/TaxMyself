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
  @Input() set data(val: IRowDataTable) {
    console.log(val);
    this.id = +val.id;
    this.tableData = Object.keys(val)
      .filter((key) => key !== 'userId' && key !== 'id' && key !== 'reductionDone' && key !== 'reductionPercent')
      .reduce((object, key) => {
        return Object.assign(object, {
          [key]: val[key]
        });
      }, {});
  }

  get data(): IRowDataTable {    
    return this.tableData;
  }

  getFieldValue(key: string | number): ExpenseFormHebrewColumns {    
    return this.fieldsNames.find((item: IColumnDataTable) => item.name === key).value;
  }

  @Output() updateClicked = new EventEmitter<any>();
  @Output() deleteClicked = new EventEmitter<any>();

  id: number;
  tableData: IRowDataTable;

  constructor(private filesService: FilesService) {}
   
  previewFile(nameFile?: string | number | Date): void {
    from(this.filesService.downloadFile(nameFile as string)).pipe(catchError((err) => {
      alert("can't open file");
      return EMPTY;
    })).subscribe((fileUrl) => {
      window.open(fileUrl, '_blank');
    });
  }

  deleteExpense(): void {
    this.deleteClicked.emit(this.id);
  }

  updateExpense(): void {
    this.updateClicked.emit(this.id);
  }

  public downloadFile(filename: string | number | Date): void {
    console.log("in download");
    const storage = getStorage();
    getDownloadURL(ref(storage, filename as string))
      .then((url) => {
        // `url` is the download URL for 'images/stars.jpg'
        console.log("'url: ",url);
        
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
          a.download = filename;
          a.click();
          window.URL.revokeObjectURL(url);
        };
        xhr.open('GET', url);
        xhr.send();
      })
      .catch((error) => {
        console.log("dhgsedgsdf",error);
        alert("לא ניתן להוריד את הקובץ")
      });
      }
}
