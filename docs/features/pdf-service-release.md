# פריסת הבק, שירות ה־PDF והפרונט

למפעיל בלבד: Codex אינו מריץ פקודות ענן או ניגש לפרוד.
אין שינוי סכימה או תיקון הנחות בדלוור הזה. בדיקות ההנחות הן אפיון של תקלות
קיימות, והנושא נשאר למפתח השני. אין להריץ את Deploy-KeepintaxPdf.ps1 הישן:
הוא נעול לקומיט 1ff0bd53 ואינו מתאים לעדכון הזה.

## 1. הכנה ומקור נקי

PowerShell, מהצ׳קאאוט הראשי לאחר שהמיזוג והפוש הושלמו:

```powershell
Set-Location C:/Users/user/Keepintax/TaxMyself
$ErrorActionPreference = 'Stop'
function Assert-NativeSuccess { if ($LASTEXITCODE -ne 0) { throw 'הפקודה נכשלה; אין להמשיך' } }
git pull --ff-only origin main
Assert-NativeSuccess
if ((git branch --show-current) -ne 'main') { throw 'נדרש main' }
if (git status --porcelain) { throw 'נדרש מקור נקי' }
$release = (git rev-parse HEAD).Trim()
$short = (git rev-parse --short=8 HEAD).Trim()
$projectId = 'taxmyself-prod'
$region = 'me-west1'
$pdfService = 'keepintax-pdf'
$backendService = 'taxmys16elf-prod'
$releaseTag = "$short-$(Get-Date -Format yyyyMMddHHmmss)"
$runDirectory = Join-Path $env:TEMP "keepintax-release-$releaseTag"
New-Item -ItemType Directory -Path $runDirectory | Out-Null
gcloud auth list --filter=status:ACTIVE --format='value(account)'
Assert-NativeSuccess
```

ודא שהחשבון הוא חשבון הפריסה שלך (בעבודה הקודמת info@keepintax.co.il).
שמות השירותים והריפו נלקחו מהפריסה הקודמת; הפקודות הבאות מאמתות מצב נוכחי.
אין להדפיס JSON מלא של תצורת הבק: הוא עלול להכיל סודות.

```powershell
$pdfState = gcloud run services describe $pdfService --project=$projectId --region=$region --format=json | ConvertFrom-Json
Assert-NativeSuccess
$backendState = gcloud run services describe $backendService --project=$projectId --region=$region --format=json | ConvertFrom-Json
Assert-NativeSuccess
$pdfTraffic = @($pdfState.status.traffic | Where-Object { $_.percent -gt 0 })
$backendTraffic = @($backendState.status.traffic | Where-Object { $_.percent -gt 0 })
if ($pdfTraffic.Count -ne 1 -or $pdfTraffic[0].percent -ne 100 -or $backendTraffic.Count -ne 1 -or $backendTraffic[0].percent -ne 100) { throw 'נדרשת בדיקת פיצול התעבורה' }
$oldPdfRevision = $pdfTraffic[0].revisionName
$oldBackendRevision = $backendTraffic[0].revisionName
$pdfAccount = $pdfState.spec.template.spec.serviceAccountName
$pdfUrl = $pdfState.status.url
if (!$pdfAccount -or !$pdfUrl.StartsWith('https://')) { throw 'תצורת PDF חסרה' }
@{commit=$release;pdfRevision=$oldPdfRevision;backendRevision=$oldBackendRevision} | ConvertTo-Json | Set-Content (Join-Path $runDirectory 'release.json')
```

אין להעתיק ENV מדב לפרוד. PDF_SERVICE_URL צריך להיות HTTPS של השירות,
ולא localhost:8082. FILLFASTER_API_TOKEN נשאר בבק בלבד. שמור על הגדרות DB,
סודות, חשבונות שירות, CPU, זיכרון, min/max instances וחיוב קיימים.
ודא NODE_ENV=production; אין להגדיר PDF_DIAGNOSTICS_FILE בפרוד.
אין להמשיך אם מתבצעת פריסה אחרת במקביל.

## 2. שירות PDF — ראשון

הבנייה מה־root משתמשת ב־Dockerfile הייעודי וברשימת קבצים מותרת. היא מריצה
בדיקות יחידה ו־Chromium/HTTP ב־Linux תחת 1CPU/1GiB לפני פרסום image.

```powershell
$pdfImage = "$region-docker.pkg.dev/$projectId/keepintax-pdf/keepintax-pdf:$releaseTag"
gcloud builds submit . --config=pdf-service/cloudbuild.publish.json --ignore-file=pdf-service/source.gcloudignore --substitutions="_IMAGE=$pdfImage" --project=$projectId --region=$region
Assert-NativeSuccess
gcloud run deploy $pdfService --image=$pdfImage --service-account=$pdfAccount --no-allow-unauthenticated --concurrency=1 --timeout=60 --no-traffic --project=$projectId --region=$region
Assert-NativeSuccess
$newPdfRevision = (gcloud run services describe $pdfService --project=$projectId --region=$region --format='value(status.latestCreatedRevisionName)').Trim()
Assert-NativeSuccess
$pdfReady = (gcloud run services describe $pdfService --project=$projectId --region=$region --format='value(status.latestReadyRevisionName)').Trim()
Assert-NativeSuccess
if ($newPdfRevision -ne $pdfReady) { throw 'רביזיית PDF אינה מוכנה' }
gcloud run services update-traffic $pdfService --to-revisions="$newPdfRevision=100" --project=$projectId --region=$region
Assert-NativeSuccess
```

