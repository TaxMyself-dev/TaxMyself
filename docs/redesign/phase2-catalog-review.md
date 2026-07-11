# Phase 2.2 catalog migration — review table

Generated 2026-07-11T21:19:13.798Z by `backend/scripts/migrations/2026-07-12_catalog_migration.ts` (MODE=review), against `keepintax_prodcopy`.

**No writes have been made.** This is a dry run of the Phase 2.2 data migration for sign-off before `MODE=apply` runs.

Categories: 12 default_category (12 migrated, 0 excluded) + 2 user_category (CLIENT) = 14 `category` rows.

Sub-categories: 87 default_sub_category + 15 user_sub_category legacy rows → 98 migrated (7 of them MISSING_ACCOUNTING_MAPPING, some collapse via ANNUAL merges), 4 excluded (dead duplicate categories), 0 SYSTEM rows genuinely unresolved (need a decision).

## Excluded categories (D15 Correction #2 — re-verified zero live usage)

These categoryName values have no matching `default_category` row at all (confirmed: default_category has 12 rows, none named "בית"/"בנקים וכרטיסי אשראי") — they only ever existed as orphan `default_sub_category.categoryName` strings. Excluded per the already-approved Correction #2.

| Source table | Old id | Category → SubCategory |
|---|---|---|
| default_sub_category | 92 | בית → פלאפון |
| default_sub_category | 93 | בית → אינטרנט |
| default_sub_category | 94 | בית → טלפון קווי |
| default_sub_category | 95 | בנקים וכרטיסי אשראי → ריבית |

## Resolved sub_category rows

