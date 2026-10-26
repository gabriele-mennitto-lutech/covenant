const xlsx = require('xlsx');
const workbook = xlsx.readFile('../Excel/Lista siti.xlsx');
const sheet_name_list = workbook.SheetNames;
const xlData = xlsx.utils.sheet_to_json(workbook.Sheets['PRODUZIONE']);
console.log(JSON.stringify(xlData.slice(0, 5), null, 2));
