import Database from './db';
import express, { Request, Response } from "express";
import http from "http";
import crypto from 'crypto';
import cors from "cors";
import bcrypt from 'bcrypt';
import axios from 'axios';
import Log from './logger';
import path from 'path';

// Game Data
import Classes from './data/class_data';
import Races from './data/race_data';
import Factions from './data/faction_data';
import Attributes from './data/attribute_data';
// Items
// Abilities
// Skills

const app = express().options("*", cors()).use([
  express.urlencoded({ extended: true }),
  express.json(),
  express.static(__dirname)
]);

const Server: http.Server = http.createServer(app);
const DB: Database = new Database();

/* Environment Variables */
const ListenPort: string = process.env.PORT;
const DatabaseName: string = process.env.DATABASE;
const ServerName: string = process.env.SERVER;
const DbHost: string = process.env.DB_HOST;
const DbPass: string = process.env.DB_PASS;
const DbUser: string = process.env.DB_USER;
const Environment: string = process.env.ENVIRONMENT;

interface ServerInfo {
  name: string;
  address: string;
  players: number;
  status: string;
}

const Servers: {[key: string]: ServerInfo[]} = {

  'local': [
    { name: "Skyhaven", address: "http://localhost:8082", players: 0, status: "" },
  ],

  'live': [
    // get you some
  ]

};

/* Boot up the server */
(async () => {
  try {

    Log(`${ServerName} starting - ENVIRONMENT: (${Environment}) PORT: (${ListenPort}) SERVER: (${ServerName}) DB: (${DatabaseName}) HOST: (${DbHost}) PASS: (${DbPass}) USER: (${DbUser})`);

    await DB.Connect(DatabaseName, DbHost, DbPass, DbUser);

    // get master data

    await RefreshRealmList();

    Server.listen(ListenPort, () => {
      Log(`${ServerName} finished start up and is running on port: ${ListenPort}`);
      setInterval(RefreshRealmList, 60000);
    });

  } catch ( error ) {

    Log(`${error}`);

  }

})();

// Check each game server at regular intervals for player count and status
async function RefreshRealmList(): Promise<boolean> {
  Log("Refreshing realm list");
  try {
    for (const server of Servers[Environment]) {
      try {
        const response = await axios.post<{ players: number }>(`${server.address}/server_status`);
        server.players = response.data.players;
        server.status = "Online";
        Log(`${server.name} (${server.address}) - Online`);
      } catch ( error ) {
        server.players = 0;
        server.status = "Offline";
        Log(`${server.name} (${server.address}) - Could not get status of realm: ${error}`);
      }
    }
  } catch ( error ) {
    Log(`${error}`);
  }
  return true;
}

app.post('/status', async ( request: Request, response: Response ) => {
  response.header("Access-Control-Allow-Origin", "*");
  response.json({ success: true });
});

app.get('/realm_data', async ( request: Request, response: Response ) => {
  response.header("Access-Control-Allow-Origin", "*");

  console.log(`REALM DATA REQUEST FROM: ${request.socket.remoteAddress}`);

  // Check if the requesting ip is associated with a realm
  let valid = false;
  for (const server of Servers[Environment]) {
    if ( server.address == request.socket.remoteAddress ) {
      valid = true;
      continue;
    }
  }

  if ( request.socket.remoteAddress == "::1" ) {
    valid = true;
  }

  if ( !valid ) {
    response.json({ success: false });
  } else {
    response.json({
      success: true,
      classes: Classes,
      factions: Factions,
      attributes: Attributes,
      races: Races
    });
  }

});

app.get('/download', async ( request: Request, response: Response ) => {
  response.header("Access-Control-Allow-Origin", "*");
  return response.download('./dist/build.zip', function(err) {
    if ( err ) { console.log(err); }
  })
});


app.get('/watcher', async ( request: Request, response: Response ) => {
  response.header("Access-Control-Allow-Origin", "*");
  let url = path.join(__dirname, "watcher.html");
  response.sendFile(url);
});

