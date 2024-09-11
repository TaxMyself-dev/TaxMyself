import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { getStorage, ref, getDownloadURL, deleteObject, uploadString } from "@angular/fire/storage";
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { log } from 'console';
import { nanoid } from 'nanoid';
import { Observable, from, of, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FilesService {

  uniqueIdFile: string;
  safePdfBase64String: SafeResourceUrl;


  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  public async downloadFile(urlFile: string) {
    console.log("in dowmload file");
console.log(urlFile);

    const storage = getStorage();
    const pathReference = ref(storage, urlFile);
    let blob;
    try {
      const url = await getDownloadURL(pathReference);
      console.log(url);
      urlFile = url;
      const response = await fetch(url);
      blob = await response.blob();
      console.log('File MIME type:', blob.type);
     
    }
    catch (error) {
      console.error("error from download file", error);
    }

    return {file:urlFile, type: blob.type} ;
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

  uploadFileViaFront(base64String: string): Observable<any> {
    console.log("in upload file via front");
    
    const tempA = localStorage.getItem('user');
    const tempB = JSON.parse(tempA)
    const uid = tempB.uid;
    this.uniqueIdFile = nanoid();
    const storage = getStorage(); // bucket root
    const fileRef = ref(storage, `users/${uid}/deductibleExp/${this.uniqueIdFile}`); // full path relative to bucket's root
    const x = from(uploadString(fileRef, base64String, 'data_url'));
    x.subscribe((res) => {
      console.log(res.metadata);
      
    })
    //console.log(x.subscribe());
    
    return x;
  }

  convertPdfFileToBase64String(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const result = reader.result;
  
        if (!result) {
          reject('result is null');
          return;
        }
  
        resolve(reader.result.toString());
      });
      reader.addEventListener('error', reject);
      reader.readAsDataURL(file);
    });
  }

  async fileSelected(event: any) {
    //console.log("in filelelel");
    //this.pdfLoaded = false;// on change pdf to image
    
    let file = event.target.files[0];
    console.log("fileeeeeeeeeeee", file);
    
    if (!file) {
      return;
    }

    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(`.${extension}`)) {
      alert('Please upload only PDF, PNG, or JPEG files.');
      return;
    } 
    
    // if (extension === "pdf"){
    //   console.log("in pdf");
    //   const target = event.target as HTMLInputElement;
    //   const files = target.files as FileList;
    //   const file = files.item(0);
    //   console.log("pdf file:", file);

    //   if (!file) {
    //     return;
    //   }

    //   const rawPdfBase64String = await this.convertPdfFileToBase64String(file);
    //   this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl(rawPdfBase64String);
    //   //this.pdfLoaded = true;
    //   //this.uploadFileViaFront(this.safePdfBase64String)
    // }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      this.uploadFileViaFront(reader.result as string)
      // if (this.isEditMode) {
      //   this.editModeFile = reader.result as string;
      //   this.selectedFile = reader.result as string;//for update expense can mabey change the func update 
      // }
      // else{
      //   this.selectedFile = reader.result as string;
      // }
      // console.log(this.selectedFile);
      
    }

    
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
}
