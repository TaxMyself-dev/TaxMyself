import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { docCreateTypeList } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { DocCreateService } from 'src/app/services/doc-create.service';





interface FieldTitles {
  [key: string]: string;
}

@Component({
  selector: 'app-doc-create',
  templateUrl: './doc-create.page.html',
  styleUrls: ['./doc-create.page.scss', '../../shared/shared-styling.scss'],
})
export class DocCreatePage implements OnInit {

  docCreateForm: FormGroup;
  docCreateTypeList = docCreateTypeList

  constructor(private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder) {
    this.docCreateForm = this.formBuilder.group({
      docType: new FormControl(
        '', Validators.required,
      ),
    })
  }


  ngOnInit() {
  }

  
  onSubmit() {
  }


}