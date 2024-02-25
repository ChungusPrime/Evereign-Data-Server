import mysql from "mysql2/promise";
import Log from './logger';

export default class Database {
  
  connection: mysql.Connection;
  credentials = { host: '', user: '', password: '', database: '' };

  async Connect ( database: string, host: string, pass: string, user: string ) {
    this.credentials.database = database;
    this.credentials.user = user;
    this.credentials.password = pass;
    this.credentials.host = host;
    try {
      this.connection = await mysql.createConnection(this.credentials);
      Log('Database connection established...');
    } catch ( error ) {
      Log(error);
    }
  }

  async Query ( statement: string, params: any ): Promise<any> {
    try {
      const Result = await this.connection.query(statement, params);
      return Result;
    } catch (error) {
      Log(error);
    }
  }

}