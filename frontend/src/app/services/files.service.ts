import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { getStorage, ref, getDownloadURL, deleteObject, uploadString } from "@angular/fire/storage";
import { SafeResourceUrl } from '@angular/platform-browser';
import { error, log } from 'console';
import { nanoid } from 'nanoid';
import { EMPTY, Observable, catchError, finalize, from, map, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import * as Tesseract from 'tesseract.js';
import { GenericService } from './generic.service';
import { ICreateDataDoc } from '../shared/interface';

@Injectable({
  providedIn: 'root'
})
export class FilesService {

  uniqueIdFile: string;
  safePdfBase64String: SafeResourceUrl;
  fileName: string;


  constructor(private http: HttpClient, private genericService: GenericService) { }

  async downloadFirebaseFile(urlFile: string) {
    const orginalNameFile = this.extractFileName(urlFile);
    const file = await this.getFirebaseUrlFile(urlFile);
    this.downloadFile(orginalNameFile, file.blob);
  }


  downloadFile(fileName: string, blob: Blob): void {
    // Perform the download
    const a: HTMLAnchorElement = document.createElement('a');
    a.style.display = 'none';
    document.body.appendChild(a);
    const objectUrl = window.URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = fileName; // Use the cleaned-up file name
    a.click();
    window.URL.revokeObjectURL(objectUrl);
    document.body.removeChild(a); // Clean up
  };

  extractFileName(file: string): string {
    // Extract the full file name from directories
    const fullFileName = file.split('/').pop();

    // Remove the unique ID prefix
    const fileName = fullFileName.slice(21);
    return fileName
  }

  public async getFirebaseUrlFile(urlFile: string) {
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

    return { file: urlFile, type: blob.type, blob };
  }

  previewFile(urlFile: string): Observable<void> {
    this.genericService.getLoader().subscribe();
    if (!urlFile) {
      alert("קובץ לא נמצא, לא ניתן לפתוח את הקובץ");
      this.genericService.dismissLoader();
      return EMPTY; // Terminate the observable immediately
    }

    const storage = getStorage();
    const pathReference = ref(storage, urlFile);

    return from(getDownloadURL(pathReference)).pipe(
      finalize(() => this.genericService.dismissLoader()),
      catchError((error) => {
        console.error("Error fetching file URL:", error);
        alert("לא ניתן לפתוח את הקובץ, ייתכן שהקובץ לא קיים");
        return EMPTY; // Terminate the observable gracefully
      }),
      switchMap((url) => {
        return from(fetch(url)).pipe(
          catchError((error) => {
            console.error("Error fetching file:", error);
            alert("שגיאה בהורדת הקובץ, נסה שנית");
            return EMPTY;
          })
        );
      }),
      switchMap((response) => {
        if (!response.ok) {
          alert("קובץ לא תקין, לא ניתן לפתוח אותו");
          throw new Error('Failed to fetch file');
        }
        return from(response.blob());
      }),
      tap((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      }),
      map(() => undefined), // Explicitly map the result to void
      catchError((error) => {
        console.error("Unexpected error:", error);
        alert("אירעה שגיאה בלתי צפויה, אנא נסה שוב");
        return EMPTY; // Terminate the observable gracefully
      })
    );
  }

  previewFile1(file: Blob): void {
    const blobUrl = URL.createObjectURL(file);
    window.open(blobUrl, '_blank');
  }


  previewFileWithControls(file: Blob): void {
    const blobUrl = URL.createObjectURL(file);

    const newWindow = window.open('', '_blank', 'width=800,height=600');
    if (!newWindow) {
      alert("Popup blocked. Please allow popups for this site.");
      return;
    }

    // Custom HTML with PDF iframe + close button
    newWindow.document.write(`
    <html dir="rtl">
      <head>
        <title>תצוגה מקדימה</title>
        <style>
          body { margin: 0; font-family: sans-serif; display: flex; flex-direction: column; height: 100vh; }
          iframe { flex: 1; border: none; }
          button { padding: 10px 20px; font-size: 16px; background-color: #007bff; color: white; border: none; cursor: pointer; }
          .top-bar { text-align: left; padding: 10px; background-color: #f0f0f0; }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <button onclick="window.close()">✖ סגור</button>
        </div>
        <iframe src="${blobUrl}" type="application/pdf"></iframe>
      </body>
    </html>
  `);

    newWindow.document.close();
  }


  previewFileWithPopup(file: Blob): void {
    const blobUrl = URL.createObjectURL(file);

    const popup = window.open(
      '',
      'PDFPreview',
      'width=900,height=700,left=200,top=100,toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
      alert("Popup blocked. Please allow popups for this site.");
      return;
    }

    popup.document.write(`
    <html dir="rtl">
      <head>
        <title>תצוגה מקדימה של מסמך</title>
        <style>
          body { margin: 0; font-family: sans-serif; display: flex; flex-direction: column; height: 100vh; }
          .top-bar {
            background-color: #f0f0f0;
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ccc;
          }
          button {
            padding: 8px 16px;
            font-size: 14px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          iframe {
            flex: 1;
            width: 100%;
            border: none;
          }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <button onclick="window.close()">✖ סגור</button>
        </div>
        <iframe src="${blobUrl}" type="application/pdf"></iframe>
      </body>
    </html>
  `);

    popup.document.close();
  }


  previewFile2(file: Blob): void {
    const blobUrl = URL.createObjectURL(file);

    // Open new popup window with custom size
    const popup = window.open('', 'previewWindow', 'width=800,height=900');

    if (!popup) {
      alert('Popup blocked! Please allow popups for this site.');
      return;
    }

    // Write custom HTML with iframe + close button
    popup.document.write(`
    <html dir="rtl" lang="he">
      <head>
        <title>תצוגה מקדימה</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
          }
          .header {
            background-color: #f0f0f0;
            padding: 10px;
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            border-bottom: 1px solid #ccc;
          }
          .iframe-container {
            width: 100%;
            height: calc(100% - 50px);
          }
          iframe {
            width: 100%;
            height: 100%;
            border: none;
          }
          .close-btn {
            position: absolute;
            top: 10px;
            left: 10px;
            background-color: #d9534f;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
          .close-btn:hover {
            background-color: #c9302c;
          }
        </style>
      </head>
      <body>
        <div class="header">
          תצוגה מקדימה
          <button class="close-btn" onclick="window.close()">סגור</button>
        </div>
        <div class="iframe-container">
          <iframe src="${blobUrl}"></iframe>
        </div>
      </body>
    </html>
  `);

    popup.document.close();
  }


  previewFile3(blob: Blob): void {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;

      const popup = window.open('', '_blank', 'width=800,height=600');
      if (!popup) return;

      popup.document.write(`
      <html dir="rtl">
        <head>
          <title>תצוגה מקדימה</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; height: 100vh; }
            iframe { flex: 1; border: none; width: 100%; }
            .toolbar {
              background-color: #f5f5f5;
              padding: 10px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid #ccc;
              font-family: Arial;
              font-size: 16px;
              font-weight: bold;
            }
            button {
              font-size: 14px;
              padding: 5px 10px;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <span>תצוגה מקדימה</span>
            <button onclick="window.close()">סגור</button>
          </div>
          <iframe src="${base64data}"></iframe>
        </body>
      </html>
    `);
    };

    reader.readAsDataURL(blob); // this triggers reader.onloadend
  }





  public async deleteFile(urlFile: string): Promise<void> {
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
    this.fileName = file.name;
    console.log("fileName: ", this.fileName);

    return this.convertFileToBase64(file).pipe(
      catchError((err) => {
        console.log("error in convert file to base 64: ", err);
        throw err;
      }),
      switchMap((base64: string) => {
        return this.uploadBase64(base64);  // Return the observable from uploadBase64
      }),
      catchError((error) => {
        console.error('Error during file upload:', error);
        throw error;  // Handle the error and rethrow
      })
    );
  }

  uploadBase64(base64String: string): Observable<any> {
    const tempA = localStorage.getItem('firebaseUserData');
    const tempB = JSON.parse(tempA)
    const uid = tempB.uid;
    this.uniqueIdFile = nanoid();
    const storage = getStorage(); // bucket root
    const fileRef = ref(storage, `users/${uid}/${this.uniqueIdFile}${this.fileName}`); // full path relative to bucket's root
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
    //TODO: change token to headers
    const url = `${environment.apiUrl}expenses/add-supplier`;
    return this.http.post(url, formData);
  }

  editSupplier(formData: any, id: number): Observable<any> {
    //TODO: change token to headers
    const url = `${environment.apiUrl}expenses/update-supplier/${id}`;
    return this.http.patch(url, formData);
  }

  uploadExcelFile(file: File, relativeUrl: string): Observable<any> {
    if (!file) {
      alert("אנא בחר קובץ")
      return of(null);
    }
    else {
      const token = localStorage.getItem('token');
      const url = `${environment.apiUrl}${relativeUrl}`;
      const formData = new FormData();
      formData.append('file', file, file.name);
      const headers = {
        'token': token
      }

      return this.http.post<any>(url, formData, { headers })
    }
  }

  convertBlobToFile(blob: Blob): File {
    const filename = 'document.pdf'; // must include a valid extension: pdf/png/jpg/jpeg
    const file = new File([blob], filename, {
      type: blob.type || 'application/pdf',
      lastModified: Date.now(),
    });
    return file;
  }




    // createUniformFile(startDate: string, endDate: string, businessNumber: string): Observable<Blob> {
    //   const url = `${environment.apiUrl}reports/create-uniform-file`;
    //   const body = { startDate, endDate, businessNumber };

    //   // Make a POST request to get the ZIP file from the backend
    //   return this.http.post(url, body, { responseType: 'blob' });
    // }

    createUniformFile(startDate: string, endDate: string, businessNumber: string): Observable < any > {
      const url = `${environment.apiUrl}reports/create-uniform-file`;
      const body = { startDate, endDate, businessNumber };

      return this.http.post<any>(url, body);
    }




  }
