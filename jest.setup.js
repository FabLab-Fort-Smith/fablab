// Runs before each test file. Sets dummy env so modules that construct clients
// at import time (e.g. src/lib/database.js -> new MongoClient(MONGODB_URI),
// src/lib/square.js) don't crash when a test only exercises pre-DB logic.
// DB-backed tests override MONGODB_URI via test/helpers/mongo.js.
process.env.MONGODB_URI ||= "mongodb://127.0.0.1:27017/the-lab-test";
process.env.MONGODB_NAME ||= "the-lab-test";
process.env.NEXT_PUBLIC_URL ||= "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL ||= "http://localhost:3000";