app.post('/create_account', async ( request: Request, response: Response ) => {

  response.header("Access-Control-Allow-Origin", "*");

  try {

    Log(`Account creation request from ${request.socket.remoteAddress}`);

    const Username: string = request.body.username;
    if ( Username == "" || Username.length < 6 ) {
      Log(`Username error, entered value: ${Username} (length: ${Username.length})`);
      return response.json({ success: false, message: "Username must be at least 6 characters" });
    }

    const [UsernameCheck] = await DB.Query("SELECT username FROM players WHERE username = ? LIMIT 1", [Username]);
    console.log(UsernameCheck);
    if ( UsernameCheck.length != 0 ) {
      Log(`Username error, username exists: ${Username}`);
      return response.json({ success: false, message: "This username is not available" });
    }

    const Password: string = request.body.password;
    if ( Password == "" || Password.length < 6 ) {
      Log(`Password error, entered value: ${Password} (length: ${Password.length})`);
      return response.json({ success: false, message: "Password must be at least 6 characters" });
    }

    const EmailAdd: string = request.body.email;
    if ( EmailAdd == "" || EmailAdd.length < 6 ) {
      Log(`Email error, entered value: ${EmailAdd} (length: ${EmailAdd.length})`);
      return response.json({ success: false, message: "Email address must be at least 6 characters" });
    }

    const [EmailCheck] = await DB.Query("SELECT email FROM players WHERE email = ? LIMIT 1", [EmailAdd]);
    console.log(EmailCheck);
    if ( EmailCheck.length != 0 ) {
      Log(`Email error, address already exists: ${EmailAdd}`);
      return response.json({ success: false, message: "This email address is not available" });
    }
    
    const EncryptedPassword: string = await bcrypt.hash(Password, 10);
    const SQL: string = 'INSERT INTO players VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const ID: string = crypto.randomUUID({disableEntropyCache: true});
    const Params = [ ID, Username, EmailAdd, EncryptedPassword, null, 0, new Date(), null, null, null ];
    const [Result] = await DB.Query(SQL, Params);

    if ( Result.affectedRows == 1 ) {
      Log(`New Account creation successful - ID: ${ID}`);
      return response.json({ success: true, message: "Account created succesfully" });
    }

    Log(`New Account creation failed`);
    return response.json({ success: false, message: "Failed to create new account" });

  } catch ( error: any ) {
    Log(`New Account creation failed - ${error}`);
    return response.json({ success: false, message: "Failed to create new account" });
  }

});

app.post('/login', async ( request: Request, response: Response ) => {

  response.header("Access-Control-Allow-Origin", "*");

  try {

    Log(`Login request from ${request.socket.remoteAddress} with username: ${request.body.username} and password: ${request.body.password}`);

    const Username: string = request.body.username;
    if ( Username == "" || Username.length < 6 ) {
      Log(`Username error, entered value: ${Username} (length: ${Username.length})`);
      return response.json({ success: false });
    }
      
    const Password: string = request.body.password;
    if ( Password == "" || Password.length < 6 ) {
      Log(`Password error, entered value: ${Password} (length: ${Password.length})`);
      return response.json({ success: false });
    }

    // Verify username
    const SQL = "SELECT id, username, password, banned FROM players WHERE username = ? LIMIT 1";
    const Params = [Username];
    const [User] = await DB.Query(SQL, Params);
    if ( User.length == 0 ) {
      Log(`Account not found looking for username: ${Username}`);
      return response.json({ success: false });
    }

    if ( User.banned == 1 ) {
      Log(`Login attempt from banned account: ${Username}`);
      return response.json({ success: false });
    }

    // Verify password
    const PasswordVerified = await bcrypt.compare(Password, User[0].password);
    if ( !PasswordVerified ) {
      Log(`invalid password entered: username: ${Username} - entered password: ${Password}`);
      return response.json({ success: false });
    }

    // Return account and game data
    Log(`Successful login: ${Username}`);

    return response.json({
      success: true,
      message: "Success",
      userid: User[0].id,
      username: User[0].username,
      classes: Classes,
      factions: Factions,
      attributes: Attributes,
      races: Races,
      servers: Servers[Environment]
    });

  } catch (error) {
    Log(`Login error: ${error}`);
    return response.json({ success: false });
  }
  
});