| Source table | Old id | Owner scope | Category → SubCategory | Disposition |
|---|---|---|---|---|
| default_sub_category | 1 | SYSTEM | דיור והוצאות הבית → שכירות | 60100 הוצאות משרד |
| default_sub_category | 2 | SYSTEM | דיור והוצאות הבית → משכנתא | 60100 הוצאות משרד |
| default_sub_category | 3 | SYSTEM | דיור והוצאות הבית → ארנונה | 60110 ארנונה |
| default_sub_category | 4 | SYSTEM | דיור והוצאות הבית → ועד בית | 60130 ועד בית |
| default_sub_category | 5 | SYSTEM | דיור והוצאות הבית → חשמל | 60140 חשמל |
| default_sub_category | 6 | SYSTEM | דיור והוצאות הבית → מים | 60150 מים |
| default_sub_category | 7 | SYSTEM | דיור והוצאות הבית → גז | 60120 גז |
| default_sub_category | 8 | SYSTEM | דיור והוצאות הבית → אינטרנט | 60310 אינטרנט |
| default_sub_category | 9 | SYSTEM | דיור והוצאות הבית → טלפון קווי | 60320 טלפון קווי |
| default_sub_category | 10 | SYSTEM | דיור והוצאות הבית → תחזוקה | 60160 תחזוקה |
| default_sub_category | 11 | SYSTEM | דיור והוצאות הבית → גינה | 60100 הוצאות משרד |
| default_sub_category | 12 | SYSTEM | אוכל וצריכה שוטפת → סופרמרקט | PRIVATE |
| default_sub_category | 13 | SYSTEM | אוכל וצריכה שוטפת → משלוחים | PRIVATE |
| default_sub_category | 14 | SYSTEM | אוכל וצריכה שוטפת → פארם | PRIVATE |
| default_sub_category | 15 | SYSTEM | רכב ותחבורה → דלק | 60220 דלק |
| default_sub_category | 16 | SYSTEM | רכב ותחבורה → ביטוח רכב | 60210 ביטוח רכב |
| default_sub_category | 17 | SYSTEM | רכב ותחבורה → טיפולים | 60240 טיפולים |
| default_sub_category | 18 | SYSTEM | רכב ותחבורה → חניה | 60230 חניה |
| default_sub_category | 19 | SYSTEM | רכב ותחבורה → כבישי אגרה | 60250 כבישי אגרה |
| default_sub_category | 20 | SYSTEM | רכב ותחבורה → מערכות | 60260 מערכות |
| default_sub_category | 21 | SYSTEM | רכב ותחבורה → תחבורה ציבורית | 60270 תחבורה ציבורית |
| default_sub_category | 22 | SYSTEM | קניות → ביגוד | PRIVATE |
| default_sub_category | 23 | SYSTEM | קניות → אלקטרוניקה | PRIVATE |
| default_sub_category | 24 | SYSTEM | קניות → ריהוט | PRIVATE |
| default_sub_category | 25 | SYSTEM | קניות → מתנות | PRIVATE |
| default_sub_category | 26 | SYSTEM | קניות → כללי | PRIVATE |
| default_sub_category | 27 | SYSTEM | ילדים ומשפחה → גן | PRIVATE |
| default_sub_category | 28 | SYSTEM | ילדים ומשפחה → בית ספר | PRIVATE |
| default_sub_category | 29 | SYSTEM | ילדים ומשפחה → חוגים | PRIVATE |
| default_sub_category | 30 | SYSTEM | ילדים ומשפחה → בייביסיטר | PRIVATE |
| default_sub_category | 31 | SYSTEM | בריאות וביטוחים → רופא | PRIVATE |
| default_sub_category | 32 | SYSTEM | בריאות וביטוחים → תרופות | PRIVATE |
| default_sub_category | 33 | SYSTEM | בריאות וביטוחים → בדיקות | PRIVATE |
| default_sub_category | 34 | SYSTEM | בריאות וביטוחים → ביטוח בריאות | PRIVATE |
| default_sub_category | 35 | SYSTEM | פנאי וחופשות → מסעדות | PRIVATE |
| default_sub_category | 36 | SYSTEM | פנאי וחופשות → נופש | PRIVATE |
| default_sub_category | 39 | SYSTEM | פנאי וחופשות → ספורט | PRIVATE |
| default_sub_category | 40 | SYSTEM | פנאי וחופשות → בילויים | PRIVATE |
| default_sub_category | 41 | SYSTEM | עסק → הוצאות משרד | 60100 הוצאות משרד |
| default_sub_category | 42 | SYSTEM | עסק → תוכנות | 60410 תוכנות |
| default_sub_category | 43 | SYSTEM | עסק → שיווק ופרסום | 60500 שיווק ופרסום |
| default_sub_category | 44 | SYSTEM | עסק → הנהלת חשבונות | 60700 הנהלת חשבונות |
| default_sub_category | 45 | SYSTEM | עסק → רואה חשבון | 60700 הנהלת חשבונות |
| default_sub_category | 46 | SYSTEM | עסק → ספקים | 60000 הוצאות לא מוכרות |
| default_sub_category | 47 | SYSTEM | עסק → ייעוץ והשתלמויות | 60610 ייעוץ והשתלמויות |
| default_sub_category | 48 | SYSTEM | עסק → ספרות מקצועית | 60900 ספרות מקצועית |
| default_sub_category | 49 | SYSTEM | עסק → כיבוד | 61000 כיבוד |
| default_sub_category | 50 | SYSTEM | עסק → מקדמות ביטוח לאומי | 90300 מקדמות ביטוח לאומי |
| default_sub_category | 51 | SYSTEM | עסק → מקדמות מס הכנסה | 90100 מקדמות מס הכנסה |
| default_sub_category | 52 | SYSTEM | עסק → גביית מע"מ | 90200 גביית מע"מ |
| default_sub_category | 53 | SYSTEM | עסק → הפקדה לקרן פנסיה | ANNUAL (merge → "הפקדה לפנסיה") |
| default_sub_category | 54 | SYSTEM | עסק → הפקדה לקרן השתלמות | ANNUAL (merge → "הפקדה לקרן השתלמות") |
| default_sub_category | 55 | SYSTEM | עסק → עמלות ודמי כרטיס | 61100 עמלות ודמי כרטיס |
| default_sub_category | 56 | SYSTEM | עסק → הוצאות שכר | 60810 הוצאות שכר |
| default_sub_category | 57 | SYSTEM | בנק, אשראי ותנועות → ריבית | 61210 ריבית |
| default_sub_category | 58 | SYSTEM | בנק, אשראי ותנועות → עמלות ודמי כרטיס | 61100 עמלות ודמי כרטיס |
| default_sub_category | 60 | SYSTEM | בנק, אשראי ותנועות → חיוב אשראי חודשי | 90500 תנועות פנימיות בין חשבונות |
| default_sub_category | 61 | SYSTEM | בנק, אשראי ותנועות → משיכת מזומן | 90500 תנועות פנימיות בין חשבונות |
| default_sub_category | 62 | SYSTEM | בנק, אשראי ותנועות → פרעון הלוואה | 90600 פרעון הלוואות (קרן) |
| default_sub_category | 63 | SYSTEM | בנק, אשראי ותנועות → בין חשבונותי | 90500 תנועות פנימיות בין חשבונות |
| default_sub_category | 64 | SYSTEM | בנק, אשראי ותנועות → ביט | 90500 תנועות פנימיות בין חשבונות |
| default_sub_category | 65 | SYSTEM | בנק, אשראי ותנועות → פייבוקס | 90500 תנועות פנימיות בין חשבונות |
| default_sub_category | 66 | SYSTEM | הכנסות → הכנסה עסקית | 40000 הכנסות |
| default_sub_category | 67 | SYSTEM | הכנסות → משכורת | 40000 הכנסות |
| default_sub_category | 68 | SYSTEM | הכנסות → זיכוי כרטיס אשראי | 40000 הכנסות |
| default_sub_category | 69 | SYSTEM | הכנסות → מילואים | 40000 הכנסות |
| default_sub_category | 70 | SYSTEM | הכנסות → דמי לידה | 40000 הכנסות |
| default_sub_category | 71 | SYSTEM | הכנסות → אפליקציית תשלום | 40000 הכנסות |
| default_sub_category | 72 | SYSTEM | דיור והוצאות הבית → פלאפון | 60330 פלאפון |
| default_sub_category | 73 | SYSTEM | שונות → שונות | 60000 הוצאות לא מוכרות |
| default_sub_category | 74 | SYSTEM | ילדים ומשפחה → מעון | PRIVATE |
| default_sub_category | 76 | SYSTEM | בריאות וביטוחים → קופת חולים | PRIVATE |
| default_sub_category | 77 | SYSTEM | החזרי מס ודוח שנתי → תרומות מוכרות | ANNUAL |
| default_sub_category | 78 | SYSTEM | החזרי מס ודוח שנתי → ביטוח חיים | ANNUAL |
| default_sub_category | 79 | SYSTEM | החזרי מס ודוח שנתי → ביטוח אובדן כושר עבודה | ANNUAL |
| default_sub_category | 80 | SYSTEM | החזרי מס ודוח שנתי → הפקדה לקרן השתלמות (עצמאי) | ANNUAL (merge → "הפקדה לקרן השתלמות") |
| default_sub_category | 81 | SYSTEM | החזרי מס ודוח שנתי → הפקדה לפנסיה (עצמאי) | ANNUAL (merge → "הפקדה לפנסיה") |
| default_sub_category | 82 | SYSTEM | פנאי וחופשות → ספרות וקריאה | PRIVATE |
| default_sub_category | 83 | SYSTEM | פנאי וחופשות → שירותי סטרימינג | PRIVATE |
| default_sub_category | 84 | SYSTEM | הכנסות → קצבת ילדים | 40000 הכנסות |
| default_sub_category | 85 | SYSTEM | עסק → שכירות משרד | 60170 שכירות משרד |
| default_sub_category | 86 | SYSTEM | עסק → שליחויות | 60180 שליחויות |
| default_sub_category | 87 | SYSTEM | עסק → ייעוץ מקצועי | 60620 ייעוץ מקצועי |
| user_sub_category | 1 | CLIENT_204245724 | אוכל וצריכה שוטפת → מכולת רמגש | PRIVATE |
| user_sub_category | 2 | CLIENT_204245724 | אוכל וצריכה שוטפת → מכולת נוב | PRIVATE |
| user_sub_category | 3 | CLIENT_204245724 | אוכל וצריכה שוטפת → בשרים | PRIVATE |
| user_sub_category | 4 | CLIENT_308360981 | אוכל וצריכה שוטפת → איסוף עצמי | PRIVATE |
| user_sub_category | 5 | CLIENT_308360981 | חומרי גלם וציוד לאפיה → קונדיטוריה | MISSING_ACCOUNTING_MAPPING (migrated, no card yet) |
| user_sub_category | 6 | CLIENT_204245724 | דיור והוצאות הבית → מיסי ישוב | MISSING_ACCOUNTING_MAPPING (migrated, no card yet) |
| user_sub_category | 7 | CLIENT_204245724 | פנאי וחופשות → אופנוע | PRIVATE |
| user_sub_category | 8 | CLIENT_204245724 | חריגים → שיפוץ נוב | MISSING_ACCOUNTING_MAPPING (migrated, no card yet) |
| user_sub_category | 9 | CLIENT_200866028 | בריאות וביטוחים → ביטוח חיים | ANNUAL |
| user_sub_category | 10 | CLIENT_200866028 | דיור והוצאות הבית → מיסי ישוב ומים | MISSING_ACCOUNTING_MAPPING (migrated, no card yet) |
| user_sub_category | 11 | CLIENT_200866028 | שונות → תרומה | MISSING_ACCOUNTING_MAPPING (migrated, no card yet) |
| user_sub_category | 12 | CLIENT_204245724 | עסק → מקדמות ביטוח לאומי | 90300 מקדמות ביטוח לאומי |
| user_sub_category | 13 | CLIENT_207550344 | אוכל וצריכה שוטפת → משנת | PRIVATE |
| user_sub_category | 14 | CLIENT_322253238 | הכנסות → מלגה | MISSING_ACCOUNTING_MAPPING (migrated, no card yet) |
| user_sub_category | 15 | CLIENT_322253238 | הכנסות → העברה בין חשבונות | MISSING_ACCOUNTING_MAPPING (migrated, no card yet) |

