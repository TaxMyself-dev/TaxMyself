import { httpResource } from "@angular/common/http";
import { computed, effect, Injectable, signal } from "@angular/core";
import { ICategory } from "src/app/shared/interface";
import { environment } from "src/environments/environment";

@Injectable({
    providedIn: 'root'
})
export class MannualExpenseService {

    $selectedCategory = signal<string>("");

    $categoriesOptions = computed(() => {
        return this.categories.value()?.map((item: ICategory) => ({
            name: item.categoryName,
            value: item.categoryName
        })
        )
    })

    readonly categories = httpResource<ICategory[]>(`${environment.apiUrl}expenses/get-categories`)

    readonly subCategories = httpResource<any[]>(() => {
    const selectedCategory = this.$selectedCategory();

    if (!selectedCategory) return undefined;

    return {
      url: `${environment.apiUrl}expenses/get-sub-categories`,
      params: { businessNumber: selectedCategory }, // query string
      method: 'GET',
    };
  });

    x = effect(() => {
        console.log("categories", this.$categoriesOptions());
        console.log("subCategories", this.subCategories.value());
        console.log("suppliers", this.suppliers.value());

    })

    readonly suppliers = httpResource<any[]>(`${environment.apiUrl}expenses/get-suppliers-list`);
    //       getCategories(isDefault?: boolean, isExpense: boolean = true): Observable<ISelectItem[]> {
    //     const url = `${environment.apiUrl}expenses/get-categories`;
    //     const param = new HttpParams()
    //       .set('isDefault', isDefault)
    //       .set('isExpense', isExpense)
    //     return this.http.get<ISelectItem[]>(url, { params: param })
    //     .pipe(
    //       catchError((err) => {
    //         console.log("error in get category", err);
    //         return EMPTY;
    //       }),
    //       map((res) => {
    //         return res.map((item: any) => ({
    //           name: item.categoryName,
    //           value: item.categoryName
    //         })
    //         )
    //       }),
    //       tap((res: ISelectItem[]) => {
    //         console.log("category", res);
    //         this.categories.set(res);
    //         console.log("categories", this.categories());
    //       })
    //     )
    //   }
}
