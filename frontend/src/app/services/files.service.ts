import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { getStorage, ref, getDownloadURL, deleteObject, uploadString } from "@angular/fire/storage";
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { log } from 'console';
import { nanoid } from 'nanoid';
import { EMPTY, Observable, catchError, finalize, from, map, of, switchMap, takeUntil, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import * as Tesseract from 'tesseract.js';
import { ExpenseDataService } from './expense-data.service';
import { GenericService } from './generic.service';

@Injectable({
  providedIn: 'root'
})
export class FilesService {

  uniqueIdFile: string;
  safePdfBase64String: SafeResourceUrl;


  constructor(private http: HttpClient,private genericService: GenericService) { }


  downloadFile(urlFile: string): string {
    let returnUrl: string;
    const storage = getStorage();
    getDownloadURL(ref(storage, urlFile))
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
          returnUrl = url;
          a.download = urlFile;
          a.click();
          window.URL.revokeObjectURL(url);
        };
        xhr.open('GET', url);
        xhr.send();
      })
      .catch((error) => {
        console.log("err in download file: ", error.code);
        if (error.code === "storage/object-not-found") {
          alert("לא שמור קובץ עבור הוצאה זו")
        }
        alert("לא ניתן להוריד את הקובץ")
        return null
      });
    return returnUrl;
  }

  public async previewFile(urlFile: string) {
    const storage = getStorage();
    const pathReference = ref(storage, urlFile);
    let blob: Blob;
    try {
      const url = await getDownloadURL(pathReference);
      urlFile = url;
      const response = await fetch(url);
      blob = await response.blob();
    }
    catch (error) {
      console.error("error from download file", error);
    }

    return { file: urlFile, type: blob.type };
  }

  public async deleteFile(urlFile: string) {
    const storage = getStorage();
    const delRef = ref(storage, urlFile);
    await deleteObject(delRef).then(() => {
      console.log("delete file: ", urlFile);
    }).catch((error) => {
      console.log(error);
      console.log("delete file is faild: ", urlFile);
    });
  }

  uploadFileViaFront(file: File): Observable<any> {
    return this.convertFileToBase64(file).pipe(
      catchError((err) => {
        console.log("error in convert file to base 64: ", err);
        throw err;
      }),
      switchMap((base64: string) => {
        //console.log('Base64 result:', base64);
        return this.uploadBase64(base64);  // Return the observable from uploadBase64
      }),
      catchError((error) => {
        console.error('Error during file upload:', error);
        throw error;  // Handle the error and rethrow
      })
    );
  }

  uploadBase64(base64String: string): Observable<any> {
    const tempA = localStorage.getItem('user');
    const tempB = JSON.parse(tempA)
    const uid = tempB.uid;
    this.uniqueIdFile = nanoid();
    const storage = getStorage(); // bucket root
    const fileRef = ref(storage, `users/${uid}/${this.uniqueIdFile}`); // full path relative to bucket's root
    return from(uploadString(fileRef, base64String, 'data_url'));
  }

  convertFileToBase64(file: File): Observable<string> {
    return new Observable<string>((observer) => {
      if (!file) {
        observer.error("File is empty");
        return;
      }

      const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
      const extension = file.name.split('.').pop().toLowerCase();

      if (!allowedExtensions.includes(extension)) {
        observer.error('Please upload only PDF, PNG, or JPEG files.');
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = () => {
        const base64 = reader.result as string;
        observer.next(base64); // Emit the base64 result
        observer.complete();   // Mark the observable as complete
      };

      reader.onerror = (error) => {
        observer.error('Error reading file');
      };
    });
  }

  // uploadFileViaFront(file: File): Observable<any> {
  //   this.convertFileToBase64(file).subscribe({
  //     next: (base64) => {
  //       console.log('Base64 result:', base64);
  //       return this.uploadBase64(base64)
  //       // Handle the base64 data (e.g., upload or display it)
  //     },
  //     error: (err) => {
  //       console.error('Error:', err);
  //       // Handle the error (e.g., show a message to the user)
  //     },
  //     complete: () => {
  //       console.log('File conversion complete');
  //     }
  //   });   
  //   console.log("in upload file via front");
  //   let filePath: string;
  //   // const tempA = localStorage.getItem('user');
  //   // const tempB = JSON.parse(tempA)
  //   // const uid = tempB.uid;
  //   // this.uniqueIdFile = nanoid();
  //   // const storage = getStorage(); // bucket root
  //   // const fileRef = ref(storage, `users/${uid}/${this.uniqueIdFile}`); // full path relative to bucket's root
  //   // return from(uploadString(fileRef, base64String, 'data_url'));
  // }



  // convertPdfFileToBase64String(file: File) {
  //   return new Promise<string>((resolve, reject) => {
  //     const reader = new FileReader();
  //     reader.addEventListener('load', () => {
  //       const result = reader.result;

  //       if (!result) {
  //         reject('result is null');
  //         return;
  //       }

  //       resolve(reader.result.toString());
  //     });
  //     reader.addEventListener('error', reject);
  //     reader.readAsDataURL(file);
  //   });
  // }



  // convertFileToBase64AndUpload(file: File): void {
  //   console.log(file);
  //   let base64: string
  //   if (!file){
  //     alert("file is empty");
  //   }

  //   const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
  //   const extension = file.name.split('.').pop().toLowerCase();

  //   if (!allowedExtensions.includes(`.${extension}`)) {
  //     alert('Please upload only PDF, PNG, or JPEG files.');
  //   }

  //   const reader = new FileReader();
  //   reader.readAsDataURL(file);
  //   reader.onload = () => {
  //     base64 = reader.result as string;
  //     console.log(base64);
  //     //this.uploadFileViaFront(reader.result as string)
  //   }
  // }

  // async fileSelected(event: any) {
  //   //console.log("in filelelel");
  //   //this.pdfLoaded = false;// on change pdf to image

  //   let file = event.target.files[0];
  //   console.log("fileeeeeeeeeeee", file);

  //   if (!file) {
  //     return;
  //   }

  //   const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
  //   const extension = file.name.split('.').pop().toLowerCase();

  //   if (!allowedExtensions.includes(`.${extension}`)) {
  //     alert('Please upload only PDF, PNG, or JPEG files.');
  //     return;
  //   }

  //   // if (extension === "pdf"){
  //   //   console.log("in pdf");
  //   //   const target = event.target as HTMLInputElement;
  //   //   const files = target.files as FileList;
  //   //   const file = files.item(0);
  //   //   console.log("pdf file:", file);

  //   //   if (!file) {
  //   //     return;
  //   //   }

  //   //   const rawPdfBase64String = await this.convertPdfFileToBase64String(file);
  //   //   this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl(rawPdfBase64String);
  //   //   //this.pdfLoaded = true;
  //   //   //this.uploadFileViaFront(this.safePdfBase64String)
  //   // }

  //   const reader = new FileReader();
  //   reader.readAsDataURL(file);
  //   reader.onload = () => {
  //     this.uploadFileViaFront(reader.result as string)
  //     // if (this.isEditMode) {
  //     //   this.editModeFile = reader.result as string;
  //     //   this.selectedFile = reader.result as string;//for update expense can mabey change the func update 
  //     // }
  //     // else{
  //     //   this.selectedFile = reader.result as string;
  //     // }
  //     // console.log(this.selectedFile);

  //   }


  // }


  async extractTextFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      Tesseract.recognize(
        file,
        'eng', // Set the language
        { logger: info => console.log(info) }
      )
        .then(({ data: { text } }) => {
          resolve(text);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  getSuppliersList(token: string): Observable<any> {
    const url = `${environment.apiUrl}expenses/get-suppliers-list`;
    const options = {
      params: new HttpParams().set("token", token),
    }
    return this.http.get(url, options);
  }

  addSupplier(formData: any): Observable<any> {
    const url = `${environment.apiUrl}expenses/add-supplier`;
    return this.http.post(url, formData);
  }

  editSupplier(formData: any, id: number): Observable<any> {
    console.log("id in edit to server", id);
    const url = `${environment.apiUrl}expenses/update-supplier/${id}`;
    return this.http.patch(url, formData);
  }

  // uploadExcelFile(): void {
  //   const token = localStorage.getItem('token');
  //   const url = `${environment.apiUrl}transactions/load-file`;
  //   const headers = { 'token': token };
  //   const formData = new FormData();

  //   //if (this.selectedFile) {
  //     this.expenseDataService.getLoader().subscribe()
  //     const reader = new FileReader();

  //     reader.onload = (e) => {
  //       const arrayBuffer = reader.result;
  //       console.log("array buffer: ", arrayBuffer);
  //       const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  //       this.uploadFile(arrayBuffer as ArrayBuffer)
  //         .pipe(
  //           finalize(() => this.expenseDataService.dismissLoader()),
  //           );
  //         };
  //           //takeUntil(this.destroy$))
  //         //.subscribe(
  //           //(response) => {
  //             //this.messageToast = `הקובץ ${this.selectedFile.name} הועלה בהצלחה`;
  //             //this.isToastOpen = true;
  //             //console.log(response.message);
  //             // Handle successful response
  //           // },
  //           // error => {
  //           //   console.error('Error uploading file', error);
  //           //   // Handle error response
  //           //   alert("העלאת קובץ נכשלה. אנא בחר קובץ תקין או נסה מאוחר יותר")
  //           // }

  //     reader.readAsArrayBuffer(this.selectedFile);
  //   // } else {
  //   //   console.error('No file selected.');
  //   //   alert("אנא בחר קובץ")
  //   // }
  // }

  // uploadFile(fileBuffer: ArrayBuffer): Observable<any> {
  //   console.log("file buffer in service: ", fileBuffer);
  //   // const token = localStorage.getItem('token');
  //   // const url = `${environment.apiUrl}transactions/load-file`;
  //   // const formData = new FormData();
  //   const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  //   console.log("blob: ", blob);
  //   formData.append('file', blob, 'file.xlsx');
  //   console.log("form data: ", formData.get('file'));
  //   // const headers = {
  //   //   'token': token
  //   // }
  //   return this.http.post<any>(url, formData,{headers: headers});
  // }
/////////////////////////////////////////////////////////////////////////////
   // if (!selectedFile) {
    //   alert("אנא בחר קובץ");
    //   console.error('No file selected.');
    //   return of('No file selected.');
    // }

    // Display the loader
    //this.expenseDataService.getLoader().subscribe();
///////////////////////////////////////////////
  //this.messageToast = `הקובץ ${selectedFile.name} הועלה בהצלחה`;
  //this.isToastOpen = true;
  // Handle successful response
  // error => {
  //   alert("העלאת קובץ נכשלה. אנא בחר קובץ תקין או נסה מאוחר יותר");
  //   // Handle error response
  // }

  // function in each place you need to upload a file

  uploadExcelFile(file: File, relativeUrl: string): Observable<{status:boolean, message: string}> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}${relativeUrl}`;
    const formData = new FormData();
    formData.append('file', file, file.name);
    const headers = {
      'token': token
    }

    return this.http.post(url, formData, { headers })
      .pipe(
        catchError(error => {
          console.error('Upload failed', error);
          return of({status: true, message: error as string}); // Return false if there's an error
        }),
        map(response => {
          return {status: true, message: response as string}
        })// Return true on success
      );
  }

  // readExcelFile(reader: FileReader): FormData {
  //   const arrayBuffer = reader.result as ArrayBuffer;
  //   const formData = new FormData();
  //   const blob = new Blob([arrayBuffer], {
  //     type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  //   });

  //   formData.append('file', blob, 'file.xlsx');
  //   return formData;
  // }

  // sendExcelFileToServer(relativeUrl: string, reader: FileReader): Observable<boolean> {
  //   const url = `${environment.apiUrl}${relativeUrl}`;
  //   const token = localStorage.getItem('token');
  //   const headers = { token: token };
  //   const formData = this.readExcelFile(reader);
  //   // HTTP POST request to upload the file
  //   return this.http.post<any>(url, formData, { headers })
  //     .pipe(
  //       finalize(() => this.genericService.dismissLoader()),
  //       catchError((err) => {
  //         console.error('Error uploading file', err);
  //         throw of("faild upload excel file")
  //       })
  //     )
  // }

}
