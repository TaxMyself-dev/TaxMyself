import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { getStorage, ref, getDownloadURL, deleteObject, uploadString } from "@angular/fire/storage";
import { log } from 'console';
import { nanoid } from 'nanoid';
import { Observable, from, of, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FilesService {

  uniqueId: string;
  arrayFolder = ["111", "2222", "3333"];//id folder for user. change to our id of user


  constructor(private http: HttpClient) { }

  public async downloadFile(urlFile: string) {
    console.log("in dowmload file");

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
    const i = Math.floor((Math.random() * 100) % 3);
    this.uniqueId = nanoid();
    const storage = getStorage(); // bucket root
    const fileRef = ref(storage, this.arrayFolder[i] + "/" + this.uniqueId); // full path relative to bucket's root
    return from(uploadString(fileRef, base64String, 'data_url'));
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
