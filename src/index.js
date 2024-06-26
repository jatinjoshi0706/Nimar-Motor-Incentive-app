const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const XLSX = require('xlsx');
const writeXlsxFile = require('write-excel-file/node');
const { isContext } = require('node:vm');
if (require('electron-squirrel-startup')) {
  app.quit();
}


const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};
const function1 = require('./functions/func1');
let function1Result;

//global datasheets
let salesExcelDataSheet = [];// salesExcelDataSheet : [
                            //   {
                            //     101: [{}, {}, {}]
                            //   },
                            //   {
                            //     102: [{}, {}, {}]
                            //   },
                            //   {
                            //     103: [{}, {}, {}]
                            //   }
                            // ]
let CDIScoreDataSheet = [];
let employeeStatusDataSheet = [];
let qualifiedRM = [];
let nonQualifiedRM = [];

const perCarincentiveCalculation = (formData) => {
  qualifiedRM.forEach((record) => {
    const soldCar = record["Grand Total"];
    let perCarIncentive = 0;

    // Find the appropriate incentive based on the exact number of cars sold
    formData.carIncentive.forEach((incentive) => {
      if (soldCar === parseInt(incentive.cars)) {
        perCarIncentive = parseInt(incentive.incentive);
        console.log("perCarIncentive ::::::::::::::::::", perCarIncentive);
      }
    });

    // Add the incentive to the record
    record["Per Car Incentive"] = perCarIncentive;
    record["Total Incentive"] = soldCar * perCarIncentive;
  });

  console.log("qualifiedRM with incentives: ", qualifiedRM);
}
const checkQualifingCondition = (formData, employeStatusArr) => {
  console.log("checkQualifingCondition");
  salesExcelDataSheet.forEach((item) => {

    let numberCheck = 0;
    let EWCheck = 0;
    let autoCardCheck = 0;
    let obj = {};
    let carObj = {
      "ALTO": 0,
      "K-10": 0,
      "S-Presso": 0,
      "CELERIO": 0,
      "WagonR": 0,
      "BREZZA": 0,
      "DZIRE": 0,
      "EECO": 0,
      "Ertiga": 0,
      "SWIFT": 0
    }

    const DSE_NoOfSoldCarExcelDataArr = Object.values(item)[0];

    let empStatus = true;
    console.log(employeStatusArr)
    employeStatusArr.forEach(employee => {
      if (employee["DSE ID"] == DSE_NoOfSoldCarExcelDataArr[0]['DSE ID']) {
        if (employee["STATUS"] === "NEW")
          empStatus = false;
      }
    });

    console.log("Data::");
    console.log(DSE_NoOfSoldCarExcelDataArr[0]['DSE ID']);
    console.log(empStatus);
    // console.log(employeStatusKey);
    if (empStatus) {
      obj = {
        "DSE ID": DSE_NoOfSoldCarExcelDataArr[0]['DSE ID'],
        "DSE Name": DSE_NoOfSoldCarExcelDataArr[0]['DSE Name'],
        "BM AND TL NAME": DSE_NoOfSoldCarExcelDataArr[0]['BM AND TL NAME'],
        "Extended Warranty": DSE_NoOfSoldCarExcelDataArr[0]['Extended Warranty'],
        "Focus Model Qualification": "No",
        "Grand Total": 0
      }

      DSE_NoOfSoldCarExcelDataArr.forEach((sold) => {

        if (formData.QC.focusModel.includes(sold["Model Name"])) {
          numberCheck++;
          carObj[sold["Model Name"]]++;
        }
        if (formData.QC.autoCard == "yes") {
          if (sold["Autocard"] == "YES") {
            autoCardCheck++;
          }
        }
        if (formData.QC.EW == "yes") {
          if (sold["Extended Warranty"] > 0) {
            EWCheck++;
          }
        }
      })

      //for EW and auto card check
      if (numberCheck >= formData.QC.numOfCars) {
        let EWFlag = true;
        let autoCardFlag = true;

        //checking autocard from the excel [form ] 
        if (formData.QC.autoCard === "yes" && (EWCheck >= DSE_NoOfSoldCarExcelDataArr.length))
          autoCardFlag = true;
        else {
          if (formData.QC.autoCard === "yes")
            autoCardFlag = false;
        }
        if (formData.QC.EW === "yes" && (EWCheck >= DSE_NoOfSoldCarExcelDataArr.length))
          EWFlag = true;
        else {
          if (formData.QC.EW === "yes")
            EWFlag = false;
        }
        if (EWFlag && autoCardFlag) {
          obj = {
            ...obj,
            ...carObj,
            "Focus Model Qualification": "YES",
            "Grand Total": numberCheck
          }
          qualifiedRM.push(obj)
        } else {
          obj = {
            ...obj,
            ...carObj,
            "Focus Model Qualification": "No",
            "Grand Total": numberCheck
          }
          nonQualifiedRM.push(obj)
        }
      }
    }
  })
  console.log("qualifiedRM : ", qualifiedRM)
  console.log("nonQualifiedRM : ", nonQualifiedRM)
  // console.log("Qualifying  DSE", qualifiedRM);

}

ipcMain.on('form-submit', (event, formData) => {
  console.log("Form Data Input", formData);
  const employeStatus = employeeStatusDataSheet;
  checkQualifingCondition(formData, employeStatus);
  perCarincentiveCalculation(formData);
  

});


ipcMain.on('file-selected-salesExcel', (event, path) => {
  const workbook = XLSX.readFile(path);
  const salesExcelSheetName = workbook.SheetNames[0];
  const salesExcelSheet = workbook.Sheets[salesExcelSheetName];
  const salesExcelSheetData = XLSX.utils.sheet_to_json(salesExcelSheet);
  salesExcelSheetData.shift();
  let salesExcelGroupedData = {};
  salesExcelSheetData.forEach(row => {
    const dseId = row['DSE ID'];
    if (!salesExcelGroupedData[dseId]) {
      salesExcelGroupedData[dseId] = [];
    }
    salesExcelGroupedData[dseId].push(row);
  });
  for (const key in salesExcelGroupedData) {
    if (salesExcelGroupedData.hasOwnProperty(key)) {
      const obj = {};
      obj[key] = salesExcelGroupedData[key];
      salesExcelDataSheet.push(obj);
    }
  }
  console.log("Object inside array Sales excel", JSON.stringify(salesExcelDataSheet));

  const employeeStatusSheetName = workbook.SheetNames[3];
  const employeeStatusSheet = workbook.Sheets[employeeStatusSheetName];
  employeeStatusDataSheet = XLSX.utils.sheet_to_json(employeeStatusSheet);
  console.log("Object inside array employeeStatus", JSON.stringify(employeeStatusDataSheet));
});


ipcMain.on('file-selected-CDIScore', (event, path) => {
  const workbook = XLSX.readFile(path);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const sheetData = XLSX.utils.sheet_to_json(sheet);
  let groupedData = {};
  sheetData.forEach(row => {
    const dseId = row['DSE ID'];
    if (!groupedData[dseId]) {
      groupedData[dseId] = [];
    }
    groupedData[dseId].push(row);
  });
  for (const key in groupedData) {
    if (groupedData.hasOwnProperty(key)) {
      const obj = {};
      obj[key] = groupedData[key];
      CDIScoreDataSheet.push(obj);
    }
  }
  console.log("Object inside array CDI Score", JSON.stringify(CDIScoreDataSheet));
});



app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
