import fs from 'node:fs';

const TodaysDateString: string = new Date().toDateString();

export default function Log ( message: string ) {

    if (!fs.existsSync("logs")) {
      fs.mkdirSync("logs");
      Log(`Debug log folder created`);
    }

    let content = `[${new Date().toUTCString()}] ${message}`;
    console.log(content);
  
    fs.writeFile(`logs/${TodaysDateString}.txt`, `${content}\n`, { flag: 'a+' }, err => {
      if (err) console.error(err);
    });
  
}