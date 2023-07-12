import { Component, OnInit } from '@angular/core';
import { TableService } from 'src/app/services/table.service';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';

@Component({
  selector: 'app-my-storage',
  templateUrl: './my-storage.page.html',
  styleUrls: ['./my-storage.page.scss'],
})
export class MyStoragePage implements OnInit {

  columns: IColumnDataTable = {};//Titles of table
  rows: IRowDataTable[] = [];//Data of table
  // tableTitle = "הוצאות אחרונות";
  public chooseYear = [
    1990,1991,1992,1993,1994,1995,1996,1997,1998,1999,2000,2001,2002,2003,2004,2005,2006,
    2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017
  ]

  constructor(private dataTableService: TableService) { }

  ngOnInit() {
    this.setColumns();
    this.setRowsData();
    this.dataTableService.updateTable$.subscribe(
    
    (data) => {
      if (data) {
          this.setRowsData();
        }
      })
  }

  // Get the data from server and update columns
  setColumns(): void {
    this.dataTableService.getColumns().subscribe(
      (data) => {
        if (data) {
          this.columns = data;
        }
      });
  }
// Get the data from server and update rows
  setRowsData(): void {
    this.dataTableService.getRowData().subscribe(
      (data) => {
        if (data) {
          this.rows = data;
         
        }
      });
  }
}
