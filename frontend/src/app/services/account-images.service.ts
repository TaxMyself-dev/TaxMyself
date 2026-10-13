import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export const MAX_ACCOUNT_IMAGE_BYTES = 5 * 1024 * 1024;
export function accountImageError(file: File): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'יש לבחור תמונת PNG, JPEG או WebP';
  if (!file.size || file.size > MAX_ACCOUNT_IMAGE_BYTES) return 'גודל התמונה חייב להיות עד 5MB';
  return null;
}

@Injectable({ providedIn: 'root' })
export class AccountImagesService {
  private readonly http = inject(HttpClient);
  endpoint(businessId?: number): string {
    return `${environment.apiUrl}${businessId == null ? 'auth/profile-image' : `business/${businessId}/logo`}`;
  }
  load(businessId?: number) {
    return this.http.get(this.endpoint(businessId), {
      responseType: 'blob', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
    });
  }
  upload(file: File, businessId?: number) {
    const data = new FormData();
    data.append('file', file);
    return this.http.post<{ imagePath: string | null }>(this.endpoint(businessId), data);
  }
  remove(businessId?: number) { return this.http.delete<{ imagePath: string | null }>(this.endpoint(businessId)); }
}
