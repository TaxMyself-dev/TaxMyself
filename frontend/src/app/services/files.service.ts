import { Injectable } from '@angular/core';
import { getStorage, ref, getDownloadURL, deleteObject, uploadString } from "@angular/fire/storage";
import { log } from 'console';
import { nanoid } from 'nanoid';
import { Observable, from, of, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FilesService {

  uniqueId: string;
  arrayFolder = ["111", "2222", "3333"];//id folder for user. change to our id of user


  constructor() { }

  public async downloadFile(urlFile: string) {
    const storage = getStorage();
    const pathReference = ref(storage, urlFile);
    try {
      const url = await getDownloadURL(pathReference);
      console.log(url);
      urlFile = url;
    } catch (error) {
      console.error(error);
    }

    return urlFile;
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
    console.log("in uploadFileViaFront ");
    const i = Math.floor((Math.random() * 100) % 3);
    console.log("i of array: ", i);
    this.uniqueId = nanoid();
    const storage = getStorage(); // bucket root
    const fileRef = ref(storage, this.arrayFolder[i] + "/" + this.uniqueId); // full path relative to bucket's root
    console.log(fileRef);
    console.log("uuid: ", this.uniqueId);
    // return throwError('error in uploadFileViaFront'); // check error handlling
    return from(uploadString(fileRef, base64String, 'data_url'));
  // const filePath = uploadString(fileRef, base64String, 'data_url').then((snapshot) => {
    //console.log('Uploaded a data_url string!');
    //console.log("fullPath :", snapshot.metadata.fullPath);
    // return snapshot.metadata.fullPath;
  // });
  // return filePath;
  }
}
