// // excel.controller.ts

// import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
// import { FileInterceptor } from '@nestjs/platform-express';
// import { ExcelService } from './excel.service';

// @Controller('excel')
// export class ExcelController {
//   constructor(private readonly excelService: ExcelService) {}


//   @Post('/example')
//   async excelExample() {
//       console.log("upload excel file");
//   }
// //  @Post('example')
// //  {  console.log("upload excel file");
// //}
  

//   @Post('/upload')
//   //@UseInterceptors(FileInterceptor('file'))
//   async uploadExcelFile(@UploadedFile() file) {
//     console.log("upload excel file");
//     console.log(file);
    
//     //const data = this.excelService.readExcelFile(file.buffer);
//     // Process the data as needed
//     //console.log(data);
//     //return { message: 'File uploaded and processed successfully.' };
//   }

// }

