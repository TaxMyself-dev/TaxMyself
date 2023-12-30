import { Injectable } from '@angular/core';
import { getStorage, ref, getDownloadURL } from "@angular/fire/storage";

@Injectable({
  providedIn: 'root'
})
export class FilesService {

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
}
