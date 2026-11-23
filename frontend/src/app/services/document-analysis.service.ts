import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, exhaustMap, filter, map, take, takeWhile, tap, timer } from 'rxjs';
import { environment } from 'src/environments/environment';
export interface AnalysisReceipt {queued:true;jobId:string;state:string;driveFileId:string|null;filename:string}
export interface AnalysisStatus {jobId:string;state:string;errorCode?:string|null;completion:Record<string,any>|null}
const terminal=new Set(['COMPLETED','PASSWORD_REQUIRED','BLOCKED','UNKNOWN','FAILED']);
@Injectable({providedIn:'root'})
export class DocumentAnalysisService {
  constructor(private readonly http:HttpClient){}
  waitFor<T>(receipt:AnalysisReceipt,business:string,onStatus?:(status:string)=>void):Observable<T>{
    if(!receipt?.jobId||!business)throw new Error('Missing document analysis identity');
    onStatus?.(receipt.state);
    return timer(0,1500).pipe(
      // Never overlap status requests on a slow network. Unsubscription stops only polling, not the durable job.
      exhaustMap(()=>this.http.get<AnalysisStatus>(`${environment.apiUrl}documents/me/analysis/${encodeURIComponent(receipt.jobId)}`,{params:new HttpParams().set('businessNumber',business)})),
      tap(status=>onStatus?.(status.state)),
      takeWhile(status=>!terminal.has(status.state),true),filter(status=>terminal.has(status.state)),take(1),
      map(status=>{
        if(status.state!=='COMPLETED'){
          const messages:Record<string,string>={PASSWORD_REQUIRED:'נדרשת סיסמה למסמך; יש להעלות עותק פתוח',UNKNOWN:'תוצאת הניתוח אינה ידועה; המסמך נשמר ולא נשלח שוב אוטומטית',BLOCKED:'המסמך נשמר ונדרש טיפול לפני המשך הניתוח',FAILED:'ניתוח המסמך לא הושלם'};
          throw Object.assign(new Error(messages[status.state]||'ניתוח המסמך לא הושלם'),{analysisCode:status.errorCode||status.state});
        }
        if(!status.completion)throw new Error('Analysis result unavailable');
        if(status.completion['ok']===false)throw new Error(status.completion['code']==='NO_ACCOUNTING_DOCUMENT'?'לא זוהה מסמך חשבונאי':'לא ניתן להשלים את קישור המסמך');
        return status.completion as T;
      }),
    );
  }
}
