const fs = require("fs");
const key = fs.readFileSync("./book_courier-firebase-admin_sdk.json", "utf8");
const base64 = Buffer.from(key).toString("base64");
console.log(base64);