## Percent-variant cases (user_sub_category whose percents differ from the resolved target card)

None found.

## Unmatched CLIENT sub_category parents (no CLIENT or SYSTEM category by that name)

None found.

## MISSING_ACCOUNTING_MAPPING (CLIENT rows migrated unmapped, per D5)

No override, no name match, no accountCode fallback for these CLIENT rows — per D5, a CLIENT sub_category with no resolvable card is still created (accountId=NULL, approvalStatus=MISSING_ACCOUNTING_MAPPING) rather than dropped, so Phase 3.2's expense backfill has something real to attach to. An accountant completes the mapping later (D9).

| user_sub_category id | Owner scope | Category → SubCategory |
|---|---|---|
| 5 | CLIENT_308360981 | חומרי גלם וציוד לאפיה → קונדיטוריה |
| 6 | CLIENT_204245724 | דיור והוצאות הבית → מיסי ישוב |
| 8 | CLIENT_204245724 | חריגים → שיפוץ נוב |
| 10 | CLIENT_200866028 | דיור והוצאות הבית → מיסי ישוב ומים |
| 11 | CLIENT_200866028 | שונות → תרומה |
| 14 | CLIENT_322253238 | הכנסות → מלגה |
| 15 | CLIENT_322253238 | הכנסות → העברה בין חשבונות |

## Unresolved SYSTEM rows (no override, no name match, no accountCode fallback — NOT migrated, needs Elazar's decision)

None — every SYSTEM row resolved.

## PROPOSED dispositions requiring explicit confirmation before apply

- קרן השתלמות merge (עסק/הפקדה לקרן השתלמות + החזרי מס/הפקדה לקרן השתלמות (עצמאי) → ONE ANNUAL sub_category) — **CONFIRMED** by Elazar this session, same pattern as the pension merge.
- Internal account transfers (ביט, בין חשבונותי, חיוב אשראי חודשי, משיכת מזומן, פייבוקס) → new account 90500 — **CONFIRMED** this session.
- Loan principal repayment (פרעון הלוואה) → new account 90600 — **CONFIRMED** this session (account 1000 checked and rejected as a target — vestigial, never-posted-to placeholder).
