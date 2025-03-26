import { Component, input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ButtonComponent } from "../button/button.component";
import { bunnerImagePosition } from 'src/app/shared/enums';
import { ButtonColor, ButtonSize } from '../button/button.enum';


@Component({
  selector: 'app-image-bunner',
  standalone: true,
  templateUrl: './image-bunner.component.html',
  styleUrls: ['./image-bunner.component.scss'],
  imports: [CommonModule, ButtonModule, ButtonComponent],

})
export class ImageBunnerComponent  implements OnInit {

  imageWidth = input<string>();
  imageHeight = input<string>();
  imageUrl = input<string>();
  alt = input<string>();  
  title = input<string>();  
  content = input<string>();  
  textPosition = input<bunnerImagePosition>();  
  buttonPosition = input<bunnerImagePosition>();  
  buttonLabel = input<string>();  
  buttonSize = input<ButtonSize>();  
  buttonColor = input<ButtonColor>();  
  constructor() { }
  
  ngOnInit() {
    
    console.log("🚀 ~ ImageBunnerComponent ~ buttonColor:", this.buttonColor())
    console.log("🚀 ~ ImageBunnerComponent ~ buttonColor:", this.buttonSize())
  }

}
