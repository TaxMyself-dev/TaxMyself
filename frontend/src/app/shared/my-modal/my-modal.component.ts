import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { FormBuilder, FormGroup,Validators } from '@angular/forms';
@Component({
  selector: 'app-my-modal',
  templateUrl: './my-modal.component.html',
  styleUrls: ['./my-modal.component.scss'],
})
export class MyModalComponent implements OnInit {
  inputs = [
    {
      name: 'input1',
      label: 'Input 1',
      type: 'input',
    },
    {
      name: 'select1',
      label: 'Select 1',
      type: 'select',
      options: [
        { label: 'Option 1', value: 'option1' },
        { label: 'Option 2', value: 'option2' },
        // Add more options as needed
      ],
    },
    // Add more input configurations as needed
  ];
  modalForm: FormGroup;
  saveData() {
    // Implement your logic to handle saving the entered data
    // You can access the form values using this.modalForm.value
    // Perform any necessary validations and data processing

    // Close the modal and pass the data back to the parent component if needed
    this.modalController.dismiss(this.modalForm?.value);
  }

  dismiss() {
    // Close the modal without saving any data
    this.modalController.dismiss();
  }
  constructor(private modalController: ModalController, private formBuilder: FormBuilder) {
    this.modalForm = this.formBuilder.group({
      category: ['', Validators.required],
      provider: ['', [Validators.required, Validators.email]],
      sum: ['', Validators.required], 
      percentTax: ['', Validators.required],
      percentVat: ['', Validators.required],
     
    });
  }

  ngOnInit() { }

}
