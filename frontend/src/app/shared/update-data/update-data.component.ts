import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray } from '@angular/forms';

@Component({
  selector: 'app-update-data',
  templateUrl: './update-data.component.html',
  styleUrls: ['./update-data.component.scss']
})
export class UpdateDataComponent implements OnInit {
  @Input() blocksData: { title: string, fields: { name: string, value: string }[] }[] = [];

  updateForm: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit() {
    this.updateForm = this.fb.group({
      blocks: this.fb.array([]),
    });

    // Initialize the form with predefined blocks and fields
    this.initializeBlocks(this.blocksData);
  }

  // Get the blocks array
  get blocks(): FormArray {
    return this.updateForm.get('blocks') as FormArray;
  }

  // Initialize the form blocks and fields based on input data
  initializeBlocks(blocksData: { title: string, fields: { name: string, value: string }[] }[]) {
    blocksData.forEach(blockData => {
      const block = this.fb.group({
        title: [blockData.title],
        fields: this.fb.array([]),
      });

      blockData.fields.forEach(fieldData => {
        const field = this.fb.group({
          name: [fieldData.name],
          value: [fieldData.value],
        });
        (block.get('fields') as FormArray).push(field);
      });

      this.blocks.push(block);
    });
  }

  saveChanges() {
    console.log(this.updateForm.value);
  }
}