השירות חייב להישאר פרטי, עם invoker של חשבון הבק הקיים. אין צורך לשנות IAM
אם החיבור הקיים תקין; אין לפתוח allUsers. חוזה v1 תואם לבק הקודם בזמן המעבר.
Ready ובניית image אינם מוכיחים IAM מקצה לקצה; יש לבדוק דרך האפליקציה בהמשך.

## 3. הבק — Dockerfile קיים, Node 18

מכינים snapshot נקי מאותו קומיט. פקודת הפריסה משמרת הגדרות קיימות ומעדכנת
רק את PDF_SERVICE_URL. אין קובצי ENV, תלויות מקומיות או dist במקור שנארז.

```powershell
$backendZip = Join-Path $runDirectory 'backend.zip'
$backendSource = Join-Path $runDirectory 'backend-source'
git archive --format=zip --output=$backendZip "${release}:backend"
Assert-NativeSuccess
Expand-Archive -LiteralPath $backendZip -DestinationPath $backendSource
@('.git','node_modules','dist','.env','.env.*','*.key','*.pem') | Set-Content (Join-Path $backendSource '.gcloudignore')
$backendTag = "pdf-$short"
gcloud run deploy $backendService --source=$backendSource --update-env-vars="PDF_SERVICE_URL=$pdfUrl" --revision-suffix=$releaseTag --tag=$backendTag --no-traffic --project=$projectId --region=$region
Assert-NativeSuccess
$newBackendState = gcloud run services describe $backendService --project=$projectId --region=$region --format=json | ConvertFrom-Json
Assert-NativeSuccess
$newBackendRevision = $newBackendState.status.latestCreatedRevisionName
if ($newBackendRevision -ne $newBackendState.status.latestReadyRevisionName) { throw 'הבק אינו מוכן' }
$stagedUrl = @($newBackendState.status.traffic | Where-Object { $_.tag -eq $backendTag })[0].url
if (!$stagedUrl) { throw 'כתובת בדיקת רביזיה חסרה' }
$health = Invoke-WebRequest -Uri "$stagedUrl/" -UseBasicParsing
if ($health.StatusCode -ne 200) { throw 'בדיקת בריאות נכשלה' }
gcloud run services update-traffic $backendService --to-revisions="$newBackendRevision=100" --project=$projectId --region=$region
Assert-NativeSuccess
```

אם בדיקת הבריאות דורשת IAM, השתמש בדרך האימות הקיימת; אין לפתוח גישה
ציבורית כדי לעקוף 401/403. בדיקת root אינה בדיקת PDF/חתימה. לאחר קידום הבק,
בדוק תצוגה מקדימה באפליקציה לפני פריסת הפרונט; בכשל עצור ובדוק rollback.

## 4. פרונט — Firebase app בלבד

```powershell
Set-Location C:/Users/user/Keepintax/TaxMyself/frontend
npm ci
Assert-NativeSuccess
npm run build -- --configuration production
Assert-NativeSuccess
Set-Location ..
if (!(Test-Path frontend/dist/app/index.html)) { throw 'פלט הפרונט חסר' }
if ((git rev-parse HEAD).Trim() -ne $release) { throw 'קומיט המקור השתנה' }
firebase deploy --only hosting:app --project $projectId
Assert-NativeSuccess
```

אין לפרוס hosting:landing. הפרוד נבנה עם environment.prod.ts; localhost:3000
שייך לדב בלבד. רענן/פתח מחדש את ה־PWA כדי לקבל את גרסת ה־service worker.

## 5. בדיקה וחזרה לאחור

- בדוק מספר תצוגות מקדימות: טעינה מיידית בטאב, PDF, לוגו ופונטים תקינים.
- ודא ששני כפתורי ההפקה חסומים בזמן בקשה ומשתחררים גם בשגיאה.
- מסמך בפרוד הוא מסמך אמיתי. בצע רק יצירה עסקית מכוונת שלך, לא מסמך דמה
  אוטומטי. ודא מקור והעתק חתומים ושמורים. פירוט ההנחות עדיין לא תוקן.
- בדב נמדדו 7.56 ו־5.66 שניות ליצירה וכ־1.8 לתצוגה; אין הבטחה לזמן זהה בענן.
- שמור מזהי בנייה ורביזיות חדשות לצד release.json. בתקלת rollout השתמש
  ברביזיות המקוריות ששמרת, ולא ב־--to-latest:

```powershell
gcloud run services update-traffic $backendService --to-revisions="$oldBackendRevision=100" --project=$projectId --region=$region
Assert-NativeSuccess
gcloud run services update-traffic $pdfService --to-revisions="$oldPdfRevision=100" --project=$projectId --region=$region
Assert-NativeSuccess
```

אפשר להחזיר פרונט לגרסת Hosting הקודמת דרך Release history של האתר הנכון
בפרויקט taxmyself-prod. חזרה לקוד קודם אינה מבטלת מסמכים או משנה נתונים;
אין להריץ rollback DB או למחוק מסמכים כחלק מפעולה זו.
