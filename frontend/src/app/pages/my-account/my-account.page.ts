import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-my-account',
  templateUrl: './my-account.page.html',
  styleUrls: ['./my-account.page.scss'],
})
export class MyAccountPage implements OnInit {

str: string = "good";
cities: any;

  constructor(private http: HttpClient) { }

  ngOnInit() {
   const url = "https://raw.githubusercontent.com/royts/israel-cities/master/israel-cities.json";
    this.http.get(url).subscribe((res) => {
      console.log(res);
      
      this.cities = res;
      console.log(this.cities);
      
    })
  }

}
